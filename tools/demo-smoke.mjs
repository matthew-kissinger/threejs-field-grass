// SPDX-License-Identifier: MIT

import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
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
    await page.waitForTimeout(900);
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
  if (mobile) {
    const forward = page.getByRole('button', { name: 'Move forward' });
    await forward.dispatchEvent('pointerdown', {
      pointerId: 11,
      pointerType: 'touch',
      isPrimary: true,
    });
    await page.waitForTimeout(300);
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
    await page.waitForTimeout(300);
    await page.keyboard.up('w');
  }
  await page.getByRole('button', { name: 'Orbit' }).click();
  const canvas = page.locator('canvas');
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('Canvas has no bounds for orbit test');
  await page.mouse.move(bounds.x + bounds.width * 0.52, bounds.y + bounds.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.62, bounds.y + bounds.height * 0.46, { steps: 6 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.getByRole('button', { name: 'Reset view' }).click();
  await page.getByRole('button', { name: 'Storygrass' }).click();
  await page.locator('.backend-badge').waitFor();
  await page.waitForTimeout(550);
  const receipt = await page.evaluate(() => window.__FIELD_GRASS_QA__);
  if (!receipt || receipt.scene !== scene || receipt.draws <= 0 || receipt.triangles <= 0) {
    throw new Error(`Invalid renderer receipt: ${JSON.stringify(receipt)}`);
  }
  if (!beforeMove || Math.hypot(
    receipt.player.x - beforeMove.x,
    receipt.player.z - beforeMove.z,
  ) < 0.05) throw new Error('Capsule did not move across the selected scene');
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
  browser = await chromium.launch({ headless: true, args: [
    '--enable-unsafe-webgpu',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
  ] });
  await verify(browser, defaultUrl, { width: 1280, height: 900 }, 'field');
  await verify(browser, defaultUrl, { width: 390, height: 844 }, 'island', true);
  await verify(browser, `http://127.0.0.1:${port}/?backend=webgl2`, { width: 1280, height: 900 }, 'island');
  await verify(browser, `http://127.0.0.1:${port}/?backend=webgl2`, { width: 390, height: 844 }, 'field', true);
  console.log('demo browser smoke passed');
} finally {
  await browser?.close();
  server.kill();
}
