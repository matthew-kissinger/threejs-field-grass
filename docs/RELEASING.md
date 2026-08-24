# Releasing Three.js Field Grass

Three.js Field Grass starts at `0.1.0`. The API has one originating game, so `1.0.0`
waits until a second game has integrated the package and the renderer and
performance baselines have survived that use.

No remote repository, npm package, tag, release, or Pages deployment has been
created from this local extraction. Those are explicit owner-authorized steps.

## First public release

1. Confirm the final local commit passes `npm run check`, `npm run test:package`,
   `npm run test:browser`, and `npm pack --dry-run --ignore-scripts`.
2. Run secret, absolute-path, SPDX/license, generated-asset, and packed-file scans.
3. Create the public `matthew-kissinger/threejs-field-grass` repository only after approval.
4. Push `main`, enable required CI, and add the documented GitHub topics.
5. Run the manual Pages workflow and verify the deployed commit and both renderer paths.
6. Create an annotated `v0.1.0` tag. Sign it only if a configured signing identity is available.
7. Create a draft prerelease titled `Three.js Field Grass 0.1.0`, verify its source archives,
   then publish the release after the Pages receipt is recorded.
8. Keep npm unpublished until separately authorized. When authorized, prefer npm
   trusted publishing with provenance rather than a stored publish token.

Patch fixes use `0.1.x`; compatible API additions use `0.2.0`. The vendored
Sheepdog Sim copy pins an accepted tag and commit, never a sibling filesystem path.
