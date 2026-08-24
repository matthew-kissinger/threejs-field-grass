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
   npm run test:webgpu
   npm run capture:demo
   npm run capture:island
   npm run capture:release-assets
   npm pack --dry-run --ignore-scripts
   git diff --check
   ```

2. Inspect the flat field, island terrain, Field and Storygrass looks, wake
   recovery, WebGPU/WebGL2 parity, desktop page, and phone page. Command exits
   alone are not visual acceptance.
3. Confirm all browser contexts and preview servers closed, the worktree is
   clean, and the review commit is recorded.
4. Present the local page and accepted captures to the owner.
5. Stop. Do not create a remote, make a repository public, push, or deploy until
   the owner explicitly approves the reviewed checkpoint.

## First public source release

After explicit approval:

1. Create `matthew-kissinger/threejs-field-grass` as a public GitHub repository
   with `main` as the default branch. Add the description, Pages homepage, and
   the focused topics listed in `package.json`.
2. Add that repository as `origin`, push `main`, and confirm the remote SHA is
   byte-for-byte equal to the accepted local SHA:

   ```bash
   git push -u origin main
   git fetch origin main
   test "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)"
   ```

3. Enable GitHub Pages with GitHub Actions as the publishing source. The REST
   setting is `build_type: workflow`; the repository Settings > Pages UI may
   also be used.
4. Confirm the `CI` workflow passes for the exact accepted SHA.
5. Manually dispatch `Pages demo`. Its build job runs `npm ci`, the full static
   check/library and demo builds, the packed-consumer test, and a demo build
   with `VITE_BASE_PATH=/threejs-field-grass/` before uploading `demo-dist`.
6. Confirm the Pages deployment job reports the same SHA and the live root
   returns HTTP 200.
7. In a real browser, verify flat field, island terrain, movement, orbit, zoom,
   reset, preset switching, mobile controls, and the reported backend.
8. Request representative built JS, CSS, SVG, JPEG, manifest, and scatter-binary
   URLs directly. Confirm each returns its real content type and no asset falls
   through to HTML.
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
