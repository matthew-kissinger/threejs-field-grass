// SPDX-License-Identifier: MIT

import { useEffect, useMemo, useRef, type MutableRefObject, type ReactNode } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import type { InteractionField } from '../../../src/index';
import { createProceduralKatanaRig } from './ProceduralKatana';
import { isSamuraiFieldWalkable, type SamuraiHeightfield } from './terrain';

interface MoveIntent {
  x: number;
  z: number;
}

export interface SamuraiMotionState {
  moving: boolean;
  position: THREE.Vector3;
  attackRequest?: number;
  attacking?: boolean;
}

export function requestSamuraiAttack(motion: MutableRefObject<SamuraiMotionState>) {
  motion.current.attackRequest = (motion.current.attackRequest ?? 0) + 1;
}

const MATERIAL_ROLES = {
  gold: new THREE.Color('#b9904f'),
  secondary: new THREE.Color('#211f22'),
  accessories: new THREE.Color('#3a2924'),
  main: new THREE.Color('#8b2f2b'),
  skin: new THREE.Color('#a96f54'),
  hair: new THREE.Color('#171416'),
  sandle: new THREE.Color('#382921'),
} as const;

function roleFor(name: string): keyof typeof MATERIAL_ROLES {
  const lower = name.toLowerCase();
  if (lower.includes('gold')) return 'gold';
  if (lower.includes('secondary')) return 'secondary';
  if (lower.includes('accessor')) return 'accessories';
  if (lower.includes('skin')) return 'skin';
  if (lower.includes('hair')) return 'hair';
  if (lower.includes('sandle')) return 'sandle';
  return 'main';
}

