// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Matthew Kissinger

import * as THREE from 'three/webgpu';

export const INTERACTION_KIND_OFFSET = 64;

export interface InteractionFootprint {
  readonly halfLength: number;
  readonly halfWidth: number;
  readonly falloff: number;
}

export interface GrassInteractor {
  /** Stable integer in [0, maxBodies). It owns one zero-allocation trail. */
  readonly slot: number;
  readonly x: number;
  readonly z: number;
  /** Heading in radians, with local forward along +x. */
  readonly heading: number;
  /** Selects footprints[0] or footprints[1]. */
  readonly kind?: 0 | 1;
  readonly active?: boolean;
  /** Lower values win when more than four bodies overlap one grid cell. */
  readonly priority?: number;
}

export interface InteractionFieldConfig {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly cellSize: number;
  readonly maxBodies: number;
  readonly ghostsPerBody: number;
  /** Seconds for a newly deposited wake sample to reach full strength. */
  readonly ghostBirthDuration: number;
  /** A new wake sample is emitted only after the body moves this far. */
  readonly minGhostDistance: number;
  readonly maxAge: number;
  readonly strength: number;
  readonly footprints: readonly [InteractionFootprint, InteractionFootprint];
}

export const DEFAULT_INTERACTION_CONFIG: InteractionFieldConfig = {
  minX: -50,
  maxX: 50,
  minZ: -50,
  maxZ: 50,
  cellSize: 2.5,
  maxBodies: 32,
  ghostsPerBody: 8,
  ghostBirthDuration: 0.135,
  minGhostDistance: 0.58,
  maxAge: 0.92,
  strength: 0.58,
  footprints: [
    { halfLength: 1.16, halfWidth: 0.48, falloff: 0.68 },
    { halfLength: 1.68, halfWidth: 0.6, falloff: 0.68 },
  ],
};

export interface InteractionField {
  readonly config: InteractionFieldConfig;
  /** RGBA32F: x, z, heading + kind * offset, age. */
  readonly interactors: THREE.DataTexture;
  /** RGBA32F: four normalized interactor texture coordinates per cell. */
  readonly cells: THREE.DataTexture;
  readonly gridColumns: number;
  readonly gridRows: number;
  readonly activeInteractorCount: number;
  update(dt: number, bodies: readonly GrassInteractor[]): void;
  reset(): void;
  dispose(): void;
}

