// SPDX-License-Identifier: MIT

import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const evidence = resolve(repo, 'output', 'playwright', 'samurai-release');
const vite = resolve(repo, 'node_modules', 'vite', 'bin', 'vite.js');
const port = 5194;
const server = spawn(
  process.execPath,
  [vite, 'preview', '--config', 'vite.demo.config.ts', '--host', '127.0.0.1', '--port', String(port)],
  { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] },
);

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`);
      if (response.ok) return;
    } catch {
      // Preview is still starting.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw new Error('Demo preview did not become ready');
}

async function verifySceneButtonKeyboardHandoff(browser, url) {
  console.log(`checking Emerald scene-button keyboard handoff: ${url}`);
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.locator('canvas').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Emerald Dawn' }).click();
  await page.waitForFunction(
    () => window.__FIELD_GRASS_QA__?.scene === 'samurai',
    undefined,
    { timeout: 10000 },
  );
  const activeElement = await page.evaluate(() => ({
    tag: document.activeElement?.tagName ?? null,
    ariaLabel: document.activeElement?.getAttribute('aria-label') ?? null,
  }));
  if (activeElement.tag === 'BUTTON') {
    throw new Error(`Scene button retained keyboard focus: ${JSON.stringify(activeElement)}`);
  }
  const beforeMove = await page.evaluate(() => window.__FIELD_GRASS_QA__?.player);
  if (!beforeMove) throw new Error('Missing player receipt before scene-button movement');
  await page.keyboard.down('w');
  await page.waitForFunction(
    (before) => {
      const player = window.__FIELD_GRASS_QA__?.player;
      return !!player && Math.hypot(player.x - before.x, player.z - before.z) > 0.05;
    },
    beforeMove,
    { timeout: 3000 },
  );
  const duringMove = await page.evaluate(() => ({
    player: window.__FIELD_GRASS_QA__?.player,
    animation: window.__FIELD_GRASS_QA__?.samuraiAnimation,
  }));
  await page.keyboard.up('w');
  if (!duringMove.animation || duringMove.animation.active !== 'walk') {
    throw new Error(`Scene-button handoff did not enter walk: ${JSON.stringify(duringMove.animation)}`);
  }
  if (errors.length > 0) throw new Error(`Scene-button browser errors:\n${errors.join('\n')}`);
  await page.close();
  console.log('passed Emerald scene-button keyboard handoff');
}

async function verify(browser, url, viewport, scene, mobile = false) {
  console.log(`checking ${scene} at ${viewport.width}x${viewport.height}${mobile ? ' touch' : ''}: ${url}`);
  const page = await browser.newPage({ viewport, isMobile: mobile, hasTouch: mobile });
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.locator('canvas').waitFor({ state: 'visible' });
  if (scene === 'island') {
    await page.getByRole('button', { name: 'Island Terrain' }).click();
    await page.waitForFunction(
      () => window.__FIELD_GRASS_QA__?.scene === 'island',
      undefined,
      { timeout: 10000 },
    );
  } else if (scene === 'samurai') {
    await page.getByRole('button', { name: 'Emerald Dawn' }).click();
    await page.waitForFunction(
      () => window.__FIELD_GRASS_QA__?.scene === 'samurai',
      undefined,
      { timeout: 10000 },
    );
  }
  const canvasSize = await page.locator('canvas').evaluate((element) => ({
    width: element.width,
    height: element.height,
    clientWidth: element.clientWidth,
    clientHeight: element.clientHeight,
  }));
  if (canvasSize.width <= 0 || canvasSize.height <= 0 || canvasSize.clientWidth <= 0 || canvasSize.clientHeight <= 0) {
    throw new Error(`Blank canvas dimensions: ${JSON.stringify(canvasSize)}`);
  }
  const beforeMove = await page.evaluate(() => window.__FIELD_GRASS_QA__?.player);
  let animationDuringMove;
  if (mobile) {
    const forward = page.getByRole('button', { name: 'Move forward' });
    await forward.dispatchEvent('pointerdown', {
      pointerId: 11,
      pointerType: 'touch',
      isPrimary: true,
    });
    await page.waitForTimeout(scene === 'samurai' ? 650 : 300);
    if (scene === 'samurai') {
      // Software-headless mobile WebGPU can render only a handful of frames in
      // 650 ms. Assert the blend once animation time, rather than wall time,
      // has advanced far enough to cross the authored walk threshold.
      await page.waitForFunction(
        () => (window.__FIELD_GRASS_QA__?.samuraiAnimation?.walkWeight ?? 0) > 0.55,
        undefined,
        { timeout: 3000 },
      );
      animationDuringMove = await page.evaluate(() => window.__FIELD_GRASS_QA__?.samuraiAnimation);
    }
    await forward.dispatchEvent('pointercancel', {
      pointerId: 11,
      pointerType: 'touch',
      isPrimary: true,
    });
  } else {
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    });
    await page.keyboard.down('w');
  }
  const canvas = page.locator('canvas');
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('Canvas has no bounds for orbit test');
  await page.mouse.move(bounds.x + bounds.width * 0.52, bounds.y + bounds.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.62, bounds.y + bounds.height * 0.46, { steps: 6 });
  await page.mouse.up();
  if (!mobile) {
    await page.waitForTimeout(300);
    if (scene === 'samurai') {
      animationDuringMove = await page.evaluate(() => window.__FIELD_GRASS_QA__?.samuraiAnimation);
    }
    await page.keyboard.up('w');
  }
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.getByRole('button', { name: 'Reset view' }).click();
  if (scene === 'samurai') {
    await page.waitForTimeout(180);
    const beforeWheel = await page.evaluate(() => window.__FIELD_GRASS_QA__);
    if (!beforeWheel) throw new Error('Missing samurai camera receipt before wheel zoom');
    const pivot = {
      x: beforeWheel.player.x,
      // QA player Y is ground + 1; the third-person target is ground + 1.65.
      y: beforeWheel.player.y + 0.65,
      z: beforeWheel.player.z,
    };
    const ray = [
      beforeWheel.camera.x - pivot.x,
      beforeWheel.camera.y - pivot.y,
      beforeWheel.camera.z - pivot.z,
    ];
    const rayLength = Math.hypot(...ray);
    const unitRay = ray.map((value) => value / rayLength);
    await page.mouse.move(bounds.x + bounds.width * 0.78, bounds.y + bounds.height * 0.4);
    await page.mouse.wheel(0, -480);
    await page.waitForTimeout(180);
    const afterWheel = await page.evaluate(() => window.__FIELD_GRASS_QA__);
    if (!afterWheel) throw new Error('Missing samurai camera receipt after wheel zoom');
    const zoomedRay = [
      afterWheel.camera.x - pivot.x,
      afterWheel.camera.y - pivot.y,
      afterWheel.camera.z - pivot.z,
    ];
    const alongRay = zoomedRay.reduce(
      (sum, value, index) => sum + value * unitRay[index],
      0,
    );
    const lateralDrift = Math.hypot(...zoomedRay.map(
      (value, index) => value - unitRay[index] * alongRay,
    ));
    if (lateralDrift > 0.05) {
      throw new Error(`Third-person wheel zoom fought the follow target: ${lateralDrift.toFixed(3)}m drift`);
    }
    await page.getByRole('button', { name: 'Reset view' }).click();
  }
  if (!mobile && scene === 'field') {
    await page.getByRole('button', { name: 'Enter fullscreen' }).click();
    await page.waitForFunction(() => document.fullscreenElement?.classList.contains('viewport'));
    const fullscreenCanvas = page.locator('canvas');
    const fullscreenBounds = await fullscreenCanvas.boundingBox();
    if (!fullscreenBounds) throw new Error('Fullscreen canvas has no bounds for orbit test');
    const beforeFullscreenOrbit = await page.evaluate(() => window.__FIELD_GRASS_QA__?.camera);
    await page.mouse.move(
      fullscreenBounds.x + fullscreenBounds.width * 0.5,
      fullscreenBounds.y + fullscreenBounds.height * 0.55,
    );
    await page.mouse.down();
    await page.mouse.move(
      fullscreenBounds.x + fullscreenBounds.width * 0.62,
      fullscreenBounds.y + fullscreenBounds.height * 0.47,
      { steps: 6 },
    );
    await page.mouse.up();
    await page.waitForTimeout(180);
    const afterFullscreenOrbit = await page.evaluate(() => window.__FIELD_GRASS_QA__?.camera);
    if (!beforeFullscreenOrbit || !afterFullscreenOrbit || Math.hypot(
      afterFullscreenOrbit.x - beforeFullscreenOrbit.x,
      afterFullscreenOrbit.y - beforeFullscreenOrbit.y,
      afterFullscreenOrbit.z - beforeFullscreenOrbit.z,
    ) < 0.05) throw new Error('Orbit stopped responding after entering fullscreen');
    const radiusBeforeWheel = Math.hypot(
      afterFullscreenOrbit.x,
      afterFullscreenOrbit.y,
      afterFullscreenOrbit.z,
    );
    await page.mouse.wheel(0, -480);
    await page.waitForTimeout(180);
    const afterFullscreenWheel = await page.evaluate(() => window.__FIELD_GRASS_QA__?.camera);
    const radiusAfterWheel = afterFullscreenWheel ? Math.hypot(
      afterFullscreenWheel.x,
      afterFullscreenWheel.y,
      afterFullscreenWheel.z,
    ) : radiusBeforeWheel;
    if (Math.abs(radiusAfterWheel - radiusBeforeWheel) < 0.05) {
      throw new Error('Wheel zoom stopped responding after entering fullscreen');
    }
    await page.getByRole('button', { name: 'Exit fullscreen' }).click();
    await page.waitForFunction(() => document.fullscreenElement === null);
  }
  if (scene !== 'samurai') await page.getByRole('button', { name: 'Storygrass' }).click();
  await page.locator('.backend-badge').waitFor();
  await page.locator('.fps-badge').waitFor();
  await page.waitForTimeout(550);
  const fpsText = await page.locator('.fps-badge').textContent();
  if (!fpsText || !/^\d+ FPS$/.test(fpsText)) throw new Error(`Invalid FPS badge: ${fpsText}`);
  const receipt = await page.evaluate(() => window.__FIELD_GRASS_QA__);
  if (!receipt || receipt.scene !== scene || receipt.draws <= 0 || receipt.triangles <= 0) {
    throw new Error(`Invalid renderer receipt: ${JSON.stringify(receipt)}`);
  }
  if (!beforeMove || Math.hypot(
    receipt.player.x - beforeMove.x,
    receipt.player.z - beforeMove.z,
  ) < 0.05) throw new Error('Capsule did not move across the selected scene');
  if (scene === 'samurai') {
    if (!animationDuringMove || animationDuringMove.active !== 'walk' || animationDuringMove.walkWeight < 0.5) {
      throw new Error(`Samurai did not blend into its walk clip: ${JSON.stringify(animationDuringMove)}`);
    }
    if (!receipt.samuraiAnimation || receipt.samuraiAnimation.active !== 'idle' || receipt.samuraiAnimation.walkWeight > 0.25) {
      throw new Error(`Samurai did not recover its idle clip: ${JSON.stringify(receipt.samuraiAnimation)}`);
    }
    const beforeAttack = { ...receipt.player };
    if (mobile) await page.getByRole('button', { name: 'Spin attack' }).dispatchEvent('click');
    else {
      await page.evaluate(() => {
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      });
      await page.keyboard.press('Space');
    }
    await page.waitForTimeout(300);
    const duringAttack = await page.evaluate(() => ({
      animation: window.__FIELD_GRASS_QA__?.samuraiAnimation,
      player: window.__FIELD_GRASS_QA__?.player,
    }));
    if (
      !duringAttack.animation
      || duringAttack.animation.active !== 'attack'
      || !duringAttack.animation.attacking
      || duringAttack.animation.attackWeight < 0.5
    ) {
      throw new Error(`Samurai did not enter its one-shot attack: ${JSON.stringify(duringAttack.animation)}`);
    }
    if (!duringAttack.player || Math.hypot(
      duringAttack.player.x - beforeAttack.x,
      duringAttack.player.z - beforeAttack.z,
    ) > 0.03) {
      throw new Error('Controller moved the samurai through the world during its in-place attack');
    }
  }
  if (mobile) {
    const stoppedAt = { ...receipt.player };
    await page.waitForTimeout(180);
    const afterCancel = await page.evaluate(() => window.__FIELD_GRASS_QA__?.player);
    if (!afterCancel || Math.hypot(
      afterCancel.x - stoppedAt.x,
      afterCancel.z - stoppedAt.z,
    ) > 0.03) throw new Error('Touch movement remained active after pointercancel');
  }
  if (url.includes('backend=webgl2') && receipt.actualBackend !== 'webgl2') {
    throw new Error(`Forced WebGL2 selected ${receipt.actualBackend}`);
  }
  if (!Number.isFinite(receipt.player.y)) throw new Error('Capsule ground is not finite');
  const textState = await page.evaluate(() => window.render_game_to_text?.());
  if (!textState || JSON.parse(textState).scene !== scene) throw new Error('Text state does not match scene');
  if (errors.length > 0) throw new Error(`Browser console errors:\n${errors.join('\n')}`);
  if (scene === 'samurai') {
    await mkdir(evidence, { recursive: true });
    await page.locator('.viewport').screenshot({
      path: resolve(evidence, `samurai-${mobile ? 'mobile' : 'desktop'}-${receipt.actualBackend}.png`),
    });
  }
  await page.close();
  console.log(`passed ${scene} at ${viewport.width}x${viewport.height}`);
}

let browser;
try {
  await waitForServer();
  const browserBackend = process.env.FIELD_GRASS_BROWSER_BACKEND ?? 'auto';
  if (!['auto', 'webgl2'].includes(browserBackend)) {
    throw new Error(`Unsupported FIELD_GRASS_BROWSER_BACKEND: ${browserBackend}`);
  }
  const defaultUrl = browserBackend === 'webgl2'
    ? `http://127.0.0.1:${port}/?backend=webgl2`
    : `http://127.0.0.1:${port}/`;
  const samuraiUrl = browserBackend === 'webgl2'
    ? `http://127.0.0.1:${port}/?backend=webgl2&scene=samurai&rays=off`
    // Gameplay/controller coverage runs without the expensive atmosphere graph
    // in software-headless Chrome. Native hardware WebGPU ray quality and
    // motion are covered separately by tools/webgpu-smoke.mjs.
    : `http://127.0.0.1:${port}/?scene=samurai&rays=off`;
  const onlyScene = process.env.FIELD_GRASS_SMOKE_SCENE;
  if (onlyScene && !['field', 'island', 'samurai'].includes(onlyScene)) {
    throw new Error(`Unsupported FIELD_GRASS_SMOKE_SCENE: ${onlyScene}`);
  }
  browser = await chromium.launch({ headless: true, args: [
    '--enable-unsafe-webgpu',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
  ] });
  if (!onlyScene || onlyScene === 'field') {
    await verify(browser, defaultUrl, { width: 1280, height: 900 }, 'field');
  }
  if (!onlyScene || onlyScene === 'island') {
    await verify(browser, defaultUrl, { width: 390, height: 844 }, 'island', true);
  }
  if (!onlyScene || onlyScene === 'samurai') {
    await verifySceneButtonKeyboardHandoff(browser, `${defaultUrl}${defaultUrl.includes('?') ? '&' : '?'}rays=off`);
    await verify(browser, samuraiUrl, { width: 1280, height: 900 }, 'samurai');
    await verify(browser, samuraiUrl, { width: 390, height: 844 }, 'samurai', true);
  }
  if (!onlyScene || onlyScene === 'island') {
    await verify(browser, `http://127.0.0.1:${port}/?backend=webgl2`, { width: 1280, height: 900 }, 'island');
  }
  if (!onlyScene || onlyScene === 'field') {
    await verify(browser, `http://127.0.0.1:${port}/?backend=webgl2`, { width: 390, height: 844 }, 'field', true);
  }
  console.log('demo browser smoke passed');
} finally {
  await browser?.close();
  server.kill();
}
