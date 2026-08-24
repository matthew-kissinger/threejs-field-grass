// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Matthew Kissinger
/**
 * The grass shader: wind, bodies, and colour, all TSL, one source for both
 * backends. There is no ShaderMaterial, onBeforeCompile hook, or backend fork.
 *
 * Everything happens at the tuft's ROOT and is then spread up the blade. The
 * root is an instanced attribute rather than the vertex's own world position,
 * for one reason: every blade in a clump has to sample the same gust and the
 * same body, or the clump shears instead of swaying. What varies per vertex is
 * only how far up the blade the vertex is.
 *
 * WIND. Three rotated flow octaves, with variation held to 0.35-0.65. One octave
 * reads as a single coherent wavefront marching across the field, which looks
 * like a machine. Three, rotated off each other and running at different rates,
 * average into flow: fronts that form, cross and dissolve. The whole field
 * shares one travelling frame, so a gust crosses 200 m as one event rather than
 * as two hundred metres of independent wobble.
 *
 * BODIES. Four nearby bodies per
 * blade, looked up through the CPU-built grid. The footprint is an oriented
 * rounded rectangle in the body's own frame - never a world-axis ellipse - so a
 * actor turning through the grass turns its pressed patch with it. Age comes back
 * from the same texel and drives a spring response that crosses zero and
 * returns slightly negative, which is the grass standing up and overshooting.
 *
 * COLOUR. One public palette drives root, tip, healthy and trodden tones. The
 * material carries its own compact three-band directional ramp so it can live
 * outside any one game's lighting library.
 */

import * as THREE from 'three/webgpu';
import {
  abs,
  clamp,
  color,
  cos,
  dot,
  Fn,
  float,
  fract,
  length,
  max as tslMax,
  min as tslMin,
  mix,
  normalize,
  pow,
  positionLocal,
  normalWorld,
  sin,
  smoothstep,
  step,
  texture,
  time,
  uniform,
  uv,
  vec2,
  vec3,
  instancedBufferAttribute,
  type TSLNode,
} from './nodes';
import {
  INTERACTION_KIND_OFFSET,
  type InteractionField,
} from './interactionField';

const TAU = Math.PI * 2;

// --- wind -------------------------------------------------------------------

/** Where the wind comes FROM, as the unit direction it pushes toward. It rakes
 *  across both gameplay cameras rather than along them, so a gust crosses the
 *  frame instead of receding up it. */
const WIND_X = 0.76;
const WIND_Z = 0.65;
/** How fast the whole flow frame travels, m/s. A gust crosses the 200 m field
 *  in half a minute: weather, not a conveyor belt. */
const WIND_SPEED = 6.5;

/**
 * The three octaves: rotation of the sample plane in radians, spatial frequency
 * in cycles per metre, and how fast the octave churns inside the travelling
 * frame. The rotations are the load-bearing part - unrotated octaves stack
 * their features on the same axes and the sum is still one wavefront.
 */
const OCTAVES = [
  { angle: 0, frequency: 0.03, evolve: 0.35, weight: 0.55 },
  { angle: 0.9, frequency: 0.092, evolve: 0.8, weight: 0.3 },
  { angle: -1.7, frequency: 0.27, evolve: 1.6, weight: 0.15 },
] as const;

/** The gust envelope never leaves this authored band. */
const VARIATION_MIN = 0.35;
const VARIATION_MAX = 0.65;

/** Metres a tip travels at variation 1.0. The band above turns this into
 *  0.13 m to 0.25 m of sway on a 0.44 m blade: visible from the beauty camera,
 *  not a wheat field in a gale. */
const WIND_REACH = 0.38;
/** Sway grows as t^this up the blade. Roots are planted; tips are not. */
const BEND_POWER = 1.6;
/** How far the wind may swing off its base direction, per octave. */
const SWIRL_MID = 0.42;
const SWIRL_FINE = 0.3;
/** Per-blade flutter: the small shiver that keeps a clump from moving as one
 *  rigid object. Tip only, hence the cube. */
