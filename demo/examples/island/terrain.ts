// SPDX-License-Identifier: MIT

export const ISLAND_SEED = 0x51a7d;
export const ISLAND_SIZE = 52;
export const ISLAND_SEGMENTS = 96;
export const ISLAND_SEA_LEVEL = 0;

export interface IslandHeightfield {
  readonly size: number;
  readonly segments: number;
  readonly cellSize: number;
  readonly heights: Float32Array;
  readonly normals: Float32Array;
  heightAt(x: number, z: number): number;
  normalAt(x: number, z: number): readonly [number, number, number];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function hash2(x: number, z: number, seed: number): number {
  let value = Math.imul(x | 0, 0x1f123bb5) ^ Math.imul(z | 0, 0x5f356495) ^ seed;
  value = Math.imul(value ^ (value >>> 15), 0x2c1b3c6d);
  value = Math.imul(value ^ (value >>> 12), 0x297a2d39);
  return ((value ^ (value >>> 15)) >>> 0) / 0xffffffff;
}

function valueNoise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const tx = x - ix;
  const tz = z - iz;
  const sx = tx * tx * (3 - 2 * tx);
  const sz = tz * tz * (3 - 2 * tz);
  const n00 = hash2(ix, iz, seed);
  const n10 = hash2(ix + 1, iz, seed);
  const n01 = hash2(ix, iz + 1, seed);
  const n11 = hash2(ix + 1, iz + 1, seed);
  const near = n00 + (n10 - n00) * sx;
  const far = n01 + (n11 - n01) * sx;
  return (near + (far - near) * sz) * 2 - 1;
}

function fbm(x: number, z: number, seed: number): number {
  let value = 0;
  let amplitude = 0.56;
  let frequency = 0.105;
  let normalizer = 0;
  for (let octave = 0; octave < 4; octave++) {
    value += valueNoise(x * frequency, z * frequency, seed + octave * 0x9e37) * amplitude;
    normalizer += amplitude;
    amplitude *= 0.48;
    frequency *= 2.03;
  }
  return value / normalizer;
}

function terrainHeight(x: number, z: number, seed: number, halfSize: number): number {
  // Offset and slightly shear the radial frame so the coast does not read as
  // a centered ellipse. Harmonics at co-prime frequencies make coves and
  // headlands without creating a repeating scalloped edge.
  const coastX = x + 1.2 + z * 0.025;
  const coastZ = z - 0.65 - x * 0.018;
  const angle = Math.atan2(coastZ, coastX);
  const coastline = 1
    + Math.sin(angle * 3 + 0.45) * 0.082
    + Math.sin(angle * 5 - 1.15) * 0.052
    + Math.sin(angle * 7 + 0.72) * 0.032
    + valueNoise(coastX * 0.13, coastZ * 0.13, seed ^ 0x72a4) * 0.07;
  const radial = Math.hypot(coastX * 0.95, coastZ * 1.05) / (halfSize * coastline);
  const land = 1 - smoothstep(0.5, 0.92, radial);
  const broad = fbm(x, z, seed);
  const longRidge = Math.sin(x * 0.13 - z * 0.075) * 0.34;
  const crown = Math.max(0, 1 - radial) * 0.72;
  return -1.35 + land * (3.4 + broad * 1.12 + longRidge + crown);
}

function vertexIndex(segments: number, column: number, row: number): number {
  return row * (segments + 1) + column;
}

