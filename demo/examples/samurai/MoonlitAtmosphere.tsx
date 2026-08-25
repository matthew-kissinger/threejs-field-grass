// SPDX-License-Identifier: MIT

import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  Fn,
  If,
  clamp,
  color,
  dot,
  float,
  fract,
  int,
  length,
  max,
  mix,
  pass,
  pow,
  rtt,
  screenUV,
  sin,
  smoothstep,
  step,
  uniform,
  vec2,
} from 'three/tsl';
import { bilateralBlur } from 'three/addons/tsl/display/BilateralBlurNode.js';
import { depthAwareBlend } from 'three/addons/tsl/display/depthAwareBlend.js';
import { godrays } from 'three/addons/tsl/display/GodraysNode.js';

// A distant, elevated moon keeps the key direction fixed in world space and
// sends the canopy's shadow volume down into the playable field.
export const EMERALD_MOON_POSITION = new THREE.Vector3(42, 28, -190);
export const EMERALD_MOON_DIRECTION = EMERALD_MOON_POSITION.clone().normalize();

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = Math.imul(1664525, state) + 1013904223;
    return (state >>> 0) / 0x100000000;
  };
}

function makeMoonTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d')!;
  const center = size / 2;
  const radius = size * 0.42;
  const random = seededRandom(0xf011a00d);

  const disc = context.createRadialGradient(center - 48, center - 56, 12, center, center, radius);
  disc.addColorStop(0, 'rgba(255,255,244,1)');
  disc.addColorStop(0.68, 'rgba(235,240,225,1)');
  disc.addColorStop(0.94, 'rgba(198,214,205,1)');
  disc.addColorStop(1, 'rgba(178,198,194,0)');
  context.fillStyle = disc;
  context.beginPath();
  context.arc(center, center, radius, 0, Math.PI * 2);
  context.fill();

  context.save();
  context.beginPath();
  context.arc(center, center, radius * 0.94, 0, Math.PI * 2);
  context.clip();
  for (let index = 0; index < 34; index++) {
    const angle = random() * Math.PI * 2;
    const distance = Math.sqrt(random()) * radius * 0.76;
    const craterRadius = 4 + random() * 18;
    const x = center + Math.cos(angle) * distance;
    const y = center + Math.sin(angle) * distance;
    const crater = context.createRadialGradient(x - craterRadius * 0.25, y - craterRadius * 0.25, 0, x, y, craterRadius);
    crater.addColorStop(0, 'rgba(92,119,119,0.16)');
    crater.addColorStop(0.72, 'rgba(128,150,146,0.09)');
    crater.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = crater;
    context.fillRect(x - craterRadius, y - craterRadius, craterRadius * 2, craterRadius * 2);
  }
  context.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function makeHaloTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d')!;
  const halo = context.createRadialGradient(size / 2, size / 2, size * 0.08, size / 2, size / 2, size / 2);
  halo.addColorStop(0, 'rgba(225,244,238,0.72)');
  halo.addColorStop(0.28, 'rgba(183,217,213,0.26)');
  halo.addColorStop(1, 'rgba(113,164,167,0)');
  context.fillStyle = halo;
  context.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function Moon() {
  const moonTexture = useMemo(makeMoonTexture, []);
  const haloTexture = useMemo(makeHaloTexture, []);

  useEffect(() => () => {
    moonTexture.dispose();
    haloTexture.dispose();
  }, [haloTexture, moonTexture]);

  return (
    <>
      <sprite position={EMERALD_MOON_POSITION} scale={[48, 48, 1]} renderOrder={1}>
        <spriteMaterial
          map={haloTexture}
          color="#bcded9"
          transparent
          opacity={0.72}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
          fog={false}
        />
      </sprite>
      <sprite position={EMERALD_MOON_POSITION} scale={[23, 23, 1]} renderOrder={2}>
        <spriteMaterial
          map={moonTexture}
          transparent
          alphaTest={0.02}
          depthWrite={false}
          toneMapped={false}
          fog={false}
        />
      </sprite>
    </>
  );
}

/**
 * Three.js's shadow-volume god rays: the directional light and its shadow map
 * are authoritative, so the tree canopy creates real world-anchored shafts.
 */
