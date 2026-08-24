// SPDX-License-Identifier: MIT

import { useEffect, useMemo } from 'react';
import * as THREE from 'three/webgpu';
import { ISLAND_SEA_LEVEL, type IslandHeightfield } from './terrain';

function mixColor(low: THREE.Color, high: THREE.Color, amount: number): THREE.Color {
  return low.clone().lerp(high, THREE.MathUtils.clamp(amount, 0, 1));
}

function buildTerrainGeometry(field: IslandHeightfield): THREE.BufferGeometry {
  const stride = field.segments + 1;
  const half = field.size / 2;
  const positions = new Float32Array(stride * stride * 3);
  const colors = new Float32Array(stride * stride * 3);
  const indices = new Uint32Array(field.segments * field.segments * 6);
  const submerged = new THREE.Color('#486b68');
  const coastalStone = new THREE.Color('#738577');
  const meadow = new THREE.Color('#6f8758');
  const upland = new THREE.Color('#829365');

  for (let row = 0; row <= field.segments; row++) {
    for (let column = 0; column <= field.segments; column++) {
      const vertex = row * stride + column;
      const at = vertex * 3;
      const height = field.heights[vertex]!;
      positions[at] = -half + column * field.cellSize;
      positions[at + 1] = height;
      positions[at + 2] = -half + row * field.cellSize;
      const wetBlend = THREE.MathUtils.smoothstep(height, ISLAND_SEA_LEVEL - 0.18, 0.22);
      const meadowBlend = THREE.MathUtils.smoothstep(height, 0.12, 0.82);
      const uplandBlend = THREE.MathUtils.smoothstep(height, 1.8, 3.6);
      const color = mixColor(submerged, coastalStone, wetBlend)
        .lerp(meadow, meadowBlend)
        .lerp(upland, uplandBlend * 0.48);
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
      indices.set([
        topLeft, bottomLeft, topRight,
        topRight, bottomLeft, bottomRight,
      ], cursor);
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

export function IslandTerrainView({ field }: { readonly field: IslandHeightfield }) {
  const geometry = useMemo(() => buildTerrainGeometry(field), [field]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <>
      <mesh receiveShadow geometry={geometry}>
        <meshStandardMaterial vertexColors roughness={0.98} metalness={0} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={ISLAND_SEA_LEVEL + 0.015}>
        <planeGeometry args={[field.size * 12, field.size * 12, 1, 1]} />
        <meshStandardMaterial color="#6f9b9a" roughness={0.48} metalness={0} />
      </mesh>
    </>
  );
}
