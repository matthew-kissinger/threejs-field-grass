# Origin and source mapping

This repository was extracted locally on 2026-08-24 from the Sheepdog Sim 3
clean-room rebuild in `herd`, source snapshot
`0cef84641d89269b43b1a25312d3ae767392b51e`.

The original grass implementation was written by Matthew Kissinger under the
same copyright ownership. For this standalone package, that code is offered
under MIT. No Sheepdog Sim visual or audio asset was copied.

| Standalone surface | Herd source | Extraction decision |
| --- | --- | --- |
| `src/three/tuftGeometry.ts` | `app/src/scene/grass/tuftGeometry.ts` | Lifted and decoupled from the sim RNG import. |
| `src/three/grassMaterial.ts` | `app/src/scene/grass/grassMaterial.ts` | Lifted, then given a public palette, local toon ramp, and generic interaction contract. Bark-specific presentation was omitted. |
| `src/three/interactionField.ts` | `app/src/scene/grass/interactionField.ts` | Rebuilt around stable caller-owned body slots. Sheepdog and flock imports were removed. |
| `src/core/baked.ts` | `app/src/scene/grass/tuftData.ts` | React loading was removed. Decode and manifest logic became framework-neutral. |
| `src/core/scatter.ts` | `tools/bake-grass.mjs` | Rebuilt as a terrain-agnostic stratified recipe API. Farm exclusions and terrain code were not copied. |
| `src/react/GrassLayer.tsx` | `app/src/scene/GrassField.tsx` | Reduced to an optional adapter over decoded buffers. Store, quality, bark, and game-loop imports were omitted. |
| `assets/demo/*` | none | Newly generated from `demo/recipe.ts`. |

Herd's `density.ts` remains a game policy. The standalone decoder already
supports prefix count and horizontal spread, so it does not need a fixed
desktop/mobile preset table.

## Standalone demo additions

The island and Emerald Dawn scenes were written for this repository after the
grass extraction. Their terrain, controller, camera, procedural tree, katana,
petals, moon, and post-processing code do not come from Sheepdog Sim.

Emerald Dawn's character mesh is Daniel Darko's **Low-poly Samurai** under
CC BY 4.0. Its demo-only rig and final animation clips use Adobe Mixamo.
Those demo-only sources and modifications are listed in
`public/assets/samurai/ATTRIBUTION.md`; neither asset is part of the reusable
library or npm package.
