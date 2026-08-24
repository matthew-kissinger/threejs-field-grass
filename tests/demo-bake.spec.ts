// SPDX-License-Identifier: MIT

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { encodeScatter } from '../src/core/baked';
import { generateScatter } from '../src/core/scatter';
import { DEMO_RECIPE, sampleDemoTuft } from '../demo/recipe';

describe('committed demo asset', () => {
  it('reproduces byte for byte from the in-repo recipe', () => {
    const baked = encodeScatter(
      'tools/bake-demo.ts',
      DEMO_RECIPE,
      generateScatter(DEMO_RECIPE, sampleDemoTuft),
    );
    const committedBytes = readFileSync(new URL('../assets/demo/tufts.bin', import.meta.url));
    const committedManifest = readFileSync(new URL('../assets/demo/manifest.json', import.meta.url), 'utf8');
    expect(Buffer.from(baked.bytes).equals(committedBytes)).toBe(true);
    expect(`${JSON.stringify(baked.manifest, null, 2)}\n`).toBe(committedManifest);
  });

  it('keeps the resting field free of a baked line-like scar', () => {
    let formerPath = 0;
    let besidePath = 0;
    const count = 96;
    for (let index = 0; index < count; index++) {
      const x = -30 + (60 * index) / (count - 1);
      const z = Math.sin(x * 0.11) * 2.2;
      formerPath += sampleDemoTuft(x, z, DEMO_RECIPE.groups[0]!, () => 0.5).vigour ?? 0;
      besidePath += sampleDemoTuft(x, z + 5, DEMO_RECIPE.groups[0]!, () => 0.5).vigour ?? 0;
    }
    expect(Math.abs(formerPath / count - besidePath / count)).toBeLessThan(0.035);
    expect(formerPath / count).toBeGreaterThan(0.78);
  });
});
