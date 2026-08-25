// SPDX-License-Identifier: MIT

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import type { SamuraiHeightfield } from './terrain';

export { BlossomTree } from './ProceduralBlossomTree';

function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

export function MoonlitSky() {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const context = canvas.getContext('2d')!;
    const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#071217');
    gradient.addColorStop(0.42, '#10282b');
    gradient.addColorStop(0.72, '#27433f');
    gradient.addColorStop(1, '#58706a');
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
    const result = new THREE.CanvasTexture(canvas);
    result.colorSpace = THREE.SRGBColorSpace;
    result.wrapS = THREE.RepeatWrapping;
    return result;
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <>
      <mesh scale={[-1, 1, 1]} frustumCulled={false}>
        <sphereGeometry args={[108, 32, 20]} />
        <meshBasicMaterial map={texture} side={THREE.BackSide} fog={false} depthWrite={false} />
      </mesh>
    </>
  );
}

const STONE_PLACEMENTS = [
  [-9, -7, 0.8, 1.8], [17, 2, 0.7, 2.25], [-18, -17, 0.62, 1.45],
  [5, -21, 0.55, 1.3], [22, -16, 0.72, 1.65], [-14, 13, 0.58, 1.4],
] as const;

export function StoneMarkers({ field }: { readonly field: SamuraiHeightfield }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const dummy = new THREE.Object3D();
    STONE_PLACEMENTS.forEach(([x, z, width, height], index) => {
      dummy.position.set(x, field.heightAt(x, z) + height * 0.46, z);
      dummy.rotation.set(0.06, index * 1.31, (index % 2 ? -1 : 1) * 0.055);
      dummy.scale.set(width, height, width * 0.68);
      dummy.updateMatrix();
      ref.current?.setMatrixAt(index, dummy.matrix);
    });
    if (ref.current) {
      ref.current.instanceMatrix.needsUpdate = true;
      // The constructor starts every instance at the origin. Once the authored
      // world matrices are installed, refresh the aggregate bounds so Three.js
      // does not frustum-cull the whole stone draw against that stale origin.
      ref.current.computeBoundingBox();
      ref.current.computeBoundingSphere();
    }
  }, [field]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, STONE_PLACEMENTS.length]}>
      <dodecahedronGeometry args={[0.5, 0]} />
      <meshStandardMaterial color="#73786b" roughness={0.98} />
    </instancedMesh>
  );
}

interface Petal {
  x: number;
  y: number;
  z: number;
  phase: number;
  speed: number;
  scale: number;
}

function makePetals(): Petal[] {
  const rng = mulberry32(0x0e7a15);
  return Array.from({ length: 280 }, () => ({
    x: -31 + rng() * 62,
    y: 0.8 + rng() * 7.4,
    z: -31 + rng() * 62,
    phase: rng() * Math.PI * 2,
    speed: 0.75 + rng() * 1.35,
    scale: 0.72 + rng() * 0.9,
  }));
}

function makePetalGeometry(): THREE.ShapeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.075);
  shape.bezierCurveTo(-0.04, -0.055, -0.085, -0.005, -0.066, 0.045);
  shape.bezierCurveTo(-0.052, 0.083, -0.022, 0.112, 0, 0.132);
  shape.bezierCurveTo(0.022, 0.112, 0.052, 0.083, 0.066, 0.045);
  shape.bezierCurveTo(0.085, -0.005, 0.04, -0.055, 0, -0.075);
  const geometry = new THREE.ShapeGeometry(shape, 5);
  const positions = geometry.getAttribute('position');
  for (let index = 0; index < positions.count; index++) {
    const y = positions.getY(index);
    const x = positions.getX(index);
    positions.setZ(index, 0.012 + (y + 0.075) * 0.07 - Math.abs(x) * 0.055);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

export function PetalField({ reducedMotion }: { readonly reducedMotion: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const petals = useRef(makePetals());
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const geometry = useMemo(makePetalGeometry, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame(({ clock }, dt) => {
    const elapsed = clock.getElapsedTime();
    petals.current.forEach((petal, index) => {
      if (!reducedMotion) {
        const gust = Math.sin(elapsed * 0.48 + petal.phase * 0.7);
        petal.x += dt * petal.speed * (1.65 + gust * 0.22);
        petal.z += dt * petal.speed * (0.7 + gust * 0.2);
        petal.y += dt * (gust * 0.12 - 0.07);
        if (petal.x > 32 || petal.z > 32 || petal.y < 0.35) {
          petal.x = -32;
          petal.z = -28 + ((index * 17.3) % 56);
          petal.y = 2 + ((index * 7.7) % 6);
        }
      }
      dummy.position.set(
        petal.x,
        petal.y + Math.sin(elapsed * 1.7 + petal.phase) * 0.34,
        petal.z,
      );
      dummy.rotation.set(
        elapsed * 0.9 + petal.phase,
        elapsed * 0.55 + petal.phase * 0.7,
        Math.sin(elapsed + petal.phase),
      );
      dummy.scale.set(petal.scale * 0.92, petal.scale, petal.scale);
      dummy.updateMatrix();
      ref.current?.setMatrixAt(index, dummy.matrix);
    });
    if (ref.current) ref.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, undefined, petals.current.length]}
      frustumCulled={false}
    >
      <meshBasicMaterial color="#e99aad" side={THREE.DoubleSide} transparent opacity={0.9} depthWrite={false} />
    </instancedMesh>
  );
}
