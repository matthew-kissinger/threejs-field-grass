// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { generateIslandGrass, ISLAND_GRASS_RECIPE } from '../demo/examples/island/scatter';
import {
  createIslandHeightfield,
  ISLAND_SEA_LEVEL,
  ISLAND_SEED,
  isIslandWalkable,
} from '../demo/examples/island/terrain';

describe('island terrain example', () => {
  it('is deterministic for a given seed', () => {
    const first = createIslandHeightfield(ISLAND_SEED, 24, 24);
    const second = createIslandHeightfield(ISLAND_SEED, 24, 24);
    const changed = createIslandHeightfield(ISLAND_SEED + 1, 24, 24);
    expect([...first.heights]).toEqual([...second.heights]);
    expect([...first.normals]).toEqual([...second.normals]);
    expect([...first.heights]).not.toEqual([...changed.heights]);
  });

  it('keeps every outer border vertex below sea level', () => {
    const field = createIslandHeightfield();
    const stride = field.segments + 1;
    for (let index = 0; index <= field.segments; index++) {
      expect(field.heights[index]).toBeLessThan(ISLAND_SEA_LEVEL);
      expect(field.heights[field.segments * stride + index]).toBeLessThan(ISLAND_SEA_LEVEL);
      expect(field.heights[index * stride]).toBeLessThan(ISLAND_SEA_LEVEL);
      expect(field.heights[index * stride + field.segments]).toBeLessThan(ISLAND_SEA_LEVEL);
    }
  });

  it('forms an asymmetric coast with distinct coves and headlands', () => {
    const field = createIslandHeightfield();
    const radii: number[] = [];
    for (let index = 0; index < 32; index++) {
      const angle = index / 32 * Math.PI * 2;
      let coast = 0;
      for (let radius = 1; radius < field.size / 2; radius += field.cellSize / 2) {
        if (field.heightAt(Math.cos(angle) * radius, Math.sin(angle) * radius) <= ISLAND_SEA_LEVEL) {
          coast = radius;
          break;
        }
      }
      radii.push(coast);
    }
    expect(Math.min(...radii)).toBeGreaterThan(field.size * 0.27);
    expect(Math.max(...radii) - Math.min(...radii)).toBeGreaterThan(field.size * 0.08);
  });

  it('samples the same two triangles used by each terrain mesh quad', () => {
    const field = createIslandHeightfield(ISLAND_SEED, 20, 10);
    const stride = field.segments + 1;
    const column = 3;
    const row = 4;
    const half = field.size / 2;
    const sample = (tx: number, tz: number) => field.heightAt(
      -half + (column + tx) * field.cellSize,
      -half + (row + tz) * field.cellSize,
    );
    const h00 = field.heights[row * stride + column]!;
    const h10 = field.heights[row * stride + column + 1]!;
    const h01 = field.heights[(row + 1) * stride + column]!;
    const h11 = field.heights[(row + 1) * stride + column + 1]!;
    const first = { tx: 0.23, tz: 0.31 };
    const second = { tx: 0.68, tz: 0.57 };
    expect(sample(first.tx, first.tz)).toBeCloseTo(
      h00 * (1 - first.tx - first.tz) + h10 * first.tx + h01 * first.tz,
      6,
    );
    expect(sample(second.tx, second.tz)).toBeCloseTo(
      h10 * (1 - second.tz) + h11 * (second.tx + second.tz - 1) + h01 * (1 - second.tx),
      6,
    );
  });

  it('places the exact requested grass count above water on safe slopes', () => {
    const field = createIslandHeightfield();
    const records = generateIslandGrass(field);
    expect(records).toHaveLength(ISLAND_GRASS_RECIPE.groups[0]!.count);
    for (const record of records) {
      expect(record.y).toBeGreaterThan(ISLAND_SEA_LEVEL + 0.21);
      expect(record.y).toBeCloseTo(field.heightAt(record.x, record.z), 6);
      expect(field.normalAt(record.x, record.z)[1]).toBeGreaterThanOrEqual(0.82);
    }
  });

  it('returns finite grounded capsule heights throughout the walkable center', () => {
    const field = createIslandHeightfield();
    const probes = [[0, 0], [2, -3], [-4, 1], [5, 4]] as const;
    for (const [x, z] of probes) {
      expect(isIslandWalkable(field, x, z)).toBe(true);
      expect(Number.isFinite(field.heightAt(x, z) + 0.72)).toBe(true);
      expect(field.normalAt(x, z).every(Number.isFinite)).toBe(true);
    }
  });
});
