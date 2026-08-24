# Three.js Field Grass

Interactive TSL grass for Three.js.

Painterly field grass for Three.js, built for games that need a meadow to move
as one landscape and still react to bodies passing through it.

The package combines four small systems:

- deterministic baked scatter with prefix-safe quality tiers
- authored multi-blade tuft geometry with one instanced draw per layer
- a TSL-only material with three-octave wind and golden-hour colour
- a bounded CPU interaction grid that gives moving bodies a settling wake

There are no textures, downloaded models, runtime random placement, shader
forks, or sibling-repository imports. The core API is plain Three.js. A thin
React Three Fiber adapter is available at `threejs-field-grass/react`.

The hosted demo includes both a flat field and a compact island terrain example.
Its controls and terrain code are intentionally separate from both entry points.
OrbitControls, keyboard handling, and the touch direction pad are examples, not
runtime dependencies or public package API.

## Status

This is the local `0.1.0` extraction from Sheepdog Sim 3. The `threejs-field-grass`
package name is a release candidate and remains unpublished. The API is intentionally small, but it
should be treated as pre-1.0 until another game has integrated it.

## Requirements

- Three.js `0.185.x`
- `WebGPURenderer`, using WebGPU or its WebGL2 fallback
- React 19 and React Three Fiber 9 only when using the optional adapter

TSL APIs are still moving inside Three.js. The peer range is deliberately
narrow so a package upgrade cannot silently change generated WGSL or GLSL.

## Use from source

```bash
git clone https://github.com/matthew-kissinger/threejs-field-grass.git
cd threejs-field-grass
npm install
npm run bake
npm run dev
```

The default demo contains 18,000 tufts and 126,000 blades in one draw. Switch to
**Island Terrain** to see the same package integrated with a deterministic CPU
heightfield and simple water plane. Move the pale
capsule with WASD, arrow keys, or the on-screen direction pad. Drag the meadow
to orbit the camera and use the wheel or pinch gesture to zoom. The capsule's
wake exposes the spring recovery instead of hiding it in an automated loop.
Append `?backend=webgl2` to force the WebGL2 fallback for parity checks.

## Core Three.js API

```ts
import {
  createGrassLayer,
  createInteractionField,
  decodeTufts,
  groupFromManifest,
  type GrassManifest,
} from 'threejs-field-grass';

const records = await fetch('/grass/tufts.bin').then((response) => response.arrayBuffer());
const group = groupFromManifest(manifest as GrassManifest, 'meadow');
const buffers = decodeTufts(records, manifest as GrassManifest, group);

const interaction = createInteractionField({
  minX: -50,
  maxX: 50,
  minZ: -50,
  maxZ: 50,
  maxBodies: 16,
});

const grass = createGrassLayer(buffers, { interaction });
scene.add(grass.mesh);

// In the frame loop. `slot` stays stable for the lifetime of a body.
interaction.update(deltaSeconds, [
  { slot: 0, x: player.x, z: player.z, heading: player.heading },
]);

// At scene teardown.
grass.dispose();
interaction.dispose();
```

## React Three Fiber adapter

```tsx
import { GrassLayer } from 'threejs-field-grass/react';

<GrassLayer buffers={buffers} interaction={interaction} />
```

The adapter accepts decoded buffers instead of owning fetch or Suspense policy.
The game remains responsible for asset URLs, loading UI, interaction snapshots,
quality selection, and renderer initialization.

## Looks as data

`FIELD_GRASS_PRESET` preserves the original meadow treatment.
`STORYBOOK_GRASS_PRESET` is an original pastoral option, labelled Storygrass in
the demo, with five broad blades
per tuft, a soft hand-painted palette, slower large-scale wind, and restrained
tip highlights. Both are ordinary `GrassPreset` objects consumed by
`createGrassLayer`; there is no renderer mode or branded style branch.

```ts
import { createGrassLayer, STORYBOOK_GRASS_PRESET } from 'threejs-field-grass';

const grass = createGrassLayer(buffers, {
  interaction,
  preset: STORYBOOK_GRASS_PRESET,
});
```

## Bake your own field

`generateScatter` creates exact-count stratified groups. Its sampler owns ground
height, exclusions, vigour, and any game-specific density rule. `encodeScatter`
writes the compact 12-byte record consumed by `decodeTufts`.

```ts
const groups = generateScatter(recipe, (x, z) => ({
  y: terrain.groundY(x, z),
  accept: !insideBuilding(x, z),
  vigour: moistureAt(x, z),
}));

const { bytes, manifest } = encodeScatter('tools/bake-grass.ts', recipe, groups);
```

Commit both the recipe and its generated binary. A binary without a reproducible
recipe is not an acceptable source asset.

### Terrain example

The island in `demo/examples/island` is independently written demo code, not
part of the library. A single `Float32Array` heightfield supplies the rendered
vertices, triangle-aware `heightAt` grounding, smooth slope normals, and the
`generateScatter` sampler. The sampler rejects submerged and steep locations,
so the grass remains aligned to the same terrain truth as the capsule.

This architecture was informed by the general source-of-truth pattern used in
the author's Kiln Island prototype. No Kiln assets, game systems, or source code
are included here.

## Design boundaries

- One renderer path: `MeshBasicNodeMaterial` and TSL only.
- One draw per grass layer through `InstancedMesh`.
- No per-blade simulation state. Wake memory is a fixed body trail on the CPU.
- Wake records are spaced by `minGhostDistance` in world units, then eased in
  over `ghostBirthDuration`; sample placement is independent of frame rate.
- Four nearest interactors per grid cell. Dense overlap is intentionally capped.
- No allocations in `InteractionField.update` after construction.
- Quality tiers decode a prefix of the same shuffled baked group.
- The library does not own terrain, player state, renderer setup, or post effects.

## Performance knobs

Reduce decoded tuft count before changing tuft geometry. Because the bake
shuffles every group, `decodeTufts(..., count, spread)` can draw a spatially fair
prefix and widen surviving clumps to keep coverage. Distant layers can omit the
interaction field entirely.

Measure active gameplay on target hardware. The useful diagnostics are draw
calls, triangles, geometries, textures, frame time, device pixel ratio, and the
largest body count that can occupy the interactive field.

## Origin and vendoring

The grass began inside the clean-room Sheepdog Sim 3 rebuild. The reusable repo
is an extraction, not a dependency of the game. Sheepdog Sim keeps a vendored
copy so its deterministic release does not depend on a sibling checkout.

Exact file mapping and the proposed pin/update procedure are documented in
[`docs/ORIGIN.md`](docs/ORIGIN.md) and [`docs/VENDORING.md`](docs/VENDORING.md).

## License

MIT. Copyright 2026 Matthew Kissinger.

Three.js is used descriptively. This is an independent community project and
is not affiliated with or endorsed by the Three.js project.

All committed visual data is procedurally generated from source in this repo.
There are no third-party art or audio assets. Runtime and development packages
retain their own licenses.
