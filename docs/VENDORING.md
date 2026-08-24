# Vendoring into Sheepdog Sim

Sheepdog Sim should keep a checked-in copy. It must not import this sibling path
at build time or runtime.

## Initial relationship

1. Finish and tag the first standalone grass release locally.
2. Record that tag and commit in Sheepdog Sim's grass README or vendor manifest.
3. Keep Sheepdog-specific adapters in Sheepdog Sim. In particular, store reads,
   flock snapshots, bark presentation, terrain loading, and quality selection
   do not belong upstream.

## Updating the vendored copy

1. Compare the pinned standalone tag with the candidate tag.
2. Copy only core, Three.js, or adapter changes that Sheepdog actually uses.
3. Adapt SPDX headers to Sheepdog Sim's AGPL policy in the vendored files.
4. Re-run Sheepdog's deterministic grass bake test, material graph tests, both
   renderer backends, 25/75/200 sheep playtests, and desktop/mobile captures.
5. Update the pin only in the same commit as the copied code and passing proof.

Never regenerate Sheepdog's committed grass scatter merely to make a test pass.
A changed binary is a visual and deterministic decision.
