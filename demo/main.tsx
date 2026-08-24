// SPDX-License-Identifier: MIT

import {
  StrictMode,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import manifestJson from '../assets/demo/manifest.json';
import tuftUrl from '../assets/demo/tufts.bin?url';
import {
  createInteractionField,
  decodeTufts,
  FIELD_GRASS_PRESET,
  groupFromManifest,
  STORYBOOK_GRASS_PRESET,
  type GrassManifest,
  type InteractionField,
  type GrassPreset,
} from '../src/index';
import { GrassLayer } from '../src/react';
import { IslandTerrainView } from './examples/island/IslandTerrainView';
import { createIslandGrassBuffers } from './examples/island/scatter';
import {
  createIslandHeightfield,
  isIslandWalkable,
  type IslandHeightfield,
} from './examples/island/terrain';
import './styles.css';

const manifest = manifestJson as GrassManifest;
const response = await fetch(tuftUrl);
if (!response.ok) throw new Error(`Grass demo scatter failed to load: ${response.status}`);
const bytes = await response.arrayBuffer();
const buffers = decodeTufts(bytes, manifest, groupFromManifest(manifest, 'meadow'));

interface DemoQaReceipt {
  requestedBackend: 'webgpu' | 'webgl2';
  actualBackend: 'webgpu' | 'webgl2';
  scene: SceneName;
  player: { x: number; y: number; z: number };
  camera: { x: number; y: number; z: number };
  draws: number;
  triangles: number;
  geometries: number;
  textures: number;
  frameP50Ms: number;
  frameP95Ms: number;
}

declare global {
  interface Window {
    __FIELD_GRASS_QA__?: DemoQaReceipt;
    render_game_to_text?: () => string;
  }
}

let rendererPromise: Promise<THREE.WebGPURenderer> | null = null;
function createRenderer(props: ConstructorParameters<typeof THREE.WebGPURenderer>[0]) {
  rendererPromise ??= (async () => {
    const forceWebGL = new URLSearchParams(window.location.search).get('backend') === 'webgl2';
    const renderer = new THREE.WebGPURenderer({ ...props, antialias: true, forceWebGL });
    await renderer.init();
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.03;
    // Constructor names are minified in the production demo, so they cannot
    // prove which backend Three selected. These flags are the renderer's stable
    // runtime contract and remain intact in bundled code.
    const backend = renderer.backend as typeof renderer.backend & {
      readonly isWebGPUBackend?: boolean;
      readonly isWebGLBackend?: boolean;
    };
    const actualBackend = backend.isWebGPUBackend === true ? 'webgpu' : 'webgl2';
    if (backend.isWebGPUBackend !== true && backend.isWebGLBackend !== true) {
      throw new Error('Three.js renderer initialized an unknown backend');
    }
    window.__FIELD_GRASS_QA__ = {
      requestedBackend: forceWebGL ? 'webgl2' : 'webgpu',
      actualBackend,
      scene: 'field',
      player: { x: 0, y: 0.72, z: 0 },
      camera: { x: -24, y: 20, z: 30 },
      draws: 0,
      triangles: 0,
      geometries: 0,
      textures: 0,
      frameP50Ms: 0,
      frameP95Ms: 0,
    };
    window.render_game_to_text = () => JSON.stringify({
      coordinates: 'x east, y up, z south; origin at scene center',
      ...window.__FIELD_GRASS_QA__,
    });
    return renderer;
  })();
  return rendererPromise;
}

interface MoveIntent {
  x: number;
  z: number;
}

type LookName = 'field' | 'storybook';
type SceneName = 'field' | 'island';

interface DemoLook {
  readonly label: string;
  readonly preset: GrassPreset;
  readonly sky: string;
  readonly ground: string;
  readonly key: string;
}

const LOOKS: Record<LookName, DemoLook> = {
  field: {
    label: 'Field',
    preset: FIELD_GRASS_PRESET,
    sky: '#edc38f',
    ground: '#81915b',
    key: '#ffd59a',
  },
  storybook: {
    label: 'Storygrass',
    preset: STORYBOOK_GRASS_PRESET,
    sky: '#cfd9c7',
    ground: '#7f9064',
    key: '#f1d79a',
  },
};

interface CameraActions {
  zoom(factor: number): void;
  reset(): void;
}

function OrbitCamera({
  actions,
  scene,
}: {
  readonly actions: MutableRefObject<CameraActions | null>;
  readonly scene: SceneName;
}) {
  const { camera, gl, size } = useThree();
  const controls = useMemo(() => new OrbitControls(camera, gl.domElement), [camera, gl]);
  const sizeRef = useRef(size);
  sizeRef.current = size;
  useEffect(() => {
    controls.target.set(0, 0, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.enablePan = false;
    controls.enableRotate = true;
    controls.enableZoom = true;
    controls.minDistance = 10;
    controls.maxDistance = scene === 'island' ? 96 : 74;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.zoomToCursor = true;
    const reset = () => {
      const currentSize = sizeRef.current;
      if (scene === 'island') {
        if (currentSize.width / currentSize.height < 0.78) camera.position.set(-43, 32, 48);
        else camera.position.set(-31, 24, 34);
        controls.target.set(0, 1.1, 0);
      } else {
        camera.position.set(-24, 20, 30);
        controls.target.set(0, 0, 0);
      }
      controls.update();
    };
    actions.current = {
      zoom(factor): void {
        const offset = camera.position.clone().sub(controls.target);
        const distance = THREE.MathUtils.clamp(
          offset.length() * factor,
          controls.minDistance,
          controls.maxDistance,
        );
        camera.position.copy(controls.target).add(offset.normalize().multiplyScalar(distance));
        controls.update();
      },
      reset,
    };
    reset();
    return () => {
      actions.current = null;
      controls.dispose();
    };
  }, [actions, camera, controls, scene]);
  useFrame(() => controls.update(), -1);
  return null;
}

function CapsuleController({
  field,
  intent,
  terrain,
}: {
  readonly field: InteractionField;
  readonly intent: MutableRefObject<MoveIntent>;
  readonly terrain?: IslandHeightfield;
}) {
  const marker = useRef<THREE.Mesh>(null);
  const position = useRef(new THREE.Vector3(0, (terrain?.heightAt(0, 0) ?? 0) + 0.72, 0));
  const heading = useRef(0);
  const forward = useMemo(() => new THREE.Vector3(), []);
  const right = useMemo(() => new THREE.Vector3(), []);
  const movement = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }, dt) => {
    camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 0.001) forward.set(0, 0, -1);
    forward.normalize();
    right.crossVectors(forward, camera.up).normalize();
    movement
      .copy(right)
      .multiplyScalar(intent.current.x)
      .addScaledVector(forward, intent.current.z);
    if (movement.lengthSq() > 0.001) {
      movement.normalize();
      const step = Math.min(dt, 0.05) * 7.2;
      const nextX = THREE.MathUtils.clamp(position.current.x + movement.x * step, -29, 29);
      const nextZ = THREE.MathUtils.clamp(position.current.z + movement.z * step, -29, 29);
      if (!terrain || isIslandWalkable(terrain, nextX, nextZ)) {
        position.current.x = nextX;
        position.current.z = nextZ;
        heading.current = Math.atan2(movement.z, movement.x);
      }
    }
    position.current.y = (terrain?.heightAt(position.current.x, position.current.z) ?? 0) + 0.72;
    marker.current?.position.copy(position.current);
    if (window.__FIELD_GRASS_QA__) {
      window.__FIELD_GRASS_QA__.player = {
        x: position.current.x,
        y: position.current.y,
        z: position.current.z,
      };
    }
    field.update(Math.min(dt, 0.05), [{
      slot: 0,
      x: position.current.x,
      z: position.current.z,
      heading: heading.current,
    }]);
  });
  return (
    <mesh ref={marker} castShadow>
      <capsuleGeometry args={[0.42, 1.05, 8, 18]} />
      <meshStandardMaterial color="#f4e1bd" roughness={0.78} />
    </mesh>
  );
}