export function createIslandHeightfield(
  seed = ISLAND_SEED,
  size = ISLAND_SIZE,
  segments = ISLAND_SEGMENTS,
): IslandHeightfield {
  if (!(size > 0) || !Number.isInteger(segments) || segments < 2) {
    throw new Error('Island heightfield needs a positive size and at least two segments');
  }
  const stride = segments + 1;
  const cellSize = size / segments;
  const halfSize = size / 2;
  const heights = new Float32Array(stride * stride);
  const normals = new Float32Array(stride * stride * 3);

  for (let row = 0; row <= segments; row++) {
    const z = -halfSize + row * cellSize;
    for (let column = 0; column <= segments; column++) {
      const x = -halfSize + column * cellSize;
      heights[vertexIndex(segments, column, row)] = terrainHeight(x, z, seed, halfSize);
    }
  }

  const sampleVertex = (column: number, row: number): number => heights[vertexIndex(
    segments,
    clamp(column, 0, segments),
    clamp(row, 0, segments),
  )]!;
  for (let row = 0; row <= segments; row++) {
    for (let column = 0; column <= segments; column++) {
      const left = sampleVertex(column - 1, row);
      const right = sampleVertex(column + 1, row);
      const near = sampleVertex(column, row - 1);
      const far = sampleVertex(column, row + 1);
      const spanX = column === 0 || column === segments ? cellSize : cellSize * 2;
      const spanZ = row === 0 || row === segments ? cellSize : cellSize * 2;
      const dx = (right - left) / spanX;
      const dz = (far - near) / spanZ;
      const length = Math.hypot(dx, 1, dz);
      const at = vertexIndex(segments, column, row) * 3;
      normals[at] = -dx / length;
      normals[at + 1] = 1 / length;
      normals[at + 2] = -dz / length;
    }
  }

  const locate = (x: number, z: number) => {
    const gridX = clamp((x + halfSize) / cellSize, 0, segments - Number.EPSILON);
    const gridZ = clamp((z + halfSize) / cellSize, 0, segments - Number.EPSILON);
    const column = Math.min(segments - 1, Math.floor(gridX));
    const row = Math.min(segments - 1, Math.floor(gridZ));
    return { column, row, tx: gridX - column, tz: gridZ - row };
  };

  const heightAt = (x: number, z: number): number => {
    const { column, row, tx, tz } = locate(x, z);
    const h00 = heights[vertexIndex(segments, column, row)]!;
    const h10 = heights[vertexIndex(segments, column + 1, row)]!;
    const h01 = heights[vertexIndex(segments, column, row + 1)]!;
    const h11 = heights[vertexIndex(segments, column + 1, row + 1)]!;
    // Each grid quad uses the top-right to bottom-left diagonal. This sampler
    // uses those exact two triangles rather than bilinear interpolation.
    if (tx + tz <= 1) return h00 * (1 - tx - tz) + h10 * tx + h01 * tz;
    return h10 * (1 - tz) + h11 * (tx + tz - 1) + h01 * (1 - tx);
  };

  const normalAt = (x: number, z: number): readonly [number, number, number] => {
    const { column, row, tx, tz } = locate(x, z);
    const result: [number, number, number] = [0, 0, 0];
    for (let dz = 0; dz <= 1; dz++) {
      for (let dx = 0; dx <= 1; dx++) {
        const weight = (dx === 0 ? 1 - tx : tx) * (dz === 0 ? 1 - tz : tz);
        const at = vertexIndex(segments, column + dx, row + dz) * 3;
        result[0] += normals[at]! * weight;
        result[1] += normals[at + 1]! * weight;
        result[2] += normals[at + 2]! * weight;
      }
    }
    const length = Math.hypot(result[0], result[1], result[2]) || 1;
    return [result[0] / length, result[1] / length, result[2] / length];
  };

  return { size, segments, cellSize, heights, normals, heightAt, normalAt };
}

export function isIslandWalkable(
  field: IslandHeightfield,
  x: number,
  z: number,
  minimumHeight = ISLAND_SEA_LEVEL + 0.16,
): boolean {
  const half = field.size / 2 - field.cellSize;
  return Number.isFinite(x)
    && Number.isFinite(z)
    && Math.abs(x) <= half
    && Math.abs(z) <= half
    && field.heightAt(x, z) >= minimumHeight
    && field.normalAt(x, z)[1] >= 0.82;
}
