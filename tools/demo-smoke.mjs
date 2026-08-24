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

async function verify(browser, url, viewport, scene) {
  const page = await browser.newPage({ viewport });
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
  const canvas = await page.locator('canvas').evaluate((element) => ({
    width: element.width,
    height: element.height,
    clientWidth: element.clientWidth,
    clientHeight: element.clientHeight,
  }));
  if (canvas.width <= 0 || canvas.height <= 0 || canvas.clientWidth <= 0 || canvas.clientHeight <= 0) {
    throw new Error(`Blank canvas dimensions: ${JSON.stringify(canvas)}`);
  }
  const beforeMove = await page.evaluate(() => window.__FIELD_GRASS_QA__?.player);
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await page.keyboard.down('w');
  await page.waitForTimeout(300);
  await page.keyboard.up('w');
  await page.getByRole('button', { name: 'Orbit' }).click();
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
  if (url.includes('backend=webgl2') && receipt.actualBackend !== 'webgl2') {
    throw new Error(`Forced WebGL2 selected ${receipt.actualBackend}`);
  }
  if (!Number.isFinite(receipt.player.y)) throw new Error('Capsule ground is not finite');
  const textState = await page.evaluate(() => window.render_game_to_text?.());
  if (!textState || JSON.parse(textState).scene !== scene) throw new Error('Text state does not match scene');
  if (errors.length > 0) throw new Error(`Browser console errors:\n${errors.join('\n')}`);
  await page.close();
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true, args: [
    '--enable-unsafe-webgpu',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
  ] });
  await verify(browser, `http://127.0.0.1:${port}/`, { width: 1280, height: 900 }, 'field');
  await verify(browser, `http://127.0.0.1:${port}/`, { width: 390, height: 844 }, 'island');
  await verify(browser, `http://127.0.0.1:${port}/?backend=webgl2`, { width: 1280, height: 900 }, 'island');
  await verify(browser, `http://127.0.0.1:${port}/?backend=webgl2`, { width: 390, height: 844 }, 'field');
  console.log('demo browser smoke passed');
} finally {
  await browser?.close();
  server.kill();
}