export function SamuraiAvatar({ motion }: { readonly motion: MutableRefObject<SamuraiMotionState> }) {
  const gltf = useLoader(GLTFLoader, './assets/samurai/samurai-quaternius-sword-set.glb');
  const walkWeight = useRef(0);
  const attackWeight = useRef(0);
  const attackPhase = useRef<'ready' | 'active' | 'recover'>('ready');
  const seenAttackRequest = useRef(0);
  const disposeTimer = useRef<number | null>(null);
  const prepared = useMemo(() => {
    const root = cloneSkeleton(gltf.scene);
    const materials = new Map<keyof typeof MATERIAL_ROLES, THREE.MeshStandardMaterial>();
    for (const [role, color] of Object.entries(MATERIAL_ROLES) as [keyof typeof MATERIAL_ROLES, THREE.Color][]) {
      materials.set(role, new THREE.MeshStandardMaterial({
        color,
        emissive: color.clone().multiplyScalar(role === 'main' ? 0.58 : 0.34),
        emissiveIntensity: role === 'main' ? 0.5 : 0.32,
        roughness: role === 'gold' ? 0.48 : 0.82,
        metalness: role === 'gold' ? 0.58 : role === 'accessories' ? 0.2 : 0.03,
        side: THREE.DoubleSide,
      }));
    }
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const sourceMaterial = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      mesh.material = materials.get(roleFor(`${mesh.name} ${sourceMaterial?.name ?? ''}`))!;
      mesh.castShadow = true;
      mesh.receiveShadow = false;
    });
    const katana = createProceduralKatanaRig();
    const rightHand = root.getObjectByName('hand_r');
    const leftHand = root.getObjectByName('hand_l');
    const hips = root.getObjectByName('pelvis');
    if (!rightHand || !leftHand || !hips) {
      throw new Error('Samurai is missing its pelvis or weapon-hand bones.');
    }
    const mixer = new THREE.AnimationMixer(root);
    const idleClip = gltf.animations.find((clip) => clip.name === 'SwordIdle');
    const walkClip = gltf.animations.find((clip) => clip.name === 'SwordWalk');
    const attackClip = gltf.animations.find((clip) => clip.name === 'SwordAttack');
    if (!idleClip || !walkClip || !attackClip) {
      throw new Error('Samurai is missing SwordIdle, SwordWalk, or SwordAttack.');
    }
    const idleAction = mixer.clipAction(idleClip);
    const walkAction = mixer.clipAction(walkClip);
    const attackAction = mixer.clipAction(attackClip);
    idleAction.play();
    mixer.setTime(0);
    root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(root);
    const center = bounds.getCenter(new THREE.Vector3());
    const scale = 2.35 / Math.max(0.001, bounds.max.y - bounds.min.y);
    root.scale.setScalar(scale);
    root.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
    root.updateMatrixWorld(true);
    katana.calibrateTwoHandGrip(rightHand, leftHand);
    katana.calibrateHipCarry(root, hips);
    rightHand.add(katana.handSocket);
    hips.add(katana.hipSocket);
    return {
      root,
      mixer,
      idleAction,
      walkAction,
      attackAction,
      katana,
      materials: [...materials.values()],
    };
  }, [gltf.animations, gltf.scene]);
  useEffect(() => {
    if (disposeTimer.current !== null) {
      window.clearTimeout(disposeTimer.current);
      disposeTimer.current = null;
    }
    prepared.idleAction.reset().setEffectiveWeight(1).play();
    prepared.walkAction.reset().setEffectiveWeight(0).setEffectiveTimeScale(1.08).play();
    prepared.attackAction.setLoop(THREE.LoopOnce, 1);
    prepared.attackAction.clampWhenFinished = true;
    const onFinished = (event: { action: THREE.AnimationAction }) => {
      if (event.action !== prepared.attackAction) return;
      attackPhase.current = 'recover';
      motion.current.attacking = false;
    };
    prepared.mixer.addEventListener('finished', onFinished);
    motion.current.attacking = false;
    return () => {
      prepared.mixer.removeEventListener('finished', onFinished);
      prepared.mixer.stopAllAction();
      motion.current.attacking = false;
      disposeTimer.current = window.setTimeout(() => {
        prepared.mixer.uncacheRoot(prepared.root);
        prepared.katana.dispose();
        prepared.materials.forEach((material) => material.dispose());
        disposeTimer.current = null;
      }, 0);
    };
  }, [motion, prepared]);
  useEffect(() => {
    const onAttackKey = (event: KeyboardEvent) => {
      if (event.repeat || (event.code !== 'Space' && event.code !== 'KeyF')) return;
      if (event.target instanceof HTMLElement && event.target.closest('button, a, input, textarea, select')) return;
      event.preventDefault();
      requestSamuraiAttack(motion);
    };
    window.addEventListener('keydown', onAttackKey);
    return () => window.removeEventListener('keydown', onAttackKey);
  }, [motion]);
  useFrame((_, dt) => {
    const delta = Math.min(dt, 0.05);
    const animationDelta = Math.min(dt, 0.1);
    const attackRequest = motion.current.attackRequest ?? 0;
    if (attackRequest !== seenAttackRequest.current) {
      seenAttackRequest.current = attackRequest;
      if (attackPhase.current === 'ready') {
        attackPhase.current = 'active';
        motion.current.attacking = true;
        prepared.attackAction.reset().setEffectiveWeight(1).play();
      }
    }
    const attacking = attackPhase.current === 'active';
    attackWeight.current = THREE.MathUtils.damp(
      attackWeight.current,
      attacking ? 1 : 0,
      attacking ? 18 : 10,
      animationDelta,
    );
    if (attackPhase.current === 'recover' && attackWeight.current < 0.01) {
      attackPhase.current = 'ready';
      attackWeight.current = 0;
      prepared.attackAction.stop();
    }
    walkWeight.current = THREE.MathUtils.damp(
      walkWeight.current,
      motion.current.moving ? 1 : 0,
      motion.current.moving ? 11 : 7,
      delta,
    );
    const baseWeight = 1 - attackWeight.current;
    prepared.walkAction.setEffectiveWeight(walkWeight.current * baseWeight);
    prepared.idleAction.setEffectiveWeight((1 - walkWeight.current) * baseWeight);
    prepared.attackAction.setEffectiveWeight(attackWeight.current);
    prepared.mixer.update(animationDelta);
    if (window.__FIELD_GRASS_QA__) {
      window.__FIELD_GRASS_QA__.samuraiAnimation = {
        active: attackWeight.current > 0.5 ? 'attack' : walkWeight.current > 0.5 ? 'walk' : 'idle',
        walkWeight: walkWeight.current,
        attackWeight: attackWeight.current,
        attacking: motion.current.attacking ?? false,
      };
    }
  });
  return <primitive object={prepared.root} />;
}

export function SamuraiFallback() {
  return (
    <group>
      <mesh position-y={1.05}>
        <capsuleGeometry args={[0.38, 1.25, 6, 12]} />
        <meshStandardMaterial color="#7c2d2a" roughness={0.85} />
      </mesh>
      <mesh position-y={2.05}>
        <sphereGeometry args={[0.34, 12, 8]} />
        <meshStandardMaterial color="#242024" roughness={0.88} />
      </mesh>
    </group>
  );
}

