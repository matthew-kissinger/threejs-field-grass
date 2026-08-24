// SPDX-License-Identifier: MIT

import {
  decodeTufts,
  encodeScatter,
  generateScatter,
  groupFromManifest,
  type ScatterRecipe,
  type TuftBuffers,
  type TuftRecord,
} from '../../../src/index';
import { ISLAND_SEA_LEVEL, isIslandWalkable, type IslandHeightfield } from './terrain';

export const ISLAND_GRASS_RECIPE: ScatterRecipe = {
  seed: 20260825,
  groups: [{
    id: 'island-meadow',
    count: 11_500,
    bounds: { minX: -21.5, maxX: 21.5, minZ: -21.5, maxZ: 21.5 },
    heightMin: 0.56,
    heightMax: 1.08,
  }],
};

export function generateIslandGrass(field: IslandHeightfield): readonly TuftRecord[] {
  return generateScatter(ISLAND_GRASS_RECIPE, (x, z, _group, random) => {
    const y = field.heightAt(x, z);
    const normalY = field.normalAt(x, z)[1];
    const shore = Math.min(1, Math.max(0, (y - ISLAND_SEA_LEVEL) / 1.4));
    return {
      y,
      accept: isIslandWalkable(field, x, z, ISLAND_SEA_LEVEL + 0.22),
      vigour: Math.min(1, 0.69 + shore * 0.23 + normalY * 0.05 + random() * 0.03),
    };
  }).get('island-meadow')!;
}

export function createIslandGrassBuffers(field: IslandHeightfield): TuftBuffers {
  const groups = new Map([['island-meadow', generateIslandGrass(field)]]);
  const baked = encodeScatter('demo/examples/island/scatter.ts', ISLAND_GRASS_RECIPE, groups);
  return decodeTufts(
    baked.bytes,
    baked.manifest,
    groupFromManifest(baked.manifest, 'island-meadow'),
  );
}
