// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { decodeTufts, encodeScatter, groupFromManifest } from '../src/core/baked';
import { generateScatter, type ScatterRecipe } from '../src/core/scatter';

const recipe: ScatterRecipe = {
  seed: 42,
  groups: [{ id: 'field', count: 1024, bounds: { minX: -20, maxX: 20, minZ: -10, maxZ: 10 } }],
};

describe('deterministic scatter', () => {
  it('repeats exactly and keeps a half-density prefix spatially fair', () => {
    const first = generateScatter(recipe);
    const second = generateScatter(recipe);
    expect(first).toEqual(second);
    const records = first.get('field')!;
    const histogram = (sample: typeof records) => {
      const bins = new Uint16Array(8 * 4);
      for (const record of sample) {
        const x = Math.min(7, Math.floor(((record.x + 20) / 40) * 8));
        const z = Math.min(3, Math.floor(((record.z + 10) / 20) * 4));
        const index = z * 8 + x;
        bins[index] = (bins[index] ?? 0) + 1;
      }
      return bins;
    };
    const whole = histogram(records);
    const prefix = histogram(records.slice(0, records.length / 2));
    for (let index = 0; index < whole.length; index++) {
      expect(Math.abs(prefix[index]! / 512 - whole[index]! / 1024)).toBeLessThan(0.016);
    }
  });

  it('encodes compact records and decodes matrices plus shader attributes', () => {
    const groups = generateScatter(recipe, (x, z) => ({ y: x * 0.01 + z * 0.005, vigour: 0.75 }));
    const baked = encodeScatter('test', recipe, groups);
    expect(baked.bytes.byteLength).toBe(1024 * 12);
    const group = groupFromManifest(baked.manifest, 'field');
    const decoded = decodeTufts(baked.bytes, baked.manifest, group, 512, 1.2);
    expect(decoded.count).toBe(512);
    expect(decoded.matrices).toHaveLength(512 * 16);
    expect(decoded.tufts).toHaveLength(512 * 4);
    expect(decoded.tufts[3]).toBeCloseTo(0.75, 2);
    expect(decoded.matrices[15]).toBe(1);
  });

  it('rejects a sampler that cannot fill its requested group', () => {
    expect(() => generateScatter(recipe, () => ({ y: 0, accept: false }))).toThrow(/accepted 0\/1024/);
  });
});
