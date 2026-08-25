// SPDX-License-Identifier: MIT

import type { GrassPreset, TuftShape } from '../../../src/index';

export const EMERALD_DAWN_TUFT: TuftShape = {
  blades: 8,
  rows: [0, 0.28, 0.58, 0.82],
  clumpRadius: 0.32,
  height: 0.86,
  halfWidth: 0.072,
  seed: 0xe41d,
};

export const EMERALD_DAWN_PRESET: GrassPreset = {
  name: 'emerald-dawn',
  shape: EMERALD_DAWN_TUFT,
  palette: {
    dark: '#123529',
    light: '#3e7250',
    surround: '#24573c',
    wornEarth: '#424d3b',
    sunGlow: '#a7c9b6',
  },
  style: {
    windSpeed: 4.5,
    octaveWeights: [0.75, 0.19, 0.06],
    windReach: 0.56,
    flutterRate: 2.8,
    flutterAmplitude: 0.012,
    tipGold: 0.1,
    tintMin: 0.82,
    tintMax: 1.05,
    clumpHue: 0.4,
  },
};