function RendererReceipt() {
  const samples = useRef<number[]>([]);
  useFrame(({ camera, gl, scene }, dt) => {
    if (!window.__FIELD_GRASS_QA__) return;
    const milliseconds = Math.min(dt, 0.1) * 1000;
    samples.current.push(milliseconds);
    if (samples.current.length > 240) samples.current.shift();
    if (samples.current.length < 5) return;
    const sorted = [...samples.current].sort((a, b) => a - b);
    const percentile = (fraction: number) => sorted[Math.min(
      sorted.length - 1,
      Math.floor(sorted.length * fraction),
    )] ?? 0;
    let draws = 0;
    let triangles = 0;
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || !object.visible) return;
      draws++;
      const positionCount = object.geometry.getAttribute('position')?.count ?? 0;
      const primitiveCount = (object.geometry.index?.count ?? positionCount) / 3;
      triangles += primitiveCount * (object instanceof THREE.InstancedMesh ? object.count : 1);
    });
    window.__FIELD_GRASS_QA__.draws = draws;
    window.__FIELD_GRASS_QA__.camera = {
      x: camera.position.x,
      y: camera.position.y,
      z: camera.position.z,
    };
    window.__FIELD_GRASS_QA__.triangles = Math.round(triangles);
    window.__FIELD_GRASS_QA__.geometries = gl.info.memory.geometries;
    window.__FIELD_GRASS_QA__.textures = gl.info.memory.textures;
    window.__FIELD_GRASS_QA__.frameP50Ms = percentile(0.5);
    window.__FIELD_GRASS_QA__.frameP95Ms = percentile(0.95);
  });
  return null;
}

