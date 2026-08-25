# Low-poly Samurai

This demo includes **Low-poly Samurai** by Daniel Darko.

- Original: https://sketchfab.com/3d-models/low-poly-samurai-bb59b046d8d74ef589eee02b0fac03f1
- Creator: https://sketchfab.com/danieldarko
- License: Creative Commons Attribution 4.0 International (CC BY 4.0)
- License text: https://creativecommons.org/licenses/by/4.0/
- Original source filename during the offline build (not shipped): `low-poly-samurai.glb`
- Runtime file: `samurai-quaternius-sword-set.glb`
- Download path used for this repository: the Objaverse 1.0 mirror of the original downloadable Sketchfab model, UID `bb59b046d8d74ef589eee02b0fac03f1`

The runtime animations come from the standard free edition of **Universal Animation Library** by [Quaternius](https://quaternius.com/), distributed at [itch.io](https://quaternius.itch.io/universal-animation-library) under [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/). `Sword_Idle`, `Walk_Loop`, and `Sword_Attack` were offline-retargeted onto the samurai's existing skeleton as `SwordIdle`, `SwordWalk`, and `SwordAttack`. The walk uses its authored lower-body locomotion with the sword-ready upper-body pose layered above `spine_01`. Horizontal root translation is stripped so application code remains authoritative for world movement; authored vertical motion and bone rotation are preserved.

The katana and saya are original procedural Three.js geometry reconstructed from an isolated generated reference image at `docs/images/emerald-dawn-katana-reference.png`; no third-party weapon mesh is shipped.

The runtime wrapper changes scale, placement, and materials to integrate the model into the Emerald Dawn demo. The source mesh is not represented as an original work of this repository.

Only the optimized runtime GLB and this notice are shipped in `public/assets/samurai/`.
