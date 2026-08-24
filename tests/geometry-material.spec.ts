// SPDX-License-Identifier: MIT

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { wakeRecoveryResponse } from '../src/core/recovery';
import {
  FIELD_GRASS_PRESET,
  STORYBOOK_GRASS_PRESET,
} from '../src/three/grassLayer';
import {
  DEFAULT_GRASS_STYLE,
  STORYBOOK_GRASS_STYLE,
} from '../src/three/grassMaterial';
import {
  bladeCount,
  buildTuftGeometry,
  FIELD_TUFT,
  STORYBOOK_TUFT,
  SURROUND_TUFT,
} from '../src/three/tuftGeometry';

describe('tuft geometry', () => {
  it('builds deterministic named vertex channels for both authored tiers', () => {
    for (const shape of [FIELD_TUFT, SURROUND_TUFT, STORYBOOK_TUFT]) {
      const first = buildTuftGeometry(shape);
      const second = buildTuftGeometry(shape);
      expect(first.getAttribute('position').array).toEqual(second.getAttribute('position').array);
      expect(first.getAttribute('normal')).toBeDefined();
      expect(first.getAttribute('uv')).toBeDefined();
      expect(first.getAttribute('uv1')).toBeDefined();
      first.dispose();
      second.dispose();
    }
    expect(bladeCount(FIELD_TUFT, 100)).toBe(700);
  });

  it('ships storybook as a complete data preset rather than a renderer mode', () => {
    expect(STORYBOOK_GRASS_PRESET.name).toBe('storybook');
    expect(STORYBOOK_GRASS_PRESET.shape).toBe(STORYBOOK_TUFT);
    expect(STORYBOOK_GRASS_PRESET.style).toBe(STORYBOOK_GRASS_STYLE);
    expect(STORYBOOK_GRASS_STYLE.windSpeed).toBeLessThan(DEFAULT_GRASS_STYLE.windSpeed);
    expect(STORYBOOK_GRASS_STYLE.flutterAmplitude).toBeLessThan(DEFAULT_GRASS_STYLE.flutterAmplitude);
    expect(STORYBOOK_GRASS_STYLE.octaveWeights[0]).toBeGreaterThan(DEFAULT_GRASS_STYLE.octaveWeights[0]);
    expect(FIELD_GRASS_PRESET.name).toBe('field');
  });
});

describe('material boundary', () => {
  const source = readFileSync(new URL('../src/three/grassMaterial.ts', import.meta.url), 'utf8');

  it('keeps one TSL node-material path and no game imports', () => {
    expect(source).toContain("from 'three/webgpu'");
    expect(source).toContain('new THREE.MeshBasicNodeMaterial()');
    expect(source).toContain('const coarse = octave(root, travel, 0)');
    expect(source).toContain('const middle = octave(root, travel, 1)');
    expect(source).toContain('const fine = octave(root, travel, 2)');
    expect(source).not.toContain('PRESS_WIND_MASK');
    expect(source).not.toContain('PRESS_FINE_MASK');
    expect(source).not.toContain('PRESSED_COARSE_RETENTION');
    expect(source).not.toContain('PRESSED_DETAIL_RETENTION');
    expect(source).not.toContain('PRESSED_FLUTTER_RETENTION');
    expect(source).not.toContain('coarseRetention');
    expect(source).not.toContain('detailRetention');
    expect(source).not.toContain('flutterRetention');
    expect(source).toContain('texture(deformation, fieldUV, 0)');
    expect(source).toContain("packed.x.mul(float(255)).sub(float(128)).div(float(127))");
    expect(source).toContain('const bladeBias = phase.sub(float(0.5))');
    expect(source).toContain('const tuftBias = fract(seed.mul(float(31.7)))');
    expect(source).not.toContain('recordX');
    expect(source).not.toContain('recordY');
    expect(source).not.toContain('recordZ');
    expect(source).not.toContain('recordW');
    expect(source).not.toContain('evaluateBodyPush');
    expect(source).not.toContain('const slots');
    expect(source).toContain('const coarseOffset = coarseDirection.mul(coarseSway)');
    expect(source).toContain('const fineSway = detailSway.add(flutterSway)');
    expect(source).not.toContain('const SHEEN_MIN = 0.88');
    expect(source).not.toContain('const SHEEN_MAX = 1.14');
    expect(source).not.toMatch(/\.mul\(sheen\)/);
    expect(source).toContain('function valueNoiseField(');
    expect(source).toContain('const patches = valueNoiseField(');
    expect(source).toContain('const mottle = valueNoiseField(');
    expect(source).not.toContain('const patches = sineHashField(');
    expect(source).not.toContain('new THREE.ShaderMaterial');
    expect(source).not.toContain('.onBeforeCompile');
    expect(source).not.toMatch(/@app|@sim|\.\.\/\.\.\/\.\.\/herd/);
    expect(source).toContain('inputs.style ?? DEFAULT_GRASS_STYLE');
  });

  it('settles the wake monotonically with no end-of-life snap', () => {
    const samples = Array.from({ length: 101 }, (_, index) => wakeRecoveryResponse(index * 0.009, 0.9));
    expect(samples[0]).toBe(1);
    expect(samples.at(-1)).toBe(0);
    expect(samples.every((sample) => sample >= 0 && sample <= 1)).toBe(true);
    for (let index = 1; index < samples.length; index++) {
      expect(samples[index]).toBeLessThanOrEqual(samples[index - 1]!);
    }
    expect(wakeRecoveryResponse(0.899, 0.9)).toBeLessThan(0.0000001);
    expect(wakeRecoveryResponse(1.2, 0.9)).toBe(0);
  });
});
