// SPDX-License-Identifier: MIT

import fs from 'node:fs/promises';
import path from 'node:path';
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

class NodeFileReader {
  result = null;
  onloadend = null;

  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((result) => {
      this.result = result;
      this.onloadend?.();
    });
  }

  readAsDataURL(blob) {
    blob.arrayBuffer().then((result) => {
      const bytes = Buffer.from(result);
      this.result = `data:${blob.type || 'application/octet-stream'};base64,${bytes.toString('base64')}`;
      this.onloadend?.();
    });
  }
}

globalThis.FileReader = NodeFileReader;

const [, , idleArgument, walkArgument, attackArgument, outputArgument] = process.argv;
if (!idleArgument || !walkArgument || !attackArgument || !outputArgument) {
  throw new Error(
    'Usage: node tools/build-samurai-runtime.mjs <idle-with-skin.fbx> <walk.fbx> <attack.fbx> <output.glb>',
  );
}

async function parseFbx(filePath) {
  const data = await fs.readFile(filePath);
  const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  return new FBXLoader().parse(arrayBuffer, `${path.dirname(filePath)}${path.sep}`);
}

function namedClip(clip, name, stripHorizontalRootMotion = false) {
  const clean = clip.clone();
  clean.name = name;
  const hips = clean.tracks.find((track) => track.name === 'mixamorigHips.position');
  if (stripHorizontalRootMotion && hips && hips.values.length >= 3) {
    const originX = hips.values[0];
    const originZ = hips.values[2];
    for (let index = 0; index < hips.values.length; index += 3) {
      hips.values[index] = originX;
      hips.values[index + 2] = originZ;
    }
  }
  clean.resetDuration();
  return clean;
}

const idlePath = path.resolve(idleArgument);
const walkPath = path.resolve(walkArgument);
const attackPath = path.resolve(attackArgument);
const outputPath = path.resolve(outputArgument);
const base = await parseFbx(idlePath);
const walk = await parseFbx(walkPath);
const attack = await parseFbx(attackPath);
base.name = 'MixamoSamurai';

const animations = [
  namedClip(base.animations[0], 'SwordIdle'),
  namedClip(walk.animations[0], 'SwordWalk', true),
  namedClip(attack.animations[0], 'SwordSpinAttack', true),
];

const exporter = new GLTFExporter();
const binary = await exporter.parseAsync(base, {
  animations,
  binary: true,
  onlyVisible: false,
});
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, Buffer.from(binary));

const bounds = new THREE.Box3().setFromObject(base);
console.log(JSON.stringify({
  outputPath,
  bytes: binary.byteLength,
  bounds: {
    min: bounds.min.toArray(),
    max: bounds.max.toArray(),
  },
  animations: animations.map((clip) => ({
    name: clip.name,
    duration: clip.duration,
    tracks: clip.tracks.length,
  })),
}));
