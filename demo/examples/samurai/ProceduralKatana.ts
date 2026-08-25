// SPDX-License-Identifier: MIT

import * as THREE from 'three/webgpu';

interface WeaponMaterials {
  readonly blade: THREE.MeshStandardMaterial;
  readonly steel: THREE.MeshStandardMaterial;
  readonly iron: THREE.MeshStandardMaterial;
  readonly lacquer: THREE.MeshStandardMaterial;
  readonly wrap: THREE.MeshStandardMaterial;
  readonly brass: THREE.MeshStandardMaterial;
}

export interface ProceduralKatanaRig {
  readonly handSocket: THREE.Group;
  readonly hipSocket: THREE.Group;
  calibrateTwoHandGrip(rightHand: THREE.Object3D, leftHand: THREE.Object3D): void;
  calibrateHipCarry(actorRoot: THREE.Object3D, hips: THREE.Object3D): void;
  dispose(): void;
}

function createMaterials(): WeaponMaterials {
  return {
    blade: new THREE.MeshStandardMaterial({
      color: '#d8dee0',
      emissive: '#354044',
      emissiveIntensity: 0.18,
      roughness: 0.28,
      metalness: 0.78,
    }),
    steel: new THREE.MeshStandardMaterial({
      color: '#8c9497',
      roughness: 0.32,
      metalness: 0.82,
    }),
    iron: new THREE.MeshStandardMaterial({
      color: '#171719',
      roughness: 0.62,
      metalness: 0.55,
    }),
    lacquer: new THREE.MeshStandardMaterial({
      color: '#1b1113',
      roughness: 0.3,
      metalness: 0.16,
    }),
    wrap: new THREE.MeshStandardMaterial({
      color: '#712824',
      roughness: 0.9,
      metalness: 0.02,
    }),
    brass: new THREE.MeshStandardMaterial({
      color: '#b78a49',
      roughness: 0.42,
      metalness: 0.7,
    }),
  };
}

function bladeGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(-0.034, 0);
  shape.bezierCurveTo(-0.04, 0.3, -0.015, 0.62, 0.037, 0.86);
  shape.quadraticCurveTo(0.063, 0.94, 0.0, 0.985);
  shape.bezierCurveTo(0.006, 0.69, -0.009, 0.32, 0.018, 0);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.02,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.004,
    bevelThickness: 0.003,
    curveSegments: 10,
  });
  geometry.translate(0, 0, -0.006);
  geometry.computeVertexNormals();
  return geometry;
}

function addMesh(group: THREE.Group, geometry: THREE.BufferGeometry, material: THREE.Material, name: string) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = true;
  group.add(mesh);
  return mesh;
}

function createHilt(materials: WeaponMaterials) {
  const hilt = new THREE.Group();
  hilt.name = 'KatanaHilt';

  const guard = addMesh(
    hilt,
    new THREE.CylinderGeometry(0.07, 0.07, 0.013, 20),
    materials.iron,
    'Tsuba',
  );
  guard.position.y = -0.012;

  const habaki = addMesh(hilt, new THREE.BoxGeometry(0.052, 0.055, 0.03), materials.brass, 'Habaki');
  habaki.position.y = 0.018;

  const grip = addMesh(
    hilt,
    new THREE.CylinderGeometry(0.024, 0.029, 0.255, 12),
    materials.iron,
    'TsukaCore',
  );
  grip.position.y = -0.15;

  const wrapGeometry = new THREE.TorusGeometry(0.029, 0.0042, 5, 12);
  for (let i = 0; i < 8; i += 1) {
    const wrap = addMesh(hilt, wrapGeometry, materials.wrap, `TsukaWrap${i + 1}`);
    wrap.position.y = -0.055 - i * 0.028;
    wrap.rotation.x = Math.PI / 2;
    wrap.scale.set(1, 0.82, 1);
  }

  const pommel = addMesh(
    hilt,
    new THREE.CylinderGeometry(0.032, 0.028, 0.028, 12),
    materials.brass,
    'Kashira',
  );
  pommel.position.y = -0.29;
  return hilt;
}

function createUnsheathedSword(materials: WeaponMaterials) {
  const sword = new THREE.Group();
  sword.name = 'UnsheathedKatana';
  sword.add(createHilt(materials));
  addMesh(sword, bladeGeometry(), materials.blade, 'KatanaBlade');

  const ridge = addMesh(
    sword,
    new THREE.BoxGeometry(0.011, 0.78, 0.006),
    materials.steel,
    'KatanaRidge',
  );
  ridge.position.set(0.004, 0.4, 0.009);
  ridge.rotation.z = -0.018;
  return sword;
}

function createSaya(materials: WeaponMaterials) {
  const saya = new THREE.Group();
  saya.name = 'KatanaSaya';
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.008, 0.28, 0),
    new THREE.Vector3(0.023, 0.58, 0),
    new THREE.Vector3(0.055, 0.91, 0),
  ]);
  addMesh(saya, new THREE.TubeGeometry(curve, 24, 0.037, 10, false), materials.lacquer, 'SayaBody');

  const koiguchi = addMesh(
    saya,
    new THREE.CylinderGeometry(0.044, 0.044, 0.032, 12),
    materials.brass,
    'Koiguchi',
  );
  koiguchi.position.y = 0.005;

  const endCap = addMesh(
    saya,
    new THREE.CylinderGeometry(0.04, 0.035, 0.04, 12),
    materials.brass,
    'Kojiri',
  );
  endCap.position.set(0.055, 0.91, 0);
  endCap.rotation.z = -0.09;

  for (let i = 0; i < 3; i += 1) {
    const cord = addMesh(
      saya,
      new THREE.TorusGeometry(0.042, 0.0045, 5, 12),
      materials.wrap,
      `SageoWrap${i + 1}`,
    );
    cord.position.y = 0.13 + i * 0.027;
    cord.rotation.x = Math.PI / 2;
  }
  return saya;
}