function BackendBadge() {
  const [backend, setBackend] = useState('Starting renderer');
  useEffect(() => {
    let frame = 0;
    const update = () => {
      const receipt = window.__FIELD_GRASS_QA__;
      if (receipt) {
        setBackend(receipt.actualBackend === 'webgpu' ? 'WebGPU' : 'WebGL2');
        return;
      }
      frame = window.requestAnimationFrame(update);
    };
    update();
    return () => window.cancelAnimationFrame(frame);
  }, []);
  return <p className="backend-badge" aria-live="polite">{backend}</p>;
}

function PerformanceBadge() {
  const [fps, setFps] = useState<number | null>(null);
  useEffect(() => {
    const update = () => {
      const frameTime = window.__FIELD_GRASS_QA__?.frameP50Ms ?? 0;
      setFps(frameTime > 0 ? Math.round(1000 / frameTime) : null);
    };
    update();
    const interval = window.setInterval(update, 500);
    return () => window.clearInterval(interval);
  }, []);
  const label = fps === null ? 'Performance sampling' : `Performance ${fps} frames per second`;
  return <output className="fps-badge" aria-label={label}>{fps === null ? '— FPS' : `${fps} FPS`}</output>;
}

function Meadow({
  intent,
  cameraActions,
  look,
}: {
  readonly intent: MutableRefObject<MoveIntent>;
  readonly cameraActions: MutableRefObject<CameraActions | null>;
  readonly look: DemoLook;
}) {
  const interaction = useMemo(
    () => createInteractionField({
      minX: -32,
      maxX: 32,
      minZ: -32,
      maxZ: 32,
      maxBodies: 4,
      ghostsPerBody: 12,
      maxAge: 0.9,
      ghostBirthDuration: 0.12,
      strength: 0.48,
    }),
    [],
  );
  useEffect(() => () => interaction.dispose(), [interaction]);
  return (
    <>
      <color attach="background" args={[look.sky]} />
      <fog attach="fog" args={[look.sky, 42, 82]} />
      <hemisphereLight args={['#d7e3ed', '#7d6b4a', 1.25]} />
      <directionalLight position={[-22, 18, 24]} intensity={2.4} color={look.key} />
      <mesh rotation-x={-Math.PI / 2} position-y={-0.04}>
        <planeGeometry args={[66, 66, 1, 1]} />
        <meshStandardMaterial color={look.ground} roughness={1} />
      </mesh>
      <GrassLayer buffers={buffers} interaction={interaction} preset={look.preset} />
      <CapsuleController field={interaction} intent={intent} />
      <OrbitCamera actions={cameraActions} scene="field" />
    </>
  );
}

