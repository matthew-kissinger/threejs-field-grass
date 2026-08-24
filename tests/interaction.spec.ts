// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { createInteractionField } from '../src/three/interactionField';

function textureData(texture: { image: { data: unknown } }): Float32Array {
  return texture.image.data as Float32Array;
}

function deformationData(texture: { image: { data: unknown } }): Uint8Array {
  return texture.image.data as Uint8Array;
}

function cellBase(
  field: ReturnType<typeof createInteractionField>,
  x: number,
  z: number,
): number {
  const column = Math.max(0, Math.min(
    field.gridColumns - 1,
    Math.floor((x - field.config.minX) / field.config.cellSize),
  ));
  const row = Math.max(0, Math.min(
    field.gridRows - 1,
    Math.floor((z - field.config.minZ) / field.config.cellSize),
  ));
  return (row * field.gridColumns + column) * 4;
}

describe('interaction field', () => {
  it('accumulates live bodies and a bounded wake into one deformation field', () => {
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
    const deformation = deformationData(field.deformation);
    expect(records[0]).toBe(2);
    expect([...records].some((value, index) => index % 4 === 0 && value === -2)).toBe(true);
    expect([...deformation].some((value, index) => index % 4 === 3 && value > 0)).toBe(true);
    expect(records.length).toBe(2 * 4 * 4);
    field.dispose();
  });

  it('clears the grid and trails on reset', () => {
    const field = createInteractionField({
      minX: -4,
      maxX: 4,
      minZ: -4,
      maxZ: 4,
      maxBodies: 1,
      ghostsPerBody: 1,
    });
    field.update(0.2, [{ slot: 0, x: 1, z: 1, heading: 0 }]);
    field.reset();
    expect([...textureData(field.interactors)].every((value) => value === 0)).toBe(true);
    const deformation = deformationData(field.deformation);
    for (let base = 0; base < deformation.length; base += 4) {
      expect([...deformation.slice(base, base + 4)]).toEqual([128, 128, 128, 0]);
    }
    field.dispose();
  });

  it('never accumulates ghosts under a stationary body', () => {
    const field = createInteractionField({
      minX: -4,
      maxX: 4,
      minZ: -4,
      maxZ: 4,
      maxBodies: 1,
      ghostsPerBody: 6,
      ghostBirthDuration: 0.1,
      minGhostDistance: 0.5,
      maxAge: 0.4,
    });
    field.update(0.11, [{ slot: 0, x: 2, z: -1, heading: 0.4 }]);
    const initialDeformation = deformationData(field.deformation).slice();
    expect(field.activeInteractorCount).toBe(1);
    for (let sample = 0; sample < 20; sample++) {
      field.update(0.11, [{ slot: 0, x: 2, z: -1, heading: 0.4 }]);
      expect(field.activeInteractorCount).toBe(1);
      expect(deformationData(field.deformation)).toEqual(initialDeformation);
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
    const oldBase = cellBase(field, -3, 0);
    const liveBase = cellBase(field, 3, 0);
    const deformation = deformationData(field.deformation);
    expect(deformation[oldBase + 3]).toBe(0);
    expect(deformation[liveBase + 3]).toBeGreaterThan(0);
    field.dispose();
  });

  it('keeps longitudinal push direction stable as a body crosses a blade', () => {
    const field = createInteractionField({
      minX: -2,
      maxX: 2,
      minZ: -2,
      maxZ: 2,
      cellSize: 0.5,
      maxBodies: 1,
      ghostsPerBody: 0,
    });
    const target = cellBase(field, 0.25, 0.25);
    field.update(1 / 60, [{ slot: 0, x: -0.5, z: 0, heading: 0 }]);
    const beforeCrossing = deformationData(field.deformation)[target]!;
    field.update(1 / 60, [{ slot: 0, x: 0.5, z: 0, heading: 0 }]);
    const afterCrossing = deformationData(field.deformation)[target]!;
    expect(beforeCrossing).toBeGreaterThan(128);
    expect(afterCrossing).toBeGreaterThan(128);
    field.dispose();
  });

  it('never reactivates a settled cell after recovery begins', () => {
    const field = createInteractionField({
      minX: -5,
      maxX: 5,
      minZ: -3,
      maxZ: 3,
      cellSize: 0.25,
      maxBodies: 1,
      ghostsPerBody: 32,
      minGhostDistance: 0.2,
      ghostBirthDuration: 0.08,
      maxAge: 1,
    });
    field.update(0, [{ slot: 0, x: -2, z: 0, heading: 0 }]);
    for (let frame = 1; frame <= 60; frame++) {
      field.update(1 / 60, [{ slot: 0, x: -2 + frame / 15, z: 0, heading: 0 }]);
    }

    const target = cellBase(field, 0, 0);
    const recovery: number[] = [];
    for (let frame = 0; frame < 75; frame++) {
      field.update(1 / 60, [{ slot: 0, x: 2, z: 0, heading: 0 }]);
      recovery.push(deformationData(field.deformation)[target + 3]!);
    }
    expect(recovery[0]).toBeGreaterThan(0);
    for (let index = 1; index < recovery.length; index++) {
      expect(recovery[index]).toBeLessThanOrEqual(recovery[index - 1]!);
    }
    const settledAt = recovery.indexOf(0);
    expect(settledAt).toBeGreaterThan(0);
    expect(recovery.slice(settledAt).every((value) => value === 0)).toBe(true);
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
