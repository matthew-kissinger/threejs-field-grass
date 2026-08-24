# Contributing

Keep changes small and measurable. Run:

```bash
npm run bake
npm test
npm run build
```

If a recipe changes, explain why the field should move and commit the new binary
with the recipe. If a material, tuft shape, or demo camera changes, include a
desktop and mobile screenshot and record renderer counts.

Do not add opaque art assets, runtime generators, `ShaderMaterial`,
`onBeforeCompile`, or renderer-specific forks.