function IslandMeadow({
  intent,
  cameraActions,
  look,
}: {
  readonly intent: MutableRefObject<MoveIntent>;
  readonly cameraActions: MutableRefObject<CameraActions | null>;
  readonly look: DemoLook;
}) {
  const terrain = useMemo(() => createIslandHeightfield(), []);
  const islandBuffers = useMemo(() => createIslandGrassBuffers(terrain), [terrain]);
  const interaction = useMemo(
    () => createInteractionField({
      minX: -23,
      maxX: 23,
      minZ: -23,
      maxZ: 23,
      maxBodies: 4,
      ghostsPerBody: 12,
      maxAge: 0.9,
      ghostBirthDuration: 0.12,
      strength: 0.48,
    }),
    [],
  );
  useEffect(() => () => interaction.dispose(), [interaction]);
  return (
    <>
      <color attach="background" args={['#b9d2d2']} />
      <fog attach="fog" args={['#b9d2d2', 58, 132]} />
      <hemisphereLight args={['#e7f1e8', '#53604d', 1.45]} />
      <directionalLight position={[-18, 24, 16]} intensity={2.55} color="#f4d7a0" />
      <IslandTerrainView field={terrain} />
      <GrassLayer buffers={islandBuffers} interaction={interaction} preset={look.preset} />
      <CapsuleController field={interaction} intent={intent} terrain={terrain} />
      <OrbitCamera actions={cameraActions} scene="island" />
    </>
  );
}

function DirectionPad({ intent }: { readonly intent: MutableRefObject<MoveIntent> }) {
  const held = useRef(new Set<string>());
  const publish = () => {
    intent.current.x = (held.current.has('right') ? 1 : 0) - (held.current.has('left') ? 1 : 0);
    intent.current.z = (held.current.has('up') ? 1 : 0) - (held.current.has('down') ? 1 : 0);
  };
  const clear = () => {
    held.current.clear();
    publish();
  };
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') clear();
    };
    window.addEventListener('blur', clear);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      clear();
      window.removeEventListener('blur', clear);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);
  const release = (direction: string) => {
    held.current.delete(direction);
    publish();
  };
  const bind = (direction: string) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => {
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Synthetic accessibility probes may not register a native pointer.
      }
      held.current.add(direction);
      publish();
    },
    onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      release(direction);
    },
    onPointerCancel: () => release(direction),
    onLostPointerCapture: () => release(direction),
  });
  return (
    <div className="direction-pad" aria-label="Capsule movement controls">
      <button className="pad-up" aria-label="Move forward" {...bind('up')}>↑</button>
      <button className="pad-left" aria-label="Move left" {...bind('left')}>←</button>
      <button className="pad-right" aria-label="Move right" {...bind('right')}>→</button>
      <button className="pad-down" aria-label="Move backward" {...bind('down')}>↓</button>
    </div>
  );
}

