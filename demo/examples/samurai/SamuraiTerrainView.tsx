// SPDX-License-Identifier: MIT

import { useEffect, useMemo } from 'react';
import * as THREE from 'three/webgpu';
import type { SamuraiHeightfield } from './terrain';

function buildTerrainGeometry(field: SamuraiHeightfield): THREE.BufferGeometry {
  const stride = field.segments + 1;
  const half = field.size / 2;
  const positions = new Float32Array(stride * stride * 3);
  const colors = new Float32Array(stride * stride * 3);
  const indices = new Uint32Array(field.segments * field.segments * 6);
  const shadow = new THREE.Color('#243d2d');
  const meadow = new THREE.Color('#3d6237');
  const lit = new THREE.Color('#66834a');

  for (let row = 0; row <= field.segments; row++) {
    for (let column = 0; column <= field.segments; column++) {
      const vertex = row * stride + column;
      const at = vertex * 3;
      const height = field.heights[vertex]!;
      positions[at] = -half + column * field.cellSize;
      positions[at + 1] = height - 0.045;
      positions[at + 2] = -half + row * field.cellSize;
      const heightMix = THREE.MathUtils.smoothstep(height, -0.55, 1.75);
      const color = shadow.clone().lerp(meadow, 0.58 + heightMix * 0.2).lerp(lit, heightMix * 0.3);
      colors[at] = color.r;
      colors[at + 1] = color.g;
      colors[at + 2] = color.b;
    }
  }

  let cursor = 0;
  for (let row = 0; row < field.segments; row++) {
    for (let column = 0; column < field.segments; column++) {
      const topLeft = row * stride + column;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + stride;
      const bottomRight = bottomLeft + 1;
      indices.set([topLeft, bottomLeft, topRight, topRight, bottomLeft, bottomRight], cursor);
      cursor += 6;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(field.normals, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

export function SamuraiTerrainView({ field }: { readonly field: SamuraiHeightfield }) {
  const geometry = useMemo(() => buildTerrainGeometry(field), [field]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial vertexColors roughness={1} metalness={0} />
    </mesh>
  );
}