const FLUTTER_RATE = 5.2;
const FLUTTER_AMP = 0.035;
/** A bent blade is shorter. Keeps the arc roughly isometric under sway. */
const BEND_DROP = 0.55;
/** Feathered interaction handoff. Fine motion yields before the slow gust. */
const PRESS_WIND_MASK_START = 0.018;
const PRESS_WIND_MASK_END = 0.16;
const PRESS_FINE_MASK_START = 0.004;
const PRESS_FINE_MASK_END = 0.075;
const PRESSED_COARSE_RETENTION = 0.22;
const PRESSED_DETAIL_RETENTION = 0.06;
const PRESSED_FLUTTER_RETENTION = 0.015;

// --- bodies -----------------------------------------------------------------

/** Fraction of the sideways push that also presses the blade down. At 0.58 m
 *  of push that is 0.42 m of flatten, which lays a 0.52 m blade over. */
const FLATTEN = 0.72;

/**
 * The recovery spring, as a pure function of a ghost's age in seconds.
 *
 *   1.0 while the body is there, through zero one third of the way through the
 *   configured trail age, through one small negative overshoot, and exactly 0
 *   when the interaction field expires the record.
 *
 * The negative lobe is the overshoot: the blades that were pushed away lean
 * back past upright before settling. The envelope reaches zero rather than
 * decaying asymptotically because the trail is finite - the oldest ghost has to
 * be able to leave without a step (see interactionField.ts).
 */
const SPRING_SHAPE = 2.4;
const DEFAULT_SPRING_SECONDS = 0.92;

/**
 * The same curve in plain numbers, so the trail lengths in interactionField.ts
 * can be held against it by a test instead of by a comment. It is written here,
 * three lines from the node expression it mirrors, because two copies of a
 * formula that sit next to each other cannot drift unseen; two copies in
 * different files can.
 */
export function springResponse(age: number, duration = DEFAULT_SPRING_SECONDS): number {
  const envelope = Math.max(0, Math.min(1, 1 - age / duration)) ** SPRING_SHAPE;
  return envelope * Math.cos((age / duration) * Math.PI * 1.5);
}

// --- colour -----------------------------------------------------------------

/** Linear multiplier turning the pasture green into the tone at a blade's
 *  root, where light does not reach. Cool, not black: shadows keep their hue. */
const ROOT_SHADE = [0.55, 0.66, 0.8] as const;
/** How much of the sun's own halo the tips take. Grass that catches the light
 *  goes gold before it goes white, and this is the whole difference between a
 *  green field and a golden-hour one. */
const TIP_GOLD = 0.28;
/** Ambient occlusion at the base of a clump, so the mass sits INTO the ground
 *  instead of on top of it. Deep, and over a short run: at Classic distance
 *  this shadow between the clumps is the only thing that gives a whole frame of
 *  grass any depth at all. */
const ROOT_AO = 0.62;
const ROOT_AO_HEIGHT = 0.26;
/** Per-tuft brightness spread. Enough to break the mass, not enough to read as
 *  patchwork. */
const TINT_MIN = 0.86;
const TINT_MAX = 1.16;
/**
 * How far a clump's own colour may pull away from the pasture tone, toward the
 * duller surround green at one end and the light pasture green at the other.
 * Brightness variation alone reads as noise; hue variation reads as plants.
 */
const CLUMP_HUE = 0.45;
/** How trodden ground is coloured: the surround's duller green carried toward
 *  the pen floor's warm trodden earth. */
const WORN_EARTH = 0.35;
/** Painted breakup, at the SAME frequencies scene/Terrain.tsx uses for the
 *  ground, so a clump standing on a browner patch is itself browner. */
const PATCH_SCALE = 0.07;
const MOTTLE_SCALE = 0.26;
const MOTTLE_WEIGHT = 0.45;

export interface GrassMaterialStyle {
  /** Metres per second travelled by the shared wind frame. */
  readonly windSpeed: number;
  /** Relative contribution of the broad, middle, and fine wind octaves. */
  readonly octaveWeights: readonly [number, number, number];
  /** Maximum authored tip travel before the gust envelope is applied. */
  readonly windReach: number;
  readonly flutterRate: number;
  readonly flutterAmplitude: number;
  readonly tipGold: number;
  readonly tintMin: number;
  readonly tintMax: number;
  readonly clumpHue: number;
}

