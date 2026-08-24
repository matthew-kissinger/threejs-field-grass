// SPDX-License-Identifier: MIT

import type { ScatterRecipe, TuftSampler } from '../src/core/scatter';

export const DEMO_RECIPE: ScatterRecipe = {
  seed: 20260824,
  groups: [
    {
      id: 'meadow',
      count: 18_000,
      bounds: { minX: -32, maxX: 32, minZ: -32, maxZ: 32 },
      heightMin: 0.62,
      heightMax: 1.28,
    },
  ],
};

export const sampleDemoTuft: TuftSampler = (x, z, _group, random) => {
  const broad = Math.sin(x * 0.09) * 0.24 + Math.cos(z * 0.075) * 0.18;
  const detail = Math.sin((x + z) * 0.31) * 0.035;
  const vigourPatch = Math.sin(x * 0.12) * Math.sin(z * 0.1) * 0.055
    + Math.cos((x - z) * 0.065) * 0.035;
  return {
    y: broad + detail,
    vigour: Math.max(0.72, Math.min(1, 0.87 + vigourPatch + random() * 0.08)),
  };
};
