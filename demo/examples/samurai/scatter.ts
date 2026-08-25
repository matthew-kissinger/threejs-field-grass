// SPDX-License-Identifier: MIT

import {
  decodeTufts,
  encodeScatter,
  generateScatter,
  groupFromManifest,
  type ScatterRecipe,
  type TuftBuffers,
} from '../../../src/index';
import type { SamuraiHeightfield } from './terrain';

export const SAMURAI_GRASS_RECIPE: ScatterRecipe = {
  seed: 0xe4d481,
  groups: [{
    id: 'emerald-meadow',
    count: 16_500,
    bounds: { minX: -29, maxX: 29, minZ: -29, maxZ: 29 },
    heightMin: 0.82,
    heightMax: 1.34,
  }],
};

export function createSamuraiGrassBuffers(field: SamuraiHeightfield): TuftBuffers {
  const records = generateScatter(SAMURAI_GRASS_RECIPE, (x, z, _group, random) => ({
    y: field.heightAt(x, z),
    vigour: Math.min(1, 0.82 + field.normalAt(x, z)[1] * 0.1 + random() * 0.07),
  })).get('emerald-meadow')!;
  const groups = new Map([['emerald-meadow', records]]);
  const baked = encodeScatter('demo/examples/samurai/scatter.ts', SAMURAI_GRASS_RECIPE, groups);
  return decodeTufts(
    baked.bytes,
    baked.manifest,
    groupFromManifest(baked.manifest, 'emerald-meadow'),
  );
}
