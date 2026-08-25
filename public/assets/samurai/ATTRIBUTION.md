# Low-poly Samurai

This demo includes **Low-poly Samurai** by Daniel Darko.

- Original: https://sketchfab.com/3d-models/low-poly-samurai-bb59b046d8d74ef589eee02b0fac03f1
- Creator: https://sketchfab.com/danieldarko
- License: Creative Commons Attribution 4.0 International (CC BY 4.0)
- License text: https://creativecommons.org/licenses/by/4.0/
- Original source filename during the offline build (not shipped): `low-poly-samurai.glb`
- Runtime file: `samurai-mixamo-sword-set.glb`
- Download path used for this repository: the Objaverse 1.0 mirror of the original downloadable Sketchfab model, UID `bb59b046d8d74ef589eee02b0fac03f1`

The source mesh was auto-rigged and animated with [Adobe Mixamo](https://www.mixamo.com/). The runtime combines `Great Sword Idle`, `Great Sword Walk`, and `Great Sword High Spin Attack` as `SwordIdle`, `SwordWalk`, and `SwordSpinAttack` on one skin and skeleton. Horizontal hips translation is stripped from walk and attack so application code remains authoritative for world movement; authored vertical motion and bone rotation are preserved.

`tools/build-samurai-runtime.mjs` is the committed runtime recipe. It accepts the idle FBX with skin plus the walk and attack FBXs, applies the clip naming and in-place root cleanup above, and emits the single GLB used by the demo. The downloaded source FBXs are not redistributed.

Adobe's [Mixamo FAQ](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html) permits royalty-free use of Mixamo characters and animations in personal, commercial, and non-profit projects, including video games. Adobe's [General Terms](https://www.adobe.com/legal/terms.html) permit distributing Content Files in connection with the authored end use and prohibit distributing them as stand-alone assets. This GLB is included only as a runtime component of the Emerald Dawn game example. It is excluded from the npm package, is not covered by this repository's MIT license, and is not offered as a reusable character or animation asset.

The katana and saya are original procedural Three.js geometry reconstructed from an isolated generated reference image at `docs/images/emerald-dawn-katana-reference.png`; no third-party weapon mesh is shipped.

The runtime wrapper changes scale, placement, and materials to integrate the model into the Emerald Dawn demo. The source mesh is not represented as an original work of this repository.

Only the game-example runtime GLB and this notice are shipped in `public/assets/samurai/`.