export function SamuraiController({
  field,
  terrain,
  intent,
  motion,
  children,
}: {
  readonly field: InteractionField;
  readonly terrain: SamuraiHeightfield;
  readonly intent: MutableRefObject<MoveIntent>;
  readonly motion: MutableRefObject<SamuraiMotionState>;
  readonly children: ReactNode;
}) {
  const root = useRef<THREE.Group>(null);
  const visual = useRef<THREE.Group>(null);
  const position = useRef(new THREE.Vector3(0, terrain.heightAt(0, 7), 7));
  const fieldHeading = useRef(-Math.PI / 2);
  const actorYaw = useRef(Math.PI);
  const forward = useMemo(() => new THREE.Vector3(), []);
  const right = useMemo(() => new THREE.Vector3(), []);
  const movement = useMemo(() => new THREE.Vector3(), []);
  const velocity = useMemo(() => new THREE.Vector3(), []);
  const desiredVelocity = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ camera }, dt) => {
    const delta = Math.min(dt, 0.05);
    camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 0.001) forward.set(0, 0, -1);
    forward.normalize();
    right.crossVectors(forward, camera.up).normalize();
    movement.copy(right).multiplyScalar(intent.current.x).addScaledVector(forward, intent.current.z);
    const hasIntent = movement.lengthSq() > 0.001 && !motion.current.attacking;
    if (hasIntent) desiredVelocity.copy(movement).normalize().multiplyScalar(5.35);
    else desiredVelocity.set(0, 0, 0);
    velocity.lerp(
      desiredVelocity,
      1 - Math.exp(-delta * (hasIntent ? 12 : 16)),
    );
    if (!hasIntent && velocity.lengthSq() < 0.0025) velocity.set(0, 0, 0);
    let moved = false;
    if (velocity.lengthSq() > 0.001) {
      const previousX = position.current.x;
      const previousZ = position.current.z;
      const nextX = THREE.MathUtils.clamp(previousX + velocity.x * delta, -28, 28);
      const nextZ = THREE.MathUtils.clamp(previousZ + velocity.z * delta, -28, 28);
      if (isSamuraiFieldWalkable(terrain, nextX, nextZ)) {
        position.current.x = nextX;
        position.current.z = nextZ;
      } else {
        // Slide along a steep boundary instead of stopping dead against it.
        if (isSamuraiFieldWalkable(terrain, nextX, previousZ)) position.current.x = nextX;
        else velocity.x = 0;
        if (isSamuraiFieldWalkable(terrain, position.current.x, nextZ)) position.current.z = nextZ;
        else velocity.z = 0;
      }
      movement.set(position.current.x - previousX, 0, position.current.z - previousZ);
      moved = movement.lengthSq() > 1e-8;
      if (moved) {
        fieldHeading.current = Math.atan2(movement.z, movement.x);
        const targetYaw = Math.atan2(movement.x, movement.z);
        const turn = THREE.MathUtils.euclideanModulo(targetYaw - actorYaw.current + Math.PI, Math.PI * 2) - Math.PI;
        actorYaw.current += turn * (1 - Math.exp(-delta * 11));
      }
    }
    motion.current.moving = moved;
    position.current.y = terrain.heightAt(position.current.x, position.current.z);
    motion.current.position.copy(position.current);
    if (root.current) {
      root.current.position.copy(position.current);
      root.current.rotation.y = actorYaw.current;
    }
    if (visual.current) visual.current.rotation.x = THREE.MathUtils.damp(visual.current.rotation.x, moved ? -0.025 : 0, 8, delta);
    if (window.__FIELD_GRASS_QA__) {
      window.__FIELD_GRASS_QA__.player = {
        x: position.current.x,
        y: position.current.y + 1,
        z: position.current.z,
      };
    }
    field.update(delta, [{
      slot: 0,
      x: position.current.x,
      z: position.current.z,
      heading: fieldHeading.current,
    }]);
  }, -2);

  return (
    <group ref={root}>
      <mesh rotation-x={-Math.PI / 2} position-y={0.025} scale={[1.12, 0.72, 1]}>
        <circleGeometry args={[0.62, 24]} />
        <meshBasicMaterial color="#15261c" transparent opacity={0.28} depthWrite={false} />
      </mesh>
      <group ref={visual}>{children}</group>
    </group>
  );
}