export const DEFAULT_GRASS_STYLE: GrassMaterialStyle = {
  windSpeed: WIND_SPEED,
  octaveWeights: [OCTAVES[0].weight, OCTAVES[1].weight, OCTAVES[2].weight],
  windReach: WIND_REACH,
  flutterRate: FLUTTER_RATE,
  flutterAmplitude: FLUTTER_AMP,
  tipGold: TIP_GOLD,
  tintMin: TINT_MIN,
  tintMax: TINT_MAX,
  clumpHue: CLUMP_HUE,
};

/** Original soft pastoral treatment: broad motion and restrained highlights. */
export const STORYBOOK_GRASS_STYLE: GrassMaterialStyle = {
  windSpeed: 3.8,
  octaveWeights: [0.72, 0.21, 0.07],
  windReach: 0.34,
  flutterRate: 3.1,
  flutterAmplitude: 0.012,
  tipGold: 0.16,
  tintMin: 0.92,
  tintMax: 1.08,
  clumpHue: 0.34,
};

export interface GrassMaterialInputs {
  /** Per-tuft (worldX, worldZ, seed, vigour). See tuftData.ts. */
  readonly tufts: THREE.InstancedBufferAttribute;
  /** Omit on distant tiers that cannot be reached by a moving body. */
  readonly interaction?: InteractionField | null;
  readonly palette?: Partial<GrassPalette>;
  readonly style?: GrassMaterialStyle;
  readonly sunDirection?: THREE.Vector3;
}

export interface GrassPalette {
  readonly dark: string;
  readonly light: string;
  readonly surround: string;
  readonly wornEarth: string;
  readonly sunGlow: string;
}

export const DEFAULT_GRASS_PALETTE: GrassPalette = {
  dark: '#87995f',
  light: '#a7b76c',
  surround: '#8b9468',
  wornEarth: '#c0a074',
  sunGlow: '#ffc582',
};

const DEFAULT_SUN = new THREE.Vector3(-0.637, 0.139, 0.759).normalize();

function makeToonMaterial(base: TSLNode, sunDirection: THREE.Vector3): THREE.MeshBasicNodeMaterial {
  const material = new THREE.MeshBasicNodeMaterial();
  const sun = uniform(sunDirection) as TSLNode;
  const nDotL = dot(normalWorld, sun).mul(0.5).add(0.5);
  const shadow = base.mul(vec3(0.46, 0.55, 0.8)).add(vec3(0.015, 0.021, 0.038));
  const middle = base.mul(vec3(1.02, 0.97, 0.93));
  const lit = base.mul(vec3(1.3, 1.17, 0.96));
  const outOfShadow = smoothstep(float(0.385), float(0.455), nDotL);
  const intoKey = smoothstep(float(0.545), float(0.615), nDotL);
  material.colorNode = mix(mix(shadow, middle, outOfShadow), lit, intoKey);
  return material;
}

/**
 * A compact deterministic field in roughly [-1, 1]. The inner stroke warps
 * the outer one, so neither wind nor colour resolves into straight sine bands.
 * Keeping this graph to two sine operations avoids MaterialX noise's large
 * generated helper library while retaining coherent authored-scale features.
 */
function sineHashField(
  root: TSLNode,
  frequency: number,
  angle: number,
  phase: TSLNode,
): TSLNode {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const x = root.x.mul(float(c)).add(root.y.mul(float(s))).mul(float(frequency * TAU));
  const z = root.y.mul(float(c)).sub(root.x.mul(float(s))).mul(float(frequency * TAU));
  const cross = sin(
    z.mul(float(1.37))
      .sub(x.mul(float(0.43)))
      .sub(phase.mul(float(0.73))),
  );
  return sin(x.add(z.mul(float(0.61))).add(phase).add(cross.mul(float(0.72))));
}

/** One octave of travelling, rotated flow, in roughly [-1, 1]. */
function octave(root: TSLNode, travel: TSLNode, index: number): TSLNode {
  const { angle, frequency, evolve } = OCTAVES[index]!;
  const flow = root.sub(travel);
  return sineHashField(flow, frequency, angle, time.mul(float(evolve)));
}