function Demo() {
  const intent = useRef<MoveIntent>({ x: 0, z: 0 });
  const cameraActions = useRef<CameraActions | null>(null);
  const viewport = useRef<HTMLElement>(null);
  const [lookName, setLookName] = useState<LookName>('field');
  const [sceneName, setSceneName] = useState<SceneName>('field');
  const [reducedMotion, setReducedMotion] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenSupported, setFullscreenSupported] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  const look = useMemo<DemoLook>(() => {
    const base = LOOKS[lookName];
    if (!reducedMotion) return base;
    return {
      ...base,
      preset: {
        ...base.preset,
        style: {
          ...base.preset.style,
          windSpeed: 0.45,
          flutterAmplitude: 0,
        },
      },
    };
  }, [lookName, reducedMotion]);
  useEffect(() => {
    if (window.__FIELD_GRASS_QA__) window.__FIELD_GRASS_QA__.scene = sceneName;
  }, [sceneName]);
  useEffect(() => {
    const update = () => setIsFullscreen(document.fullscreenElement === viewport.current);
    document.addEventListener('fullscreenchange', update);
    setFullscreenSupported(typeof viewport.current?.requestFullscreen === 'function');
    update();
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);
  useEffect(() => {
    const held = new Set<string>();
    const publish = () => {
      intent.current.x = (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0)
        - (held.has('KeyA') || held.has('ArrowLeft') ? 1 : 0);
      intent.current.z = (held.has('KeyW') || held.has('ArrowUp') ? 1 : 0)
        - (held.has('KeyS') || held.has('ArrowDown') ? 1 : 0);
    };
    const down = (event: KeyboardEvent) => {
      if (!/^(Key[WASD]|Arrow(Up|Down|Left|Right))$/.test(event.code)) return;
      if (event.target instanceof HTMLElement && event.target.closest('button, a, input, textarea, select')) return;
      event.preventDefault();
      held.add(event.code);
      publish();
    };
    const up = (event: KeyboardEvent) => {
      held.delete(event.code);
      publish();
    };
    const clear = () => {
      held.clear();
      publish();
    };
    clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
    };
  }, []);
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement === viewport.current) {
        await document.exitFullscreen();
        return;
      }
      await viewport.current?.requestFullscreen();
    } catch {
      setIsFullscreen(false);
    }
  };
  return (
    <main>
      <nav className="site-nav" aria-label="Primary navigation">
        <a className="brand" href="#top" aria-label="Three.js Field Grass home">
          <img src="./field-grass-mark.svg" alt="" />
          <span>Three.js Field Grass</span>
        </a>
        <div>
          <a href="#demo">Demo</a>
          <a href="#use">Use</a>
          <a href="#api">API</a>
          <a href="#origin">Origin</a>
          <a href="https://github.com/matthew-kissinger/threejs-field-grass">GitHub</a>
        </div>
      </nav>
      <header className="intro" id="top">
        <div className="hero-meta">
          <p className="eyebrow">MIT · Three.js · TSL</p>
          <span>Three.js 0.185</span>
        </div>
        <h1>Grass that moves as a field.</h1>
        <p className="lede">
          Deterministic, wind-driven grass for Three.js, with responsive body wakes
          and one material path across WebGPU and WebGL2.
        </p>
        <div className="hero-actions">
          <a className="primary-action" href="#demo">Try the demo</a>
          <a href="https://github.com/matthew-kissinger/threejs-field-grass">View on GitHub</a>
        </div>
        <div className="facts" aria-label="Demo facts">
          <span>18,000 demo tufts</span>
          <span>1 draw per layer</span>
          <span>WebGPU + WebGL2</span>
        </div>
      </header>
      <section ref={viewport} className="viewport" id="demo" aria-label="Interactive grass demo">
        <Canvas
          gl={createRenderer as never}
          dpr={[1, 1.6]}
          camera={{ position: [-24, 20, 30], fov: 40, near: 0.1, far: 180 }}
          shadows={false}
          fallback={<p className="canvas-fallback">This browser cannot start the 3D renderer.</p>}
        >
          <RendererReceipt />
          {sceneName === 'field' ? (
            <Meadow intent={intent} cameraActions={cameraActions} look={look} />
          ) : (
            <IslandMeadow intent={intent} cameraActions={cameraActions} look={look} />
          )}
        </Canvas>
        <div className="demo-toolbar" aria-label="Demo controls">
          <div className="scene-switch" role="group" aria-label="Example scene">
            <button
              type="button"
              aria-pressed={sceneName === 'field'}
              onClick={() => setSceneName('field')}
            >Flat Field</button>
            <button
              type="button"
              aria-pressed={sceneName === 'island'}
              onClick={() => setSceneName('island')}
            >Island Terrain</button>
          </div>
          <div className="view-buttons" role="group" aria-label="View controls">
            <button type="button" aria-label="Zoom out" onClick={() => cameraActions.current?.zoom(1.2)}>−</button>
            <button type="button" aria-label="Zoom in" onClick={() => cameraActions.current?.zoom(0.82)}>+</button>
            <button type="button" aria-label="Reset view" onClick={() => cameraActions.current?.reset()}>Reset</button>
            <button
              type="button"
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              aria-pressed={isFullscreen}
              disabled={!fullscreenSupported}
              onClick={() => void toggleFullscreen()}
            >{isFullscreen ? 'Exit' : 'Full'}</button>
          </div>
          <div className="look-switch" role="group" aria-label="Grass look">
            {(Object.keys(LOOKS) as LookName[]).map((name) => (
              <button
                type="button"
                key={name}
                aria-pressed={lookName === name}
                onClick={() => setLookName(name)}
              >{LOOKS[name].label}</button>
            ))}
          </div>
        </div>
        <DirectionPad intent={intent} />
        <div className="demo-help">
          <p>
            <strong>{sceneName === 'island' ? 'Island' : 'Move + orbit'}</strong>{' '}
            <span className="help-long">WASD or arrows move while you drag. Wheel or pinch to zoom.</span>
            <span className="help-short">Pad moves. Drag orbits; pinch zooms.</span>
          </p>
        </div>
        <PerformanceBadge />
        <BackendBadge />
      </section>
      <section className="example-guide" aria-label="Included examples">
        <article>
          <p className="section-label">Flat field</p>
          <strong>Read the grass clearly.</strong>
          <span>A committed 18,000-tuft scatter isolates wind, contact, wake recovery, and preset changes.</span>
        </article>
        <article>
          <p className="section-label">Island terrain</p>
          <strong>Bring your own ground truth.</strong>
          <span>One deterministic heightfield builds the land, grounds the capsule, supplies normals, and places the grass.</span>
        </article>
        <article>
          <p className="section-label">Storygrass preset</p>
          <strong>A look, not a renderer fork.</strong>
          <span>Wider blades, a softer palette, and calmer wind remain ordinary preset data on the same TSL path.</span>
        </article>
      </section>
      <section className="docs" id="use" aria-label="Package documentation">
        <article className="install-card">
          <p className="section-label">Use from source</p>
          <h2>Bring the field, not the game.</h2>
          <pre><code>{`git clone https://github.com/matthew-kissinger/threejs-field-grass.git
cd threejs-field-grass && npm ci && npm run build`}</code></pre>
          <p>The npm package is intentionally unpublished. The repository includes runtime source, types, recipes, tests, and the demo.</p>
        </article>
        <div className="stat-grid" aria-label="Package facts">
          <article><strong>12 bytes</strong><span>per baked tuft</span></article>
          <article><strong>1 field</strong><span>for continuous deformation</span></article>
          <article><strong>0 images</strong><span>required for the look</span></article>
          <article><strong>2 entries</strong><span>core and /react</span></article>
        </div>
        <article className="code-card" id="api">
          <div>
            <p className="section-label">Framework-neutral core</p>
            <h2>Own loading and game state.</h2>
            <p>Decode committed scatter data, create one instanced layer, then feed stable body slots from your frame loop.</p>
          </div>
          <pre><code>{`const buffers = decodeTufts(bytes, manifest, group)
const interaction = createInteractionField(bounds)
const grass = createGrassLayer(buffers, { interaction })

scene.add(grass.mesh)
interaction.update(dt, bodies)`}</code></pre>
        </article>
        <article className="code-card react-card">
          <div>
            <p className="section-label">Optional /react adapter</p>
            <h2>Thin by design.</h2>
            <p>The adapter accepts decoded buffers. Suspense, URLs, quality policy, and input remain application-owned.</p>
          </div>
          <pre><code>{`import { GrassLayer } from 'threejs-field-grass/react'

<GrassLayer
  buffers={buffers}
  interaction={interaction}
/>`}</code></pre>
        </article>
        <article className="compat-card" id="origin">
          <div>
            <p className="section-label">Compatibility and performance</p>
            <h2>A narrow renderer contract.</h2>
          </div>
          <ul>
            <li>Three.js 0.185.x with WebGPURenderer</li>
            <li>WebGPU and WebGL2 from one TSL material graph</li>
            <li>Prefix-safe density tiers from one committed scatter</li>
            <li>Fixed interaction textures and no frame-loop allocation</li>
          </ul>
        </article>
        <article className="code-card terrain-card">
          <div>
            <p className="section-label">Terrain integration example</p>
            <h2>One heightfield, four jobs.</h2>
            <p>The island example keeps terrain in demo code. One deterministic CPU heightfield builds the mesh, grounds the capsule, supplies smooth slope normals, and places every tuft at the exact sampled height.</p>
          </div>
          <pre><code>{`const terrain = createIslandHeightfield(seed)
const groups = generateScatter(recipe, (x, z) => ({
  y: terrain.heightAt(x, z),
  accept: terrain.heightAt(x, z) > seaLevel
    && terrain.normalAt(x, z)[1] > minNormalY,
}))`}</code></pre>
        </article>
      </section>
      <footer>
        <div>
          <strong>Three.js Field Grass</strong>
          <span>MIT licensed by Matthew Kissinger.</span>
          <span>Independent community project; not affiliated with or endorsed by Three.js.</span>
        </div>
        <div className="footer-links">
          <a href="https://github.com/matthew-kissinger/threejs-field-grass">Source</a>
          <a href="https://github.com/matthew-kissinger/threejs-field-grass/blob/main/LICENSE">License</a>
          <a href="https://github.com/matthew-kissinger/threejs-field-grass/blob/main/SECURITY.md">Security</a>
          <a href="https://github.com/matthew-kissinger/threejs-field-grass/blob/main/CONTRIBUTING.md">Contributing</a>
          <a href="https://github.com/matthew-kissinger/threejs-field-grass/blob/main/CHANGELOG.md">Changelog</a>
        </div>
      </footer>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Demo />
  </StrictMode>,
);