export function MoonGodrays({ light }: { readonly light: THREE.DirectionalLight }) {
  const { camera, gl, scene } = useThree();
  const renderer = gl as unknown as THREE.WebGPURenderer;
  const pipeline = useMemo(() => {
    const scenePass = pass(scene, camera);
    const sceneColor = scenePass.getTextureNode('output');
    const sceneDepth = scenePass.getTextureNode('depth');
    const viewDistance = scenePass.getViewZNode().negate();
    const shaftUniforms = {
      moonUv: uniform(new THREE.Vector2(0.5, 0.2)),
      visibility: uniform(0),
      aspect: uniform(1),
    };
    const deltaUv = screenUV.sub(shaftUniforms.moonUv).mul(vec2(shaftUniforms.aspect, 1));
    const falloff = pow(clamp(float(1).sub(length(deltaUv).mul(1.25)), 0, 1), 2.4);
    const worldAtmosphere = smoothstep(float(3), float(18), viewDistance);
    const marchedShafts = Fn(() => {
      const beam = float(0).toVar();
      If(shaftUniforms.visibility.greaterThan(0).and(falloff.greaterThan(0)), () => {
        const jitter = fract(sin(dot(screenUV, vec2(12.9898, 78.233))).mul(43758.5453));
        const accumulation = float(0).toVar();
        let normalization = 0;
        const taps = 24;
        for (let index = 0; index < taps; index++) {
          const weight = Math.pow(0.972, index * (48 / taps));
          const amount = float((index + 0.5) / taps).add(jitter.mul(1 / taps));
          const sampleUv = mix(screenUV, shaftUniforms.moonUv, amount.mul(0.95));
          const depth = sceneDepth.sample(sampleUv).x;
          // Accept both WebGPU reversed depth and the WebGL-compatible depth
          // convention. Geometry interrupting the sky samples carves the shaft.
          const isSky = max(step(depth, 0.00004), step(0.99996, depth));
          accumulation.addAssign(isSky.mul(weight));
          normalization += weight;
        }
        const radialRays = accumulation.mul(1 / normalization);
        beam.assign(
          radialRays.mul(radialRays)
            .mul(falloff)
            .mul(shaftUniforms.visibility)
            .mul(worldAtmosphere)
            .mul(0.3),
        );
      });
      return beam;
    })();
    const moonShafts = rtt(marchedShafts);
    const softenedMoonShafts = bilateralBlur(moonShafts, undefined, 2.2, 0.08);
    const rays = godrays(sceneDepth, camera, light);
    // Keep enough samples and participating-medium density for the canopy's
    // shadow volume to read as broken moonlight, while capping accumulation so
    // a wide camera cannot turn the entire sky into a flat luminous wash.
    rays.raymarchSteps.value = 60;
    rays.density.value = 0.12;
    rays.maxDensity.value = 0.1;
    rays.distanceAttenuation.value = 1.7;
    rays.resolutionScale = 0.5;
    const softenedRays = bilateralBlur(rays.getTextureNode(), undefined, 3.2, 0.1);
    const volumeOutput = depthAwareBlend(
      sceneColor,
      softenedRays.getTextureNode(),
      sceneDepth,
      camera,
      {
        blendColor: uniform(color('#b8d8d2')),
        edgeRadius: uniform(int(2)),
        edgeStrength: uniform(float(2)),
      },
    );
    const output = volumeOutput.add(
      color('#c5e2dc').mul(softenedMoonShafts.getTextureNode().r),
    );
    const renderPipeline = new THREE.RenderPipeline(renderer, output);
    return {
      renderPipeline,
      scenePass,
      rays,
      softenedRays,
      moonShafts,
      softenedMoonShafts,
      shaftUniforms,
    };
  }, [camera, light, renderer, scene]);

  useEffect(() => () => {
    pipeline.renderPipeline.dispose();
    pipeline.scenePass.dispose();
    pipeline.rays.dispose();
    pipeline.softenedRays.dispose();
    pipeline.moonShafts.dispose();
    pipeline.softenedMoonShafts.dispose();
  }, [pipeline]);

  useFrame(() => {
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    const projectedMoon = camera.position.clone()
      .addScaledVector(EMERALD_MOON_DIRECTION, 20000)
      .project(camera);
    pipeline.shaftUniforms.moonUv.value.set(
      projectedMoon.x * 0.5 + 0.5,
      0.5 - projectedMoon.y * 0.5,
    );
    pipeline.shaftUniforms.aspect.value = camera instanceof THREE.PerspectiveCamera
      ? camera.aspect
      : 1;
    pipeline.shaftUniforms.visibility.value = THREE.MathUtils.smoothstep(
      forward.dot(EMERALD_MOON_DIRECTION),
      -0.08,
      0.24,
    );
    pipeline.renderPipeline.render();
  }, 1);
  return null;
}