/**
 * What one body does to a blade at `root`. `slot` is the interactor texture's
 * u coordinate, or 0 for an empty slot - which multiplies the whole result away
 * rather than branching, because the four slots of a cell are either all empty
 * (most of the field, most of the time) or a coherent handful, and a masked
 * multiply costs less than a divergent branch either way.
 */
function bodyPush(
  root: TSLNode,
  slot: TSLNode,
  record: TSLNode,
  interaction: InteractionField,
): TSLNode {
  const raw = record.z;
  // Kind rides on the heading (interactionField.ts): the angle is bounded by
  // pi, so anything past half the offset selects the second footprint.
  const kind = step(float(INTERACTION_KIND_OFFSET / 2), raw);
  const heading = raw.sub(kind.mul(float(INTERACTION_KIND_OFFSET)));
  const forward = vec2(cos(heading), sin(heading));
  const right = vec2(forward.y, forward.x.negate());

  const offset = root.sub(record.xy);
  // The body's own frame: x across it, y along its facing.
  const local = vec2(dot(offset, right), dot(offset, forward));
  const [first, second] = interaction.config.footprints;
  const halfWid = mix(float(first.halfWidth), float(second.halfWidth), kind);
  const halfLen = mix(float(first.halfLength), float(second.halfLength), kind);
  const falloff = mix(float(first.falloff), float(second.falloff), kind);

  // Rounded-rect SDF: negative inside the body, 0 on its edge, metres outside.
  const q = abs(local).sub(vec2(halfWid, halfLen));
  const sdf = length(tslMax(q, vec2(0, 0))).add(tslMin(tslMax(q.x, q.y), float(0)));
  const t = clamp(sdf.div(falloff), float(0), float(1));
  const press = float(1).sub(t.mul(t).mul(float(3).sub(t.mul(float(2)))));

  const age = record.w;
  const duration = interaction.config.maxAge;
  const envelope = pow(
    clamp(float(1).sub(age.div(float(duration))), float(0), float(1)),
    float(SPRING_SHAPE),
  );
  const isGhost = step(float(0.0001), age);
  const birth = mix(
    float(1),
    smoothstep(float(0), float(Math.min(interaction.config.ghostBirthDuration, duration * 0.25)), age),
    isGhost,
  );
  const response = envelope
    .mul(cos(age.div(float(duration)).mul(float(Math.PI * 1.5))))
    .mul(birth);

  const strength = press
    .mul(response)
    .mul(step(float(0.0001), slot))
    .mul(float(interaction.config.strength));
  // Away from the body centre. The fallback matters only at the exact centre,
  // where the blade is under the body and its direction is arbitrary anyway.
  const away = offset.div(tslMax(length(offset), float(0.001)));
  return vec3(away.x.mul(strength), strength.mul(float(FLATTEN)).negate(), away.y.mul(strength));
}