export function createProceduralKatanaRig(): ProceduralKatanaRig {
  const handMaterials = createMaterials();
  const sayaMaterials = createMaterials();
  const handSocket = new THREE.Group();
  handSocket.name = 'RightHandKatanaSocket';
  handSocket.scale.setScalar(1.02);
  handSocket.add(createUnsheathedSword(handMaterials));

  const hipSocket = new THREE.Group();
  hipSocket.name = 'HipKatanaSocket';
  hipSocket.scale.setScalar(0.5);
  const sheath = createSaya(sayaMaterials);
  hipSocket.add(sheath);

  const allMaterials = [
    ...Object.values(handMaterials),
    ...Object.values(sayaMaterials),
  ];
  const geometries = new Set<THREE.BufferGeometry>();
  handSocket.traverse((object) => {
    if ((object as THREE.Mesh).isMesh) geometries.add((object as THREE.Mesh).geometry);
  });
  hipSocket.traverse((object) => {
    if ((object as THREE.Mesh).isMesh) geometries.add((object as THREE.Mesh).geometry);
  });

  return {
    handSocket,
    hipSocket,
    calibrateTwoHandGrip(rightHand, leftHand) {
      rightHand.updateWorldMatrix(true, false);
      leftHand.updateWorldMatrix(true, false);
      const rightWorldPosition = rightHand.getWorldPosition(new THREE.Vector3());
      const handPlaneDirection = leftHand
        .getWorldPosition(new THREE.Vector3())
        .sub(rightWorldPosition);
      if (handPlaneDirection.lengthSq() < 0.0001) {
        throw new Error('Sword grip hands are too close to calibrate the katana socket.');
      }
      // Keep the blade clearly outboard of the silhouette. Quaternius' guard is
      // one-handed, so it needs a stronger lateral component than the old
      // nearly vertical great-sword calibration.
      const handleDirectionWorld = handPlaneDirection
        .normalize()
        .multiplyScalar(0.5)
        .addScaledVector(new THREE.Vector3(0, -1, 0), 0.5)
        .normalize();
      const inverseHandWorldRotation = rightHand.getWorldQuaternion(new THREE.Quaternion()).invert();
      const handleDirectionLocal = handleDirectionWorld.clone().applyQuaternion(inverseHandWorldRotation);
      const bladeUpWorld = handleDirectionWorld.clone().negate();
      const forwardReference = new THREE.Vector3(0, 0, 1);
      const bladeNormalWorld = forwardReference
        .clone()
        .addScaledVector(bladeUpWorld, -forwardReference.dot(bladeUpWorld))
        .normalize();
      const bladeWidthWorld = new THREE.Vector3().crossVectors(bladeUpWorld, bladeNormalWorld).normalize();
      bladeNormalWorld.crossVectors(bladeWidthWorld, bladeUpWorld).normalize();
      const socketWorldRotation = new THREE.Quaternion().setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(bladeWidthWorld, bladeUpWorld, bladeNormalWorld),
      );
      handSocket.quaternion.copy(inverseHandWorldRotation).multiply(socketWorldRotation);
      const fingerBaseNames = ['middle_01_r'];
      const palmCenterLocal = new THREE.Vector3();
      for (const boneName of fingerBaseNames) {
        const fingerBase = rightHand.getObjectByName(boneName);
        if (!fingerBase) throw new Error(`Sword hand is missing a supported finger base (${boneName}).`);
        palmCenterLocal.add(rightHand.worldToLocal(fingerBase.getWorldPosition(new THREE.Vector3())));
      }
      // Finger-base centroid is the knuckle line. Move 58% of the wrist-to-knuckle
      // distance into the hand to land in the palm rather than on the wrist pivot.
      palmCenterLocal.multiplyScalar(0.58 / fingerBaseNames.length);
      // The katana origin is its guard. Place it 5.5 cm above the palm anchor so
      // the wrapped grip passes through the derived palm center.
      handSocket.position.copy(palmCenterLocal).addScaledVector(handleDirectionLocal, -0.055);
    },
    calibrateHipCarry(actorRoot, hips) {
      actorRoot.updateWorldMatrix(true, false);
      hips.updateWorldMatrix(true, false);
      const bounds = new THREE.Box3().setFromObject(actorRoot);
      const height = Math.max(0.001, bounds.max.y - bounds.min.y);
      const center = bounds.getCenter(new THREE.Vector3());
      const mouthWorld = new THREE.Vector3(
        center.x + height * 0.15,
        bounds.min.y + height * 0.46,
        center.z + height * 0.018,
      );
      const carryDirectionWorld = new THREE.Vector3(0.5, -0.82, -0.27).normalize();
      const tipWorld = mouthWorld.clone().addScaledVector(carryDirectionWorld, height * 0.42);
      const mouthHipsLocal = hips.worldToLocal(mouthWorld);
      const tipHipsLocal = hips.worldToLocal(tipWorld);
      const carryDirectionHipsLocal = tipHipsLocal.sub(mouthHipsLocal).normalize();
      hipSocket.position.copy(mouthHipsLocal);
      hipSocket.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), carryDirectionHipsLocal);
    },
    dispose() {
      geometries.forEach((geometry) => geometry.dispose());
      allMaterials.forEach((material) => material.dispose());
    },
  };
}
