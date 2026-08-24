// SPDX-License-Identifier: MIT

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  FIELD_GRASS_PRESET,
  STORYBOOK_GRASS_PRESET,
} from '../src/three/grassLayer';
import {
  DEFAULT_GRASS_STYLE,
  springResponse,
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
    expect(source).toContain('const PRESS_WIND_MASK_START = 0.018');
    expect(source).toContain('const PRESS_WIND_MASK_END = 0.16');
    expect(source).toContain('const PRESS_FINE_MASK_START = 0.004');
    expect(source).toContain('const PRESS_FINE_MASK_END = 0.075');
    expect(source).toContain('const PRESSED_COARSE_RETENTION = 0.22');
    expect(source).toContain('const PRESSED_DETAIL_RETENTION = 0.06');
    expect(source).toContain('const PRESSED_FLUTTER_RETENTION = 0.015');
    expect(source).toContain('const localPress = tslMax(horizontalPress, verticalPress)');
    expect(source).toContain('const windMask = smoothstep(');
    expect(source).toContain('const fineMask = smoothstep(');
    expect(source).toContain('const birth = mix(');
    expect(source).toContain('interaction.config.ghostBirthDuration');
    expect(source).toContain('const coarseOffset = coarseDirection.mul(coarseSway.mul(coarseRetention))');
    expect(source).toContain('detailSway.mul(detailRetention).add(flutterSway.mul(flutterRetention))');
    expect(source.indexOf('const localPress')).toBeLessThan(source.indexOf('const displaceX'));
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

  it('settles the wake continuously to zero at its configured expiry', () => {
    expect(Math.abs(springResponse(0.899, 0.9))).toBeLessThan(0.00001);
    expect(Math.abs(springResponse(0.9, 0.9))).toBe(0);
    expect(Math.abs(springResponse(1.2, 0.9))).toBe(0);
  });
});
