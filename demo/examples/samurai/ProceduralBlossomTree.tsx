// SPDX-License-Identifier: MIT

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three/webgpu';
import {
  SAMURAI_TREE_X,
  SAMURAI_TREE_Z,
  type SamuraiHeightfield,
} from './terrain';

interface TreeInstance {
  readonly matrix: THREE.Matrix4;
  readonly color: THREE.Color;
}

interface TreeSculpt {
  readonly trunk: THREE.BufferGeometry;
  readonly branches: TreeInstance[];
  readonly flowers: TreeInstance[];
  readonly shadowClusters: THREE.Matrix4[];
}

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

function segmentMatrix(start: THREE.Vector3, end: THREE.Vector3, radius: number): THREE.Matrix4 {
  const direction = end.clone().sub(start);
  const length = direction.length();
  const midpoint = start.clone().add(end).multiplyScalar(0.5);
  const rotation = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.normalize(),
  );
  return new THREE.Matrix4().compose(
    midpoint,
    rotation,
    new THREE.Vector3(radius, length, radius),
  );
}

function continuousTrunkGeometry(points: readonly THREE.Vector3[]): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3([...points], false, 'centripetal', 0.5);
  const tubularSegments = 72;
  const radialSegments = 16;
  const frames = curve.computeFrenetFrames(tubularSegments, false);
  const positions = new Float32Array((tubularSegments + 1) * radialSegments * 3);
  const uvs = new Float32Array((tubularSegments + 1) * radialSegments * 2);
  const colors = new Float32Array((tubularSegments + 1) * radialSegments * 3);
  const indices = new Uint32Array(tubularSegments * radialSegments * 6);
  const center = new THREE.Vector3();
  const radial = new THREE.Vector3();

  for (let ring = 0; ring <= tubularSegments; ring++) {
    const t = ring / tubularSegments;
    curve.getPointAt(t, center);
    const taper = THREE.MathUtils.lerp(0.93, 0.2, Math.pow(t, 0.82));
    const rootFlare = 0.42 * Math.exp(-t * 13);
    const radius = taper + rootFlare;
    for (let side = 0; side < radialSegments; side++) {
      const angle = side / radialSegments * Math.PI * 2;
      const barkRelief = 1
        + Math.sin(angle * 3 + t * 8.4) * 0.035
        + Math.sin(angle * 5 - t * 5.1) * 0.018;
      radial.copy(frames.normals[ring]!).multiplyScalar(Math.cos(angle))
        .addScaledVector(frames.binormals[ring]!, Math.sin(angle))
        .multiplyScalar(radius * barkRelief)
        .add(center);
      const vertex = ring * radialSegments + side;
      const at = vertex * 3;
      positions[at] = radial.x;
      positions[at + 1] = radial.y;
      positions[at + 2] = radial.z;
      uvs[vertex * 2] = side / radialSegments;
      uvs[vertex * 2 + 1] = t * 3.2;
      const shade = 0.9 + Math.sin(angle * 2.7 + t * 4.2) * 0.035;
      colors[at] = shade;
      colors[at + 1] = shade * 0.98;
      colors[at + 2] = shade * 0.96;
    }
  }

  let cursor = 0;
  for (let ring = 0; ring < tubularSegments; ring++) {
    for (let side = 0; side < radialSegments; side++) {
      const nextSide = (side + 1) % radialSegments;
      const here = ring * radialSegments + side;
      const around = ring * radialSegments + nextSide;
      const above = (ring + 1) * radialSegments + side;
      const aboveAround = (ring + 1) * radialSegments + nextSide;
      // Ring angles advance from the Frenet normal toward its binormal. The
      // previous tangent-first winding pointed every triangle inward, so the
      // visible bark was the tube's far interior. Wind both triangles outward.
      indices.set([here, around, above, around, aboveAround, above], cursor);
      cursor += 6;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function flowerGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const petals = 5;
  for (let petal = 0; petal < petals; petal++) {
    const angle = petal / petals * Math.PI * 2;
    const side = 0.34;
    const length = 1;
    const center = [Math.cos(angle) * 0.08, Math.sin(angle) * 0.08, 0.04];
    const left = [
      Math.cos(angle - 0.48) * side,
      Math.sin(angle - 0.48) * side,
      0,
    ];
    const tip = [Math.cos(angle) * length, Math.sin(angle) * length, 0.12];
    const right = [
      Math.cos(angle + 0.48) * side,
      Math.sin(angle + 0.48) * side,
      0,
    ];
    positions.push(...center, ...left, ...tip, ...center, ...tip, ...right);
    for (let vertex = 0; vertex < 6; vertex++) normals.push(0, 0, 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

function barkTextures(): { color: THREE.CanvasTexture; bump: THREE.CanvasTexture } {
  const colorCanvas = document.createElement('canvas');
  const bumpCanvas = document.createElement('canvas');
  colorCanvas.width = bumpCanvas.width = 128;
  colorCanvas.height = bumpCanvas.height = 256;
  const color = colorCanvas.getContext('2d')!;
  const bump = bumpCanvas.getContext('2d')!;
  const rng = mulberry32(0xba4c771);

  color.fillStyle = '#4a392f';
  color.fillRect(0, 0, colorCanvas.width, colorCanvas.height);
  bump.fillStyle = '#858585';
  bump.fillRect(0, 0, bumpCanvas.width, bumpCanvas.height);

  for (let groove = 0; groove < 155; groove++) {
    const x = rng() * colorCanvas.width;
    const width = 0.5 + rng() * 2.2;
    const sway = (rng() - 0.5) * 16;
    const startY = -20 + rng() * 80;
    const endY = startY + 120 + rng() * 180;
    const dark = 22 + Math.floor(rng() * 28);
    color.strokeStyle = `rgba(${dark}, ${dark * 0.78}, ${dark * 0.62}, ${0.28 + rng() * 0.38})`;
    color.lineWidth = width;
    color.beginPath();
    color.moveTo(x, startY);
    color.bezierCurveTo(x + sway, startY + 55, x - sway * 0.6, endY - 48, x + sway * 0.3, endY);
    color.stroke();
    bump.strokeStyle = `rgba(${30 + Math.floor(rng() * 35)}, ${30 + Math.floor(rng() * 35)}, ${30 + Math.floor(rng() * 35)}, 0.72)`;
    bump.lineWidth = width * 0.72;
    bump.beginPath();
    bump.moveTo(x, startY);
    bump.bezierCurveTo(x + sway, startY + 55, x - sway * 0.6, endY - 48, x + sway * 0.3, endY);
    bump.stroke();
  }

  for (let ridge = 0; ridge < 55; ridge++) {
    color.strokeStyle = `rgba(185, 151, 116, ${0.05 + rng() * 0.08})`;
    color.lineWidth = 1 + rng() * 2;
    color.beginPath();
    const x = rng() * 128;
    color.moveTo(x, -10);
    color.lineTo(x + (rng() - 0.5) * 22, 266);
    color.stroke();
  }

  const colorTexture = new THREE.CanvasTexture(colorCanvas);
  colorTexture.colorSpace = THREE.SRGBColorSpace;
  const bumpTexture = new THREE.CanvasTexture(bumpCanvas);
  for (const texture of [colorTexture, bumpTexture]) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1.4, 2.8);
  }
  return { color: colorTexture, bump: bumpTexture };
}

function createTreeSculpt(): TreeSculpt {
  const rng = mulberry32(0xe43a1da7);
  const branches: TreeInstance[] = [];
  const flowers: TreeInstance[] = [];
  // Coarse canopy shadow proxies are standard foliage rendering practice: the
  // visible petal cards keep their fine silhouette, while a handful of organic
  // volumes give the moon shadow map stable mass and intentional openings.
  // They never write to the beauty pass.
  const shadowClusters = [
    [-4.2, 8.7, -0.4, 1.5, 1.05, 1.25],
    [-2.7, 9.5, -1.1, 1.7, 1.25, 1.45],
    [-1, 10.1, -0.4, 1.55, 1.3, 1.4],
    [0.9, 10.2, 0.1, 1.65, 1.25, 1.35],
    [2.8, 9.6, -0.8, 1.7, 1.2, 1.45],
    [4.3, 8.9, 0.1, 1.4, 1, 1.2],
    [-3.3, 9.5, 1.7, 1.55, 1.15, 1.35],
    [-1.4, 10.5, 1.8, 1.45, 1.2, 1.35],
    [0.8, 10.7, 1.8, 1.55, 1.15, 1.35],
    [3, 9.8, 1.7, 1.45, 1.05, 1.25],
  ].map(([x, y, z, sx, sy, sz]) => new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion(),
    new THREE.Vector3(sx, sy, sz),
  ));
  const up = new THREE.Vector3(0, 1, 0);
  const barkBase = new THREE.Color('#d8c1af');

  const addSegment = (start: THREE.Vector3, end: THREE.Vector3, radius: number, shade = 1) => {
    branches.push({
      matrix: segmentMatrix(start, end, radius),
      color: barkBase.clone().multiplyScalar(shade),
    });
  };

  const addFlowerSpray = (anchor: THREE.Vector3, direction: THREE.Vector3, count: number) => {
    for (let index = 0; index < count; index++) {
      const position = anchor.clone().add(new THREE.Vector3(
        (rng() - 0.5) * 0.9,
        (rng() - 0.35) * 0.72,
        (rng() - 0.5) * 0.9,
      ));
      position.addScaledVector(direction, (rng() - 0.25) * 0.5);
      const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(
        rng() * Math.PI,
        rng() * Math.PI * 2,
        rng() * Math.PI,
      ));
      const scale = 0.22 + rng() * 0.18;
      flowers.push({
        matrix: new THREE.Matrix4().compose(
          position,
          rotation,
          new THREE.Vector3(scale * (0.82 + rng() * 0.36), scale, scale),
        ),
        color: new THREE.Color().setHSL(
          0.965 + rng() * 0.018,
          0.34 + rng() * 0.22,
          0.82 + rng() * 0.13,
        ),
      });
    }
  };

  const growBranch = (
    start: THREE.Vector3,
    initialDirection: THREE.Vector3,
    length: number,
    radius: number,
    depth: number,
  ) => {
    let current = start.clone();
    const direction = initialDirection.clone().normalize();
    const points: THREE.Vector3[] = [];
    for (let segment = 0; segment < 3; segment++) {
      const tangent = new THREE.Vector3().crossVectors(direction, up);
      if (tangent.lengthSq() < 0.001) tangent.set(1, 0, 0);
      tangent.normalize();
      direction.addScaledVector(tangent, (rng() - 0.5) * (0.19 + segment * 0.03));
      direction.y += 0.028 + (rng() - 0.46) * 0.065;
      direction.normalize();
      const next = current.clone().addScaledVector(
        direction,
        length / 3 * (0.88 + rng() * 0.2),
      );
      addSegment(current, next, radius * (1 - segment * 0.16), 0.76 + rng() * 0.18);
      current = next;
      points.push(next);
    }

    if (depth <= 0) {
      addFlowerSpray(points[1]!, direction, 5 + Math.floor(rng() * 4));
      addFlowerSpray(points[2]!, direction, 10 + Math.floor(rng() * 7));
      return;
    }

    if (depth === 1) {
      addFlowerSpray(points[1]!, direction, 4 + Math.floor(rng() * 4));
      addFlowerSpray(points[2]!, direction, 6 + Math.floor(rng() * 5));
    }

    const side = new THREE.Vector3().crossVectors(direction, up);
    if (side.lengthSq() < 0.001) side.set(1, 0, 0);
    side.normalize();
    const binormal = new THREE.Vector3().crossVectors(direction, side).normalize();
    const children = depth >= 2 ? 3 : 2;
    const forkPlane = rng() * Math.PI * 2;
    for (let child = 0; child < children; child++) {
      const phase = forkPlane + child / children * Math.PI * 2 + (rng() - 0.5) * 0.52;
      const continuation = child === 0;
      const childDirection = direction.clone().multiplyScalar(continuation ? 0.92 : 0.68)
        .addScaledVector(side, Math.cos(phase) * (continuation ? 0.18 : 0.56))
        .addScaledVector(binormal, Math.sin(phase) * (continuation ? 0.12 : 0.38));
      childDirection.y += (continuation ? 0.1 : 0.16) + (rng() - 0.42) * 0.16;
      growBranch(
        current,
        childDirection,
        length * (0.52 + rng() * 0.11),
        radius * 0.59,
        depth - 1,
      );
    }
  };

  const trunkPoints = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.12, 0.9, 0.04),
    new THREE.Vector3(-0.14, 1.84, 0.1),
    new THREE.Vector3(0.18, 2.82, -0.04),
    new THREE.Vector3(-0.08, 3.82, 0.1),
    new THREE.Vector3(-0.36, 4.82, -0.04),
    new THREE.Vector3(0.06, 5.78, 0.08),
    new THREE.Vector3(-0.2, 6.66, -0.06),
    new THREE.Vector3(0.18, 7.48, 0.02),
    new THREE.Vector3(-0.02, 8.24, -0.04),
  ];
  const trunk = continuousTrunkGeometry(trunkPoints);

  for (let root = 0; root < 11; root++) {
    const angle = root / 11 * Math.PI * 2 + (rng() - 0.5) * 0.22;
    const start = new THREE.Vector3(Math.cos(angle) * 0.2, 0.24, Math.sin(angle) * 0.2);
    let current = start;
    for (let section = 0; section < 3; section++) {
      const reach = 0.68 + rng() * 0.34;
      const next = current.clone().add(new THREE.Vector3(
        Math.cos(angle + (rng() - 0.5) * 0.12) * reach,
        -0.08 - section * 0.045,
        Math.sin(angle + (rng() - 0.5) * 0.12) * reach,
      ));
      addSegment(current, next, (0.3 - section * 0.075) * (0.82 + rng() * 0.24), 0.77 + rng() * 0.12);
      current = next;
    }
  }

  const limbs = [
    [3, 3.18, 5.8, 0.48, 4, 0.1],
    [4, 0.08, 6.2, 0.43, 4, 0.16],
    [4, 4.64, 5, 0.38, 4, 0.24],
    [5, 2.54, 5.05, 0.35, 4, 0.34],
    [6, 5.78, 4.8, 0.32, 4, 0.42],
    [6, 1.38, 4.5, 0.3, 4, 0.5],
    [7, 3.72, 4.05, 0.27, 3, 0.6],
    [8, 0.82, 3.8, 0.24, 3, 0.68],
    [8, 2.12, 3.35, 0.22, 3, 0.76],
  ] as const;
  for (const [originIndex, angle, length, radius, depth, lift] of limbs) {
    const origin = trunkPoints[originIndex]!.clone();
    const windBias = Math.cos(angle) > 0 ? 1.08 : 0.93;
    growBranch(
      origin,
      new THREE.Vector3(
        Math.cos(angle),
        lift + rng() * 0.14,
        Math.sin(angle),
      ),
      length * windBias,
      radius,
      depth,
    );
  }

  growBranch(
    trunkPoints[9]!,
    new THREE.Vector3(0.22, 1, -0.08),
    3.6,
    0.18,
    3,
  );

  return { trunk, branches, flowers, shadowClusters };
}

