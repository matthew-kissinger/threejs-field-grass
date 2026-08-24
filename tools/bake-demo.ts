// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Matthew Kissinger

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { encodeScatter } from '../src/core/baked';
import { generateScatter } from '../src/core/scatter';
import { DEMO_RECIPE, sampleDemoTuft } from '../demo/recipe';

const output = resolve(import.meta.dirname, '..', 'assets', 'demo');
const groups = generateScatter(DEMO_RECIPE, sampleDemoTuft);
const baked = encodeScatter('tools/bake-demo.ts', DEMO_RECIPE, groups);

mkdirSync(output, { recursive: true });
writeFileSync(resolve(output, 'tufts.bin'), baked.bytes);
writeFileSync(resolve(output, 'manifest.json'), `${JSON.stringify(baked.manifest, null, 2)}\n`);
console.log(`Baked ${baked.bytes.byteLength / baked.manifest.stride} tufts to ${output}`);