export function makeGrassMaterial(inputs: GrassMaterialInputs): THREE.MeshBasicNodeMaterial {
  const palette: GrassPalette = { ...DEFAULT_GRASS_PALETTE, ...inputs.palette };
  const style = inputs.style ?? DEFAULT_GRASS_STYLE;
  const tuft: TSLNode = instancedBufferAttribute(inputs.tufts, 'vec4');
  const root = tuft.xy;
  const seed = tuft.z;
  const vigour = tuft.w;

  const across = uv().x;
  const along = uv().y;
  const phase = uv(1).x;
  const stature = uv(1).y;

  // --- wind -----------------------------------------------------------------

  const travel = vec2(float(WIND_X), float(WIND_Z)).mul(time.mul(float(style.windSpeed)));
  const coarse = octave(root, travel, 0);
  const middle = octave(root, travel, 1);
  const fine = octave(root, travel, 2);

  const flow = coarse
    .mul(float(style.octaveWeights[0]))
    .add(middle.mul(float(style.octaveWeights[1])))
    .add(fine.mul(float(style.octaveWeights[2])));
  const gust = clamp(flow.mul(float(0.5)).add(float(0.5)), float(0), float(1));
  const variation = mix(float(VARIATION_MIN), float(VARIATION_MAX), gust);
  const coarseGust = clamp(coarse.mul(float(0.5)).add(float(0.5)), float(0), float(1));
  const coarseVariation = mix(float(VARIATION_MIN), float(VARIATION_MAX), coarseGust);

  // The direction swings with the two finer octaves, so a gust arrives at a
  // slightly different angle everywhere it touches.
  const swirl = middle.mul(float(SWIRL_MID)).add(fine.mul(float(SWIRL_FINE)));
  const perpendicular = vec2(float(-WIND_Z), float(WIND_X));
  const direction = normalize(
    vec2(float(WIND_X), float(WIND_Z)).add(perpendicular.mul(swirl)),
  );
  const coarseDirection = normalize(vec2(float(WIND_X), float(WIND_Z)));

  const reach = pow(along, float(BEND_POWER));
  const flutter = sin(time.mul(float(style.flutterRate)).add(phase.mul(float(TAU))).add(seed.mul(float(41.7))));
  const windSway = variation
    .mul(float(style.windReach))
    .mul(stature)
    .mul(reach);
  const coarseSway = coarseVariation
    .mul(float(style.windReach))
    .mul(stature)
    .mul(reach);
  const detailSway = windSway.sub(coarseSway);
  const flutterSway = flutter.mul(float(style.flutterAmplitude)).mul(reach.mul(along));

  // --- bodies ---------------------------------------------------------------

  let coarseRetention: TSLNode = float(1);
  let detailRetention: TSLNode = float(1);
  let flutterRetention: TSLNode = float(1);
  let bodyX: TSLNode = float(0);
  let bodyZ: TSLNode = float(0);
  let bodyY: TSLNode = float(0);

  if (inputs.interaction) {
    const interaction = inputs.interaction;
    const { interactors, cells, config } = interaction;
    // Keep the four-body visual contract but emit one reusable shader function
    // instead of inlining the rounded-rectangle footprint graph four times.
    // This is an exact algebraic refactor: the slots, texture and response are
    // unchanged, while cold node building and generated source are bounded.
    const evaluateBodyPush = Fn(
      ([at, slot, record]: TSLNode[]) => bodyPush(at, slot, record, interaction),
      { at: 'vec2', slot: 'float', record: 'vec4', return: 'vec3' },
    );
    const cellUV = vec2(
      root.x.sub(float(config.minX)).div(float(config.maxX - config.minX)),
      root.y.sub(float(config.minZ)).div(float(config.maxZ - config.minZ)),
    );
    const slots: TSLNode = texture(cells, cellUV, 0);
    // Sample the records in the caller. Capturing a texture inside a reusable
    // Fn can omit its uniform dependency from generated WGSL, leaving the
    // textureDimensions call with an unresolved nodeUniform.
    const recordX: TSLNode = texture(interactors, vec2(slots.x, float(0.5)), 0);
    const recordY: TSLNode = texture(interactors, vec2(slots.y, float(0.5)), 0);
    const recordZ: TSLNode = texture(interactors, vec2(slots.z, float(0.5)), 0);
    const recordW: TSLNode = texture(interactors, vec2(slots.w, float(0.5)), 0);
    const push = evaluateBodyPush(root, slots.x, recordX)
      .add(evaluateBodyPush(root, slots.y, recordY))
      .add(evaluateBodyPush(root, slots.z, recordZ))
      .add(evaluateBodyPush(root, slots.w, recordW));
    // Overlapping ghosts along a trail would otherwise stack into a shove no
    // single body ever applies; the cap is what keeps a wake flat rather than
    // explosive, and it is the carried strength, not a new number.
    const horizontal = vec2(push.x, push.z);
    const magnitude = length(horizontal);
    const capped = horizontal.mul(
      tslMin(magnitude, float(config.strength)).div(tslMax(magnitude, float(0.0001))),
    );
    const flattened = clamp(
      push.y,
      float(-config.strength * FLATTEN),
      float(config.strength * FLATTEN * 0.5),
    );
    const horizontalPress = clamp(magnitude.div(float(config.strength)), float(0), float(1));
    const verticalPress = clamp(
      abs(flattened).div(float(config.strength * FLATTEN)),
      float(0),
      float(1),
    );
    const localPress = tslMax(horizontalPress, verticalPress);
    const windMask = smoothstep(
      float(PRESS_WIND_MASK_START),
      float(PRESS_WIND_MASK_END),
      localPress,
    );
    const fineMask = smoothstep(
      float(PRESS_FINE_MASK_START),
      float(PRESS_FINE_MASK_END),
      localPress,
    );
    coarseRetention = mix(float(1), float(PRESSED_COARSE_RETENTION), windMask);
    detailRetention = mix(float(1), float(PRESSED_DETAIL_RETENTION), fineMask);
    flutterRetention = mix(float(1), float(PRESSED_FLUTTER_RETENTION), fineMask);
    bodyX = capped.x;
    bodyZ = capped.y;
    bodyY = flattened;
  }

  // Pressure-aware wind is applied before final displacement. A flattened
  // blade retains a little slow field motion but loses almost all fine tip
  // flutter, preventing a pressed strip from looking stretched or electrified.
  const coarseOffset = coarseDirection.mul(coarseSway.mul(coarseRetention));
  const fineSway = detailSway.mul(detailRetention).add(flutterSway.mul(flutterRetention));
  const windOffset = coarseOffset.add(direction.mul(fineSway));
  const sway = coarseSway.mul(coarseRetention).add(fineSway);
  const displaceX = windOffset.x.add(bodyX.mul(reach));
  const displaceZ = windOffset.y.add(bodyZ.mul(reach));
  const displaceY = sway
    .mul(sway)
    .mul(float(BEND_DROP))
    .negate()
    .add(bodyY.mul(reach));

  // --- colour ---------------------------------------------------------------

  const patches = sineHashField(root, PATCH_SCALE, 0.38, float(0.7));
  const mottle = sineHashField(root, MOTTLE_SCALE, -1.13, float(2.4));
  const blend = smoothstep(
    float(-0.35),
    float(0.35),
    patches.add(mottle.mul(float(MOTTLE_WEIGHT))),
  );

  // Each clump draws its own tone off its baked seed, so neighbours differ in
  // hue and not only in brightness.
  const clumpTone = mix(
    color(palette.surround),
    color(palette.light),
    smoothstep(float(0.12), float(0.88), fract(seed.mul(float(19.73)))),
  );
  const ground = mix(color(palette.dark), color(palette.light), blend);
  const pasture = mix(ground, clumpTone, float(style.clumpHue));
  const rootTone = color(palette.dark).mul(vec3(...ROOT_SHADE));
  const tipTone = mix(color(palette.light), color(palette.sunGlow), float(style.tipGold));

  const stalk = mix(rootTone, pasture, smoothstep(float(0.02), float(0.46), along));
  const lit = mix(stalk, tipTone, smoothstep(float(0.48), float(1), along));

  // Trodden ground: the surround's duller green carried toward the pen floor's
  // warm earth, faded in by the baked vigour.
  const worn = mix(color(palette.surround), color(palette.wornEarth), float(WORN_EARTH));
  const health = mix(worn, lit, smoothstep(float(0.32), float(0.94), vigour));

  const tint = mix(float(style.tintMin), float(style.tintMax), fract(seed.mul(float(7.31))));
  const occlusion = mix(
    float(ROOT_AO),
    float(1),
    smoothstep(float(0), float(ROOT_AO_HEIGHT), along),
  );
  // A little darker at the two long edges, so a flat strip of triangles reads
  // as a strand with a spine.
  const spine = mix(float(0.9), float(1), sin(across.mul(float(Math.PI))));

  const material = makeToonMaterial(
    health.mul(tint).mul(occlusion).mul(spine),
    inputs.sunDirection ?? DEFAULT_SUN,
  );
  material.positionNode = positionLocal.add(vec3(displaceX, displaceY, displaceZ));
  // Blades are strips: half of them are seen from behind at any moment, and
  // three flips the normal for those so the far side lights as the far side.
  material.side = THREE.DoubleSide;
  return material;
}
