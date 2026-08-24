// SPDX-License-Identifier: MIT

import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(repo, 'output', 'playwright');
const vite = resolve(repo, 'node_modules', 'vite', 'bin', 'vite.js');
const port = 5195;
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
  throw new Error('Capture preview did not start');
}

let browser;
try {
  await mkdir(output, { recursive: true });
  await ready();
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: [
    '--enable-unsafe-webgpu',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
  ] });
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await desktop.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' });
  await desktop.locator('canvas').waitFor();
  await desktop.waitForTimeout(600);
  const desktopReceipt = await desktop.evaluate(() => window.__FIELD_GRASS_QA__);
  if (desktopReceipt?.actualBackend !== 'webgpu') {
    throw new Error(`Desktop WebGPU capture fell back: ${JSON.stringify(desktopReceipt)}`);
  }
  await desktop.screenshot({ path: resolve(output, 'field-page-desktop.png'), fullPage: true });
  await desktop.locator('.viewport').screenshot({ path: resolve(output, 'field-rest-t0.png') });
  await desktop.waitForTimeout(3200);
  await desktop.locator('.viewport').screenshot({ path: resolve(output, 'field-rest-t3.png') });
  await desktop.getByRole('button', { name: 'Zoom in' }).click();
  await desktop.getByRole('button', { name: 'Zoom in' }).click();
  await desktop.waitForTimeout(300);
  await desktop.locator('.viewport').screenshot({ path: resolve(output, 'field-stationary-close-t0.png') });
  await desktop.waitForTimeout(1800);
  await desktop.locator('.viewport').screenshot({ path: resolve(output, 'field-stationary-close-t2.png') });
  await desktop.keyboard.down('w');
  await desktop.waitForTimeout(1050);
  await desktop.keyboard.up('w');
  await desktop.locator('.viewport').screenshot({ path: resolve(output, 'field-wake-stop-t0.png') });
  await desktop.waitForTimeout(520);
  await desktop.locator('.viewport').screenshot({ path: resolve(output, 'field-wake-stop-t1.png') });
  await desktop.getByRole('button', { name: 'Storygrass' }).click();
  await desktop.getByRole('button', { name: 'Reset view' }).click();
  await desktop.waitForTimeout(800);
  await desktop.locator('.viewport').screenshot({ path: resolve(output, 'storygrass-preset.png') });
  await desktop.getByRole('button', { name: 'Island Terrain' }).click();
  await desktop.waitForTimeout(1000);
  await desktop.locator('.viewport').screenshot({ path: resolve(output, 'island-terrain-desktop-webgpu.png') });

  const desktopFallback = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await desktopFallback.goto(`http://127.0.0.1:${port}/?backend=webgl2`, { waitUntil: 'networkidle' });
  await desktopFallback.getByRole('button', { name: 'Island Terrain' }).click();
  await desktopFallback.waitForTimeout(1000);
  const fallbackReceipt = await desktopFallback.evaluate(() => window.__FIELD_GRASS_QA__);
  if (fallbackReceipt?.actualBackend !== 'webgl2') {
    throw new Error(`Forced desktop WebGL2 capture selected ${fallbackReceipt?.actualBackend}`);
  }
  await desktopFallback.locator('.viewport').screenshot({ path: resolve(output, 'island-terrain-desktop-webgl2.png') });
  await desktopFallback.close();

  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  await mobile.goto(`http://127.0.0.1:${port}/?backend=webgl2`, { waitUntil: 'networkidle' });
  await mobile.locator('canvas').waitFor();
  await mobile.waitForTimeout(600);
  await mobile.screenshot({ path: resolve(output, 'field-page-mobile-webgl2.png'), fullPage: true });
  const forward = mobile.getByRole('button', { name: 'Move forward' });
  await forward.dispatchEvent('pointerdown', { pointerId: 1, pointerType: 'touch', isPrimary: true });
  await mobile.waitForTimeout(650);
  await forward.dispatchEvent('pointerup', { pointerId: 1, pointerType: 'touch', isPrimary: true });
  await mobile.locator('.viewport').screenshot({ path: resolve(output, 'field-mobile-touch-wake.png') });
  await mobile.getByRole('button', { name: 'Island Terrain' }).click({ force: true });
  await mobile.waitForTimeout(900);
  await mobile.locator('.viewport').screenshot({ path: resolve(output, 'island-terrain-mobile-webgl2.png') });

  const mobileWebGpu = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  await mobileWebGpu.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' });
  await mobileWebGpu.getByRole('button', { name: 'Island Terrain' }).click({ force: true });
  await mobileWebGpu.waitForTimeout(900);
  const mobileReceipt = await mobileWebGpu.evaluate(() => window.__FIELD_GRASS_QA__);
  if (mobileReceipt?.actualBackend !== 'webgpu') {
    throw new Error(`Mobile WebGPU capture fell back: ${JSON.stringify(mobileReceipt)}`);
  }
  await mobileWebGpu.locator('.viewport').screenshot({ path: resolve(output, 'island-terrain-mobile-webgpu.png') });
  await mobileWebGpu.close();
  await mobile.close();
  await desktop.close();
  console.log(`captured field-grass QA to ${output}`);
} finally {
  await browser?.close();
  server.kill();
}
