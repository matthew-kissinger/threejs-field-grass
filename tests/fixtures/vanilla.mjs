import assert from 'node:assert/strict';
import {
  decodeTufts,
  encodeScatter,
  generateScatter,
  groupFromManifest,
} from 'threejs-field-grass';

const recipe = {
  seed: 7,
  groups: [{ id: 'fixture', count: 8, bounds: { minX: -2, maxX: 2, minZ: -2, maxZ: 2 } }],
};
const baked = encodeScatter('fixture', recipe, generateScatter(recipe));
const decoded = decodeTufts(
  baked.bytes,
  baked.manifest,
  groupFromManifest(baked.manifest, 'fixture'),
);
assert.equal(decoded.count, 8);
assert.equal(decoded.matrices.length, 128);
console.log('vanilla consumer ok');