export function BlossomTree({ field }: { readonly field: SamuraiHeightfield }) {
  const branchRef = useRef<THREE.InstancedMesh>(null);
  const flowerRef = useRef<THREE.InstancedMesh>(null);
  const shadowRef = useRef<THREE.InstancedMesh>(null);
  const tree = useMemo(createTreeSculpt, []);
  const flower = useMemo(flowerGeometry, []);
  const bark = useMemo(barkTextures, []);

  useEffect(() => {
    tree.branches.forEach((branch, index) => {
      branchRef.current?.setMatrixAt(index, branch.matrix);
      branchRef.current?.setColorAt(index, branch.color);
    });
    tree.flowers.forEach((blossom, index) => {
      flowerRef.current?.setMatrixAt(index, blossom.matrix);
      flowerRef.current?.setColorAt(index, blossom.color);
    });
    tree.shadowClusters.forEach((matrix, index) => {
      shadowRef.current?.setMatrixAt(index, matrix);
    });
    if (branchRef.current) {
      branchRef.current.instanceMatrix.needsUpdate = true;
      if (branchRef.current.instanceColor) branchRef.current.instanceColor.needsUpdate = true;
    }
    if (flowerRef.current) {
      flowerRef.current.instanceMatrix.needsUpdate = true;
      if (flowerRef.current.instanceColor) flowerRef.current.instanceColor.needsUpdate = true;
    }
    if (shadowRef.current) shadowRef.current.instanceMatrix.needsUpdate = true;
  }, [tree]);

  useEffect(() => () => {
    tree.trunk.dispose();
    flower.dispose();
    bark.color.dispose();
    bark.bump.dispose();
  }, [bark, flower, tree]);

  return (
    <group
      position={[
        SAMURAI_TREE_X,
        field.heightAt(SAMURAI_TREE_X, SAMURAI_TREE_Z) + 0.02,
        SAMURAI_TREE_Z,
      ]}
      rotation-y={-0.34}
      scale={[0.74, 0.74, 0.74]}
    >
      <mesh geometry={tree.trunk} castShadow receiveShadow>
        <meshStandardMaterial
          map={bark.color}
          bumpMap={bark.bump}
          bumpScale={0.075}
          color="#ffffff"
          vertexColors
          roughness={0.92}
          metalness={0}
        />
      </mesh>
      <instancedMesh
        ref={branchRef}
        args={[undefined, undefined, tree.branches.length]}
        castShadow
        receiveShadow
        frustumCulled={false}
      >
        <cylinderGeometry args={[0.72, 1, 1, 9, 1, false]} />
        <meshStandardMaterial
          map={bark.color}
          bumpMap={bark.bump}
          bumpScale={0.075}
          color="#ffffff"
          vertexColors
          roughness={0.92}
          metalness={0}
        />
      </instancedMesh>
      <instancedMesh
        ref={flowerRef}
        args={[flower, undefined, tree.flowers.length]}
        castShadow
        receiveShadow
        frustumCulled={false}
      >
        <meshStandardMaterial
          color="#fff0eb"
          vertexColors
          roughness={0.86}
          side={THREE.DoubleSide}
          alphaTest={0.01}
        />
      </instancedMesh>
      <instancedMesh
        ref={shadowRef}
        args={[undefined, undefined, tree.shadowClusters.length]}
        castShadow
        frustumCulled={false}
      >
        <icosahedronGeometry args={[1, 1]} />
        <meshBasicMaterial colorWrite={false} depthWrite={false} />
      </instancedMesh>
    </group>
  );
}
