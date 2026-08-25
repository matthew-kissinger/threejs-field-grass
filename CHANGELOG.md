# Three.js Field Grass changelog

## 0.1.0 - 2026-08-24

- Extracted deterministic grass scatter, TSL material, tuft geometry, and body wake.
- Added framework-neutral Three.js API and optional React Three Fiber adapter.
- Added reproducible demo data, tests, local demo, origin mapping, and vendoring plan.
- Added flat-field and deterministic island-terrain examples with desktop and touch controls.
- Added the Field and Storygrass data presets on one WebGPU/WebGL2 TSL path.
- Added package-consumer, browser, native-WebGPU, capture, CI, and Pages release receipts.
- Replaced ranked per-cell interactor selection with a continuous directional
  deformation field and stable per-blade fold variation.
- Added simultaneous movement/orbit controls, fullscreen, and a subtle FPS badge.
- Kept orbit and wheel controls connected across fullscreen and viewport resizes.
- Added Emerald Dawn, a third-person long-grass scene with deterministic rolling
  terrain, a procedural blossom tree and katana, petal wind, character
  locomotion, and a one-shot sword attack.
- Added a collision-aware spring-arm camera whose orbit and radius-only zoom
  remain independent while the actor moves.
- Added a world-anchored moon light, canopy shadow proxies, Three.js shadow-volume
  god rays, and a softened depth march toward the projected moon direction.
- Added explicit CC BY character and CC0 animation provenance plus a visible
  third-party-notices link; demo assets remain outside the npm package boundary.
- Expanded native-WebGPU receipts to cover Emerald orbit and zoom at warm-frame
  performance, while software-headless gameplay tests run without the costly
  atmosphere graph.
