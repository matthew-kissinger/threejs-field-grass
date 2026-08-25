# Releasing Three.js Field Grass

Three.js Field Grass starts at `0.1.0`. The API has one originating game, so
`1.0.0` waits until a second game has integrated it and the renderer and
performance baselines have survived that use.

The public GitHub repository, Pages deployment, Git tag, GitHub release, and
npm publication are separate actions. None is implied by permission to edit or
verify this repository. npm remains unpublished until separately authorized.

## Local owner-review gate

Before any public or deployment action:

1. Run the full local receipt:

   ```bash
   npm ci
   npm run check
   npm run test:package
   npm run test:browser
   node tools/webgpu-smoke.mjs --scene=samurai
   npm run capture:demo
   npm run capture:island
   npm run capture:release-assets
   npm pack --dry-run --ignore-scripts
   git diff --check
   ```

2. Inspect the flat field, island terrain, Emerald Dawn, Field and Storygrass
   looks, wake recovery, samurai idle/walk/attack transitions, sword and saya
   attachment, moon shafts through the tree, WebGPU/WebGL2 parity, desktop page,
   and phone page. Command exits alone are not visual acceptance.
3. Confirm every third-party demo asset has a source, creator, license,
   modification record, and verified redistribution posture. Confirm only the
   final versioned runtime is under `public/` and it remains outside the npm
   package boundary.
4. Confirm all browser contexts and preview servers closed, the worktree is
   clean, and the review commit is recorded.
5. Present the local page and accepted captures to the owner.
6. Stop. Do not push or deploy until
   the owner explicitly approves the reviewed checkpoint.

## Public source and Pages update

After explicit approval:

1. Confirm `matthew-kissinger/threejs-field-grass` is public with `main` as the
   default branch and the Pages homepage configured.
2. Push `main`, and confirm the remote SHA is
   byte-for-byte equal to the accepted local SHA:

   ```bash
   git push -u origin main
   git fetch origin main
   test "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)"
   ```

3. Confirm GitHub Pages still uses GitHub Actions as the publishing source.
4. Confirm the `CI` workflow passes for the exact accepted SHA.
5. Manually dispatch `Pages demo`. Its build job runs `npm ci`, the full static
   check/library and demo builds, the packed-consumer test, and a demo build
   with `VITE_BASE_PATH=/threejs-field-grass/` before uploading `demo-dist`.
6. Confirm the Pages deployment job reports the same SHA and the live root
   returns HTTP 200.
7. In a real browser, verify flat field, island terrain, Emerald Dawn, movement,
   attack, orbit, zoom, reset, fullscreen, preset switching, mobile controls,
   moon-ray stability, and the reported backend.
8. Request representative built JS, CSS, SVG, JPEG, manifest, scatter-binary,
   the final samurai GLB, and `assets/samurai/ATTRIBUTION.md` directly. Confirm
   each returns its real content type and no asset falls through to HTML.
9. Record the repository URL, Pages URL, local/remote/deployed SHA, workflow
   runs, HTTP receipts, screenshots, and bundle sizes in the release handoff.

## Tag and GitHub release

Only after the source repository and Pages demo are accepted:

1. Create annotated tag `v0.1.0`. Sign only when a configured signing identity
   is already available.
2. Create a draft prerelease named `Three.js Field Grass 0.1.0` and inspect the
   generated source archives.
3. Publish the GitHub release after the exact-head Pages receipt is recorded.

Patch fixes use `0.1.x`; compatible API additions use `0.2.0`. The vendored
Sheepdog Sim copy pins an accepted tag and commit, never a sibling filesystem
path.

## npm publication

Do not publish npm from CI and do not create or store a local publish token.
When npm publication is separately authorized, prefer npm trusted publishing
with provenance and repeat the packed-consumer verification against the exact
tag first.
