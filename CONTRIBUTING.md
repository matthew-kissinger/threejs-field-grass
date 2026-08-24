# Contributing

Keep changes small and measurable. Run:

```bash
npm run bake
npm run check
npm run test:package
npm run test:browser
```

Renderer, interaction, or presentation changes also require
`npm run test:webgpu`, both backend captures, and desktop/phone screenshot
inspection. Run `git diff --check` before committing.

If a recipe changes, explain why the field should move and commit the new binary
with the recipe. If a material, tuft shape, or demo camera changes, include a
desktop and mobile screenshot and record renderer counts.

Do not add opaque art assets, runtime generators, `ShaderMaterial`,
`onBeforeCompile`, or renderer-specific forks.
