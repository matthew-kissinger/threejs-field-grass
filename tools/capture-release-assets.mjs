// SPDX-License-Identifier: MIT

import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const docsImages = resolve(repo, 'docs', 'images');
const publicAssets = resolve(repo, 'public');
const vite = resolve(repo, 'node_modules', 'vite', 'bin', 'vite.js');
const port = 5198;
const server = spawn(
  process.execPath,
  [vite, 'preview', '--config', 'vite.demo.config.ts', '--host', '127.0.0.1', '--port', String(port)],
  { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] },
);

async function ready() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/`)).ok) return;
    } catch {
      // Preview is still starting.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw new Error('Release-asset preview did not start');
}

let browser;
try {
  await mkdir(docsImages, { recursive: true });
  await ready();
  browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: [
      '--enable-unsafe-webgpu',
      '--enable-webgpu-developer-features',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
    ],
  });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}/?backend=webgl2`, { waitUntil: 'networkidle' });
  await page.locator('canvas').waitFor({ state: 'visible' });
  await page.waitForTimeout(900);
  const receipt = await page.evaluate(() => window.__FIELD_GRASS_QA__);
  if (receipt?.actualBackend !== 'webgl2') {
    throw new Error(`Release capture did not use forced WebGL2: ${JSON.stringify(receipt)}`);
  }

  await page.locator('.viewport').screenshot({
    path: resolve(docsImages, 'flat-field.jpg'),
    type: 'jpeg',
    quality: 88,
  });
  await page.getByRole('button', { name: 'Island Terrain' }).click();
  await page.waitForTimeout(900);
  await page.locator('.viewport').screenshot({
    path: resolve(docsImages, 'island-terrain.jpg'),
    type: 'jpeg',
    quality: 88,
  });

  await page.getByRole('button', { name: 'Flat Field' }).click();
  await page.addStyleTag({ content: `
    main { width: 1200px !important; }
    .viewport { width: 1200px !important; height: 629px !important; min-height: 629px !important; }
  ` });
  await page.waitForTimeout(500);
  await page.locator('.viewport').screenshot({
    path: resolve(publicAssets, 'field-grass-social.jpg'),
    type: 'jpeg',
    quality: 90,
  });

  const emeraldPage = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
  });
  const emeraldErrors = [];
  emeraldPage.on('console', (message) => {
    if (message.type() === 'error') emeraldErrors.push(message.text());
  });
  emeraldPage.on('pageerror', (error) => emeraldErrors.push(error.message));
  await emeraldPage.goto(
    `http://127.0.0.1:${port}/?backend=webgpu&scene=samurai`,
    { waitUntil: 'networkidle' },
  );
  await emeraldPage.locator('canvas').waitFor({ state: 'visible' });
  await emeraldPage.waitForTimeout(4200);
  const emeraldReceipt = await emeraldPage.evaluate(() => window.__FIELD_GRASS_QA__);
  if (emeraldReceipt?.actualBackend !== 'webgpu') {
    throw new Error(`Emerald capture did not use WebGPU: ${JSON.stringify(emeraldReceipt)}`);
  }
  await emeraldPage.locator('.viewport').screenshot({
    path: resolve(docsImages, 'emerald-dawn.jpg'),
    type: 'jpeg',
    quality: 90,
  });
  if (emeraldErrors.length > 0) {
    throw new Error(`Emerald capture console errors:\n${emeraldErrors.join('\n')}`);
  }
  await emeraldPage.close();

  if (errors.length > 0) throw new Error(`Release capture console errors:\n${errors.join('\n')}`);
  console.log('captured README and social assets from the production demo');
} finally {
  await browser?.close();
  server.kill();
}
