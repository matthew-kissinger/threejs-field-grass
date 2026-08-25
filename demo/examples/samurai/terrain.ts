// SPDX-License-Identifier: MIT

export const SAMURAI_FIELD_SIZE = 64;
export const SAMURAI_FIELD_SEGMENTS = 112;
export const SAMURAI_TREE_X = 10;
export const SAMURAI_TREE_Z = -18;

export interface SamuraiHeightfield {
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

function terrainHeight(x: number, z: number): number {
  const broad = Math.sin(x * 0.082 - z * 0.028) * 0.42
    + Math.cos(z * 0.073 + x * 0.018) * 0.34;
  const cross = Math.sin((x + z) * 0.17) * 0.12
    + Math.cos((x - z) * 0.21) * 0.08;
  const treeDistance = Math.hypot(x - SAMURAI_TREE_X, z - SAMURAI_TREE_Z);
  const treeRise = (1 - smoothstep(2.8, 15, treeDistance)) * 2.25;
  const farRise = smoothstep(3, 28, -z) * 0.42;
  const raw = broad + cross + treeRise + farRise;
  const terrace = Math.round(raw / 0.32) * 0.32;
  return raw * 0.78 + terrace * 0.22;
}

function vertexIndex(segments: number, column: number, row: number): number {
  return row * (segments + 1) + column;
}

export function createSamuraiHeightfield(
  size = SAMURAI_FIELD_SIZE,
  segments = SAMURAI_FIELD_SEGMENTS,
): SamuraiHeightfield {
  const stride = segments + 1;
  const cellSize = size / segments;
  const half = size / 2;
  const heights = new Float32Array(stride * stride);
  const normals = new Float32Array(stride * stride * 3);

  for (let row = 0; row <= segments; row++) {
    const z = -half + row * cellSize;
    for (let column = 0; column <= segments; column++) {
      const x = -half + column * cellSize;
      heights[vertexIndex(segments, column, row)] = terrainHeight(x, z);
    }
  }

  const sample = (column: number, row: number) => heights[vertexIndex(
    segments,
    clamp(column, 0, segments),
    clamp(row, 0, segments),
  )]!;
  for (let row = 0; row <= segments; row++) {
    for (let column = 0; column <= segments; column++) {
      const dx = (sample(column + 1, row) - sample(column - 1, row))
        / (column === 0 || column === segments ? cellSize : cellSize * 2);
      const dz = (sample(column, row + 1) - sample(column, row - 1))
        / (row === 0 || row === segments ? cellSize : cellSize * 2);
      const length = Math.hypot(dx, 1, dz);
      const at = vertexIndex(segments, column, row) * 3;
      normals[at] = -dx / length;
      normals[at + 1] = 1 / length;
      normals[at + 2] = -dz / length;
    }
  }

  const locate = (x: number, z: number) => {
    const gx = clamp((x + half) / cellSize, 0, segments - Number.EPSILON);
    const gz = clamp((z + half) / cellSize, 0, segments - Number.EPSILON);
    const column = Math.min(segments - 1, Math.floor(gx));
    const row = Math.min(segments - 1, Math.floor(gz));
    return { column, row, tx: gx - column, tz: gz - row };
  };

  const heightAt = (x: number, z: number): number => {
    const { column, row, tx, tz } = locate(x, z);
    const h00 = heights[vertexIndex(segments, column, row)]!;
    const h10 = heights[vertexIndex(segments, column + 1, row)]!;
    const h01 = heights[vertexIndex(segments, column, row + 1)]!;
    const h11 = heights[vertexIndex(segments, column + 1, row + 1)]!;
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

export function isSamuraiFieldWalkable(field: SamuraiHeightfield, x: number, z: number): boolean {
  const half = field.size / 2 - 3;
  return Math.abs(x) <= half
    && Math.abs(z) <= half
    && field.normalAt(x, z)[1] >= 0.77;
}
