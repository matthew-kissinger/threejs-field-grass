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
import './styles.css';

const manifest = manifestJson as GrassManifest;
const response = await fetch(tuftUrl);
if (!response.ok) throw new Error(`Grass demo scatter failed to load: ${response.status}`);
const bytes = await response.arrayBuffer();
const buffers = decodeTufts(bytes, manifest, groupFromManifest(manifest, 'meadow'));

let rendererPromise: Promise<THREE.WebGPURenderer> | null = null;
function createRenderer(props: ConstructorParameters<typeof THREE.WebGPURenderer>[0]) {
  rendererPromise ??= (async () => {
    const forceWebGL = new URLSearchParams(window.location.search).get('backend') === 'webgl2';
    const renderer = new THREE.WebGPURenderer({ ...props, antialias: true, forceWebGL });
    await renderer.init();
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.03;
    return renderer;
  })();
  return rendererPromise;
}

interface MoveIntent {
  x: number;
  z: number;
}

type ControlMode = 'drive' | 'orbit';
type LookName = 'field' | 'storybook';

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
  mode,
  actions,
}: {
  readonly mode: ControlMode;
  readonly actions: MutableRefObject<CameraActions | null>;
}) {
  const { camera, gl } = useThree();
  const controls = useMemo(() => new OrbitControls(camera, gl.domElement), [camera, gl]);
  useEffect(() => {
    controls.target.set(0, 0, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.enablePan = false;
    controls.minDistance = 10;
    controls.maxDistance = 74;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.zoomToCursor = true;
    const reset = () => {
      camera.position.set(-24, 20, 30);
      controls.target.set(0, 0, 0);
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
  }, [actions, camera, controls]);
  useEffect(() => {
    controls.enableRotate = mode === 'orbit';
    controls.enableZoom = true;
  }, [controls, mode]);
  useFrame(() => controls.update(), -1);
  return null;
}

function CapsuleController({
  field,
  intent,
}: {
  readonly field: InteractionField;
  readonly intent: MutableRefObject<MoveIntent>;
}) {
  const marker = useRef<THREE.Mesh>(null);
  const position = useRef(new THREE.Vector3(0, 0.72, 0));
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
      position.current.addScaledVector(movement, step);
      position.current.x = THREE.MathUtils.clamp(position.current.x, -29, 29);
      position.current.z = THREE.MathUtils.clamp(position.current.z, -29, 29);
      heading.current = Math.atan2(movement.z, movement.x);
    }
    marker.current?.position.copy(position.current);
    field.update(Math.min(dt, 0.05), [{
      slot: 0,
      x: position.current.x,
      z: position.current.z,
      heading: heading.current,
      priority: -100,
    }]);
  });
  return (
    <mesh ref={marker} castShadow>
      <capsuleGeometry args={[0.42, 1.05, 8, 18]} />
      <meshStandardMaterial color="#f4e1bd" roughness={0.78} />
    </mesh>
  );
}

function Meadow({
  intent,
  mode,
  cameraActions,
  look,
}: {
  readonly intent: MutableRefObject<MoveIntent>;
  readonly mode: ControlMode;
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
      <OrbitCamera mode={mode} actions={cameraActions} />
    </>
  );
}

function DirectionPad({ intent }: { readonly intent: MutableRefObject<MoveIntent> }) {
  const held = useRef(new Set<string>());
  const publish = () => {
    intent.current.x = (held.current.has('right') ? 1 : 0) - (held.current.has('left') ? 1 : 0);
    intent.current.z = (held.current.has('up') ? 1 : 0) - (held.current.has('down') ? 1 : 0);
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
      held.current.delete(direction);
      publish();
    },
    onPointerCancel: () => {
      held.current.delete(direction);
      publish();
    },
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
  const [mode, setMode] = useState<ControlMode>('drive');
  const [lookName, setLookName] = useState<LookName>('field');
  const [reducedMotion, setReducedMotion] = useState(false);
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
    const held = new Set<string>();
    const publish = () => {
      intent.current.x = (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0)
        - (held.has('KeyA') || held.has('ArrowLeft') ? 1 : 0);
      intent.current.z = (held.has('KeyW') || held.has('ArrowUp') ? 1 : 0)
        - (held.has('KeyS') || held.has('ArrowDown') ? 1 : 0);
    };
    const down = (event: KeyboardEvent) => {
      if (mode !== 'drive' || !/^(Key[WASD]|Arrow(Up|Down|Left|Right))$/.test(event.code)) return;
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
  }, [mode]);
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
      <section className="viewport" id="demo" aria-label="Interactive grass demo">
        <Canvas
          gl={createRenderer as never}
          dpr={[1, 1.6]}
          camera={{ position: [-24, 20, 30], fov: 40, near: 0.1, far: 120 }}
          shadows={false}
          fallback={<p className="canvas-fallback">This browser cannot start the 3D renderer.</p>}
        >
          <Meadow intent={intent} mode={mode} cameraActions={cameraActions} look={look} />
        </Canvas>
        <div className="demo-toolbar" aria-label="Demo controls">
          <div className="mode-switch" role="group" aria-label="Control mode">
            <button
              type="button"
              aria-pressed={mode === 'drive'}
              onClick={() => setMode('drive')}
            >Move</button>
            <button
              type="button"
              aria-pressed={mode === 'orbit'}
              onClick={() => setMode('orbit')}
            >Orbit</button>
          </div>
          <div className="view-buttons" role="group" aria-label="View controls">
            <button type="button" aria-label="Zoom out" onClick={() => cameraActions.current?.zoom(1.2)}>−</button>
            <button type="button" aria-label="Zoom in" onClick={() => cameraActions.current?.zoom(0.82)}>+</button>
            <button type="button" onClick={() => cameraActions.current?.reset()}>Reset view</button>
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
        {mode === 'drive' ? <DirectionPad intent={intent} /> : null}
        <div className="demo-help">
          {mode === 'drive' ? (
            <p><strong>Drive</strong> WASD, arrows, or direction pad. Wheel or pinch to zoom.</p>
          ) : (
            <p><strong>Orbit</strong> drag the field. Wheel, pinch, or use −/+ to zoom.</p>
          )}
        </div>
        <p className="backend-badge" aria-live="polite">
          {new URLSearchParams(window.location.search).get('backend') === 'webgl2'
            || !('gpu' in navigator) ? 'WebGL2' : 'WebGPU'}
        </p>
      </section>
      <section className="docs" id="use" aria-label="Package documentation">
        <article className="install-card">
          <p className="section-label">Use from source</p>
          <h2>Bring the field, not the game.</h2>
          <pre><code>{`git clone https://github.com/matthew-kissinger/threejs-field-grass.git
cd threejs-field-grass && npm install && npm run build`}</code></pre>
          <p>The npm package is intentionally unpublished. The repository includes runtime source, types, recipes, tests, and the demo.</p>
        </article>
        <div className="stat-grid" aria-label="Package facts">
          <article><strong>12 bytes</strong><span>per baked tuft</span></article>
          <article><strong>4 slots</strong><span>per interaction cell</span></article>
          <article><strong>0 textures</strong><span>required for the look</span></article>
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