function dataTexture(data: Float32Array, width: number, height: number): THREE.DataTexture {
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

export function createInteractionField(
  overrides: Partial<InteractionFieldConfig> = {},
): InteractionField {
  const config: InteractionFieldConfig = {
    ...DEFAULT_INTERACTION_CONFIG,
    ...overrides,
    footprints: overrides.footprints ?? DEFAULT_INTERACTION_CONFIG.footprints,
  };
  if (
    config.maxBodies < 1
    || config.ghostsPerBody < 0
    || config.cellSize <= 0
    || config.strength <= 0
    || config.ghostBirthDuration <= 0
    || config.minGhostDistance <= 0
    || config.maxAge <= 0
  ) {
    throw new Error('Interaction field needs positive bounds/spacing/strength and non-negative ghostsPerBody');
  }
  const gridColumns = Math.max(1, Math.ceil((config.maxX - config.minX) / config.cellSize));
  const gridRows = Math.max(1, Math.ceil((config.maxZ - config.minZ) / config.cellSize));
  const maxInteractors = config.maxBodies * (config.ghostsPerBody + 1);
  const interactorData = new Float32Array(maxInteractors * 4);
  const cellData = new Float32Array(gridColumns * gridRows * 4);
  const cellKeys = new Float32Array(gridColumns * gridRows * 4);
  const interactors = dataTexture(interactorData, maxInteractors, 1);
  const cells = dataTexture(cellData, gridColumns, gridRows);
  const trailData = new Float32Array(config.maxBodies * config.ghostsPerBody * 4);
  const trailTime = new Float32Array(config.maxBodies * config.ghostsPerBody).fill(-Infinity);
  // Double precision prevents the fixed spatial sampler from gaining or
  // losing an endpoint solely because a 30/60/120 Hz path rounded differently.
  const lastGhostX = new Float64Array(config.maxBodies);
  const lastGhostZ = new Float64Array(config.maxBodies);
  const lastGhostHeading = new Float32Array(config.maxBodies);
  const lastGhostKind = new Uint8Array(config.maxBodies);
  const lastGhostValid = new Uint8Array(config.maxBodies);
  const activeSlots = new Uint8Array(config.maxBodies);
  const presentSlots = new Uint8Array(config.maxBodies);
  let elapsed = 0;
  const ghostCursor = new Uint32Array(config.maxBodies);
  const lastObservedX = new Float64Array(config.maxBodies);
  const lastObservedZ = new Float64Array(config.maxBodies);
  let count = 0;

  const influence = Math.max(
    ...config.footprints.map((footprint) =>
      Math.max(footprint.halfLength, footprint.halfWidth) + footprint.falloff),
  );

  function add(
    x: number,
    z: number,
    heading: number,
    kind: 0 | 1,
    priority: number,
    age: number,
  ): void {
    if (count >= maxInteractors) return;
    const index = count++;
    const base = index * 4;
    interactorData[base] = x;
    interactorData[base + 1] = z;
    interactorData[base + 2] = heading + kind * INTERACTION_KIND_OFFSET;
    interactorData[base + 3] = age;
    const textureU = (index + 0.5) / maxInteractors;

    const x0 = Math.max(0, Math.floor((x - influence - config.minX) / config.cellSize));
    const x1 = Math.min(gridColumns - 1, Math.floor((x + influence - config.minX) / config.cellSize));
    const z0 = Math.max(0, Math.floor((z - influence - config.minZ) / config.cellSize));
    const z1 = Math.min(gridRows - 1, Math.floor((z + influence - config.minZ) / config.cellSize));
    for (let zCell = z0; zCell <= z1; zCell++) {
      const cellZ = config.minZ + (zCell + 0.5) * config.cellSize;
      for (let xCell = x0; xCell <= x1; xCell++) {
        const cellX = config.minX + (xCell + 0.5) * config.cellSize;
        const key = Math.max(Math.abs(x - cellX), Math.abs(z - cellZ)) + priority;
        const slotBase = (zCell * gridColumns + xCell) * 4;
        let target = -1;
        let worst = key;
        for (let slot = 0; slot < 4; slot++) {
          if (cellData[slotBase + slot] === 0) {
            target = slot;
            break;
          }
          if (cellKeys[slotBase + slot]! > worst) {
            worst = cellKeys[slotBase + slot]!;
            target = slot;
          }
        }
        if (target >= 0) {
          cellData[slotBase + target] = textureU;
          cellKeys[slotBase + target] = key;
        }
      }
    }
  }

  function reset(): void {
    elapsed = 0;
    ghostCursor.fill(0);
    count = 0;
    interactorData.fill(0);
    cellData.fill(0);
    cellKeys.fill(0);
    trailData.fill(0);
    trailTime.fill(-Infinity);
    lastGhostX.fill(0);
    lastGhostZ.fill(0);
    lastGhostHeading.fill(0);
    lastGhostKind.fill(0);
    lastGhostValid.fill(0);
    lastObservedX.fill(0);
    lastObservedZ.fill(0);
    activeSlots.fill(0);
    presentSlots.fill(0);
    interactors.needsUpdate = true;
    cells.needsUpdate = true;
  }

  return {
    config,
    interactors,
    cells,
    gridColumns,
    gridRows,
    get activeInteractorCount(): number {
      return count;
    },
    update(dt, bodies): void {
      elapsed += Math.max(0, dt);
      presentSlots.fill(0);
      for (let bodyIndex = 0; bodyIndex < bodies.length; bodyIndex++) {
        const body = bodies[bodyIndex]!;
        if (body.active === false || body.slot < 0 || body.slot >= config.maxBodies) continue;
        presentSlots[body.slot] = 1;
      }
      for (let slot = 0; slot < config.maxBodies; slot++) {
        if (presentSlots[slot] !== 0 || activeSlots[slot] === 0) continue;
        activeSlots[slot] = 0;
        lastGhostValid[slot] = 0;
        for (let ghost = 0; ghost < config.ghostsPerBody; ghost++) {
          trailTime[slot * config.ghostsPerBody + ghost] = -Infinity;
        }
      }
      if (config.ghostsPerBody > 0) {
        for (let bodyIndex = 0; bodyIndex < bodies.length; bodyIndex++) {
          const body = bodies[bodyIndex]!;
          if (body.active === false || body.slot < 0 || body.slot >= config.maxBodies) continue;
          const bodySlot = body.slot;
          activeSlots[bodySlot] = 1;
          if (lastGhostValid[bodySlot] === 0) {
            lastGhostX[bodySlot] = body.x;
            lastGhostZ[bodySlot] = body.z;
            lastGhostHeading[bodySlot] = body.heading;
            lastGhostKind[bodySlot] = body.kind ?? 0;
            lastGhostValid[bodySlot] = 1;
            lastObservedX[bodySlot] = body.x;
            lastObservedZ[bodySlot] = body.z;
            continue;
          }
          const previousX = lastObservedX[bodySlot]!;
          const previousZ = lastObservedZ[bodySlot]!;
          const frameDx = body.x - previousX;
          const frameDz = body.z - previousZ;
          const frameDistance = Math.hypot(frameDx, frameDz);
          let anchorDx = body.x - lastGhostX[bodySlot]!;
          let anchorDz = body.z - lastGhostZ[bodySlot]!;
          let anchorDistance = Math.hypot(anchorDx, anchorDz);
          while (anchorDistance + config.minGhostDistance * 1e-4 >= config.minGhostDistance) {
            const cursor = ghostCursor[bodySlot]! % config.ghostsPerBody;
            const trail = bodySlot * config.ghostsPerBody + cursor;
            const existingAge = elapsed - trailTime[trail]!;
            // Never evict a visible record. Its spring reaches exactly zero at
            // maxAge, so reuse after expiry cannot pop a pressed patch away.
            if (existingAge >= config.maxAge) {
              trailData[trail * 4] = lastGhostX[bodySlot]!;
              trailData[trail * 4 + 1] = lastGhostZ[bodySlot]!;
              trailData[trail * 4 + 2] = lastGhostHeading[bodySlot]!;
              trailData[trail * 4 + 3] = lastGhostKind[bodySlot]!;
              const directionX = anchorDx / anchorDistance;
              const directionZ = anchorDz / anchorDistance;
              const crossingX = lastGhostX[bodySlot]! + directionX * config.minGhostDistance;
              const crossingZ = lastGhostZ[bodySlot]! + directionZ * config.minGhostDistance;
              const alongFrame = frameDistance > 0
                ? ((crossingX - previousX) * frameDx + (crossingZ - previousZ) * frameDz)
                  / (frameDistance * frameDistance)
                : 1;
              trailTime[trail] = elapsed - Math.max(0, dt) * (1 - Math.max(0, Math.min(1, alongFrame)));
              ghostCursor[bodySlot] = ghostCursor[bodySlot]! + 1;
            }
            const directionX = anchorDx / anchorDistance;
            const directionZ = anchorDz / anchorDistance;
            lastGhostX[bodySlot] = lastGhostX[bodySlot]! + directionX * config.minGhostDistance;
            lastGhostZ[bodySlot] = lastGhostZ[bodySlot]! + directionZ * config.minGhostDistance;
            lastGhostHeading[bodySlot] = body.heading;
            lastGhostKind[bodySlot] = body.kind ?? 0;
            anchorDx = body.x - lastGhostX[bodySlot]!;
            anchorDz = body.z - lastGhostZ[bodySlot]!;
            anchorDistance = Math.hypot(anchorDx, anchorDz);
          }
          lastObservedX[bodySlot] = body.x;
          lastObservedZ[bodySlot] = body.z;
        }
      }

      count = 0;
      cellData.fill(0);
      cellKeys.fill(0);
      for (let bodyIndex = 0; bodyIndex < bodies.length; bodyIndex++) {
        const body = bodies[bodyIndex]!;
        if (body.active === false || body.slot < 0 || body.slot >= config.maxBodies) continue;
        add(body.x, body.z, body.heading, body.kind ?? 0, body.priority ?? 0, 0);
        for (let ghost = 0; ghost < config.ghostsPerBody; ghost++) {
          const trail = body.slot * config.ghostsPerBody + ghost;
          const age = elapsed - trailTime[trail]!;
          if (age < 0 || age > config.maxAge) continue;
          add(
            trailData[trail * 4]!,
            trailData[trail * 4 + 1]!,
            trailData[trail * 4 + 2]!,
            trailData[trail * 4 + 3] === 1 ? 1 : 0,
            body.priority ?? 0,
            Math.max(age, 0.0002),
          );
        }
      }
      interactors.needsUpdate = true;
      cells.needsUpdate = true;
    },
    reset,
    dispose(): void {
      interactors.dispose();
      cells.dispose();
    },
  };
}
