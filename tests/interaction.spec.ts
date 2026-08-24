// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { createInteractionField } from '../src/three/interactionField';

function textureData(texture: { image: { data: unknown } }): Float32Array {
  return texture.image.data as Float32Array;
}

describe('interaction field', () => {
  it('files live bodies into the four-slot cell grid and retains a bounded wake', () => {
    const field = createInteractionField({
      minX: -10,
      maxX: 10,
      minZ: -10,
      maxZ: 10,
      maxBodies: 2,
      ghostsPerBody: 3,
      ghostBirthDuration: 0.1,
    });
    field.update(0.11, [{ slot: 0, x: -2, z: 0, heading: 0 }]);
    field.update(0.11, [{ slot: 0, x: 2, z: 0, heading: 0 }]);
    const records = textureData(field.interactors);
    const cells = textureData(field.cells);
    expect(records[0]).toBe(2);
    expect([...records].some((value, index) => index % 4 === 0 && value === -2)).toBe(true);
    expect([...cells].some((value) => value > 0)).toBe(true);
    expect(records.length).toBe(2 * 4 * 4);
    field.dispose();
  });

  it('clears the grid and trails on reset', () => {
    const field = createInteractionField({ maxBodies: 1, ghostsPerBody: 1 });
    field.update(0.2, [{ slot: 0, x: 1, z: 1, heading: 0 }]);
    field.reset();
    expect([...textureData(field.interactors)].every((value) => value === 0)).toBe(true);
    expect([...textureData(field.cells)].every((value) => value === 0)).toBe(true);
    field.dispose();
  });

  it('never accumulates ghosts under a stationary body', () => {
    const field = createInteractionField({
      maxBodies: 1,
      ghostsPerBody: 6,
      ghostBirthDuration: 0.1,
      minGhostDistance: 0.5,
      maxAge: 0.4,
    });
    field.update(0.11, [{ slot: 0, x: 2, z: -1, heading: 0.4 }]);
    const initialCells = textureData(field.cells).slice();
    expect(field.activeInteractorCount).toBe(1);
    for (let sample = 0; sample < 20; sample++) {
      field.update(0.11, [{ slot: 0, x: 2, z: -1, heading: 0.4 }]);
      expect(field.activeInteractorCount).toBe(1);
      expect(textureData(field.cells)).toEqual(initialCells);
    }
    field.dispose();
  });

  it('drops an old wake from the active grid after maxAge', () => {
    const field = createInteractionField({
      minX: -10,
      maxX: 10,
      minZ: -10,
      maxZ: 10,
      maxBodies: 1,
      ghostsPerBody: 3,
      ghostBirthDuration: 0.1,
      maxAge: 0.3,
    });
    field.update(0.11, [{ slot: 0, x: -3, z: 0, heading: 0 }]);
    field.update(0.11, [{ slot: 0, x: 3, z: 0, heading: 0 }]);
    field.update(0.31, [{ slot: 0, x: 3, z: 0, heading: 0 }]);
    const records = textureData(field.interactors);
    const activeXs = new Set<number>();
    for (const coordinate of textureData(field.cells)) {
      if (coordinate <= 0) continue;
      const index = Math.floor(coordinate * (records.length / 4));
      activeXs.add(records[index * 4]!);
    }
    expect(activeXs.has(-3)).toBe(false);
    expect(activeXs.has(3)).toBe(true);
    field.dispose();
  });

  it('deposits the same evenly spaced wake at 30, 60, and 120 Hz', () => {
    const run = (hz: number): number[] => {
      const field = createInteractionField({
        minX: -4,
        maxX: 4,
        minZ: -4,
        maxZ: 4,
        maxBodies: 1,
        ghostsPerBody: 12,
        minGhostDistance: 0.25,
        ghostBirthDuration: 0.08,
        maxAge: 3,
      });
      field.update(0, [{ slot: 0, x: 0, z: 0, heading: 0 }]);
      const dt = 1 / hz;
      for (let frame = 1; frame <= hz; frame++) {
        field.update(dt, [{ slot: 0, x: frame * dt * 2, z: 0, heading: 0 }]);
      }
      const records = textureData(field.interactors);
      const wake: number[] = [];
      for (let index = 1; index < field.activeInteractorCount; index++) {
        // A sample on this exact frame is still at zero birth weight. Compare
        // the visible wake after the shared birth interval instead.
        if (records[index * 4 + 3]! >= 0.08) {
          wake.push(Number(records[index * 4]!.toFixed(4)));
        }
      }
      field.dispose();
      return wake.sort((a, b) => a - b);
    };

    const at30 = run(30);
    const at60 = run(60);
    const at120 = run(120);
    expect(at30).toEqual(at60);
    expect(at60).toEqual(at120);
    expect(at60.length).toBeGreaterThanOrEqual(7);
    for (let index = 1; index < at60.length; index++) {
      expect(at60[index]! - at60[index - 1]!).toBeCloseTo(0.25, 3);
    }
  });
});
