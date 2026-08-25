// SPDX-License-Identifier: MIT

import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const vite = resolve(repo, 'node_modules', 'vite', 'bin', 'vite.js');
const output = resolve(repo, 'output', 'playwright', 'webgpu');
const headed = process.argv.includes('--headed');
const sceneArgument = process.argv.find((argument) => argument.startsWith('--scene='));
const scene = sceneArgument?.slice('--scene='.length) ?? 'field';
if (!['field', 'island', 'samurai'].includes(scene)) {
  throw new Error(`Unsupported WebGPU smoke scene: ${scene}`);
}

async function reservePort() {
  const probe = createServer();
  await new Promise((resolveListen, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolveListen);
  });
  const address = probe.address();
  if (!address || typeof address === 'string') throw new Error('Could not reserve a WebGPU preview port');
  await new Promise((resolveClose) => probe.close(resolveClose));
  return address.port;
}

const port = await reservePort();
const server = spawn(
  process.execPath,
  [vite, 'preview', '--config', 'vite.demo.config.ts', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
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
  throw new Error('WebGPU preview did not start');
}

let browser;
try {
  await mkdir(output, { recursive: true });
  await ready();
  browser = await chromium.launch({
    channel: 'chrome',
    headless: !headed,
    args: [
      '--enable-unsafe-webgpu',
      '--enable-webgpu-developer-features',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
    ],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(
    `http://127.0.0.1:${port}/?backend=webgpu&scene=${scene}`,
    { waitUntil: 'networkidle' },
  );
  await page.locator('canvas').waitFor({ state: 'visible' });
  // Let WebGPU pipelines compile and the rolling frame-time window discard
  // first-frame shader warm-up before recording performance evidence.
  await page.waitForTimeout(scene === 'samurai' ? 4200 : 1800);
  const evidence = await page.evaluate(async () => {
    const adapter = navigator.gpu ? await navigator.gpu.requestAdapter() : null;
    const info = adapter?.info;
    return {
      navigatorGpu: Boolean(navigator.gpu),
      adapter: info ? {
        vendor: info.vendor,
        architecture: info.architecture,
        device: info.device,
        description: info.description,
      } : null,
      receipt: window.__FIELD_GRASS_QA__,
    };
  });
  if (!evidence.navigatorGpu || !evidence.adapter) {
    throw new Error(`Chrome did not expose a WebGPU adapter: ${JSON.stringify(evidence)}`);
  }
  if (evidence.receipt?.requestedBackend !== 'webgpu' || evidence.receipt.actualBackend !== 'webgpu') {
    throw new Error(`WebGPU renderer fell back; strict receipt failed: ${JSON.stringify(evidence)}`);
  }
  if (errors.length > 0) throw new Error(`WebGPU console errors:\n${errors.join('\n')}`);
  const viewport = page.locator('.viewport');
  await viewport.screenshot({
    path: resolve(output, `${scene}-native-chrome-${headed ? 'headed' : 'headless'}.png`),
  });
  let cameraMotion = null;
  if (scene === 'samurai') {
    const box = await page.locator('canvas').boundingBox();
    if (!box) throw new Error('Could not measure the samurai canvas');
    const sampleCamera = () => page.evaluate(() => ({
      camera: window.__FIELD_GRASS_QA__?.camera,
      target: window.__FIELD_GRASS_QA__?.cameraTarget,
    }));
    const initial = await sampleCamera();
    const startX = box.x + box.width * 0.52;
    const startY = box.y + box.height * 0.48;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 230, startY - 24, { steps: 24 });
    await page.mouse.up();
    await page.waitForTimeout(1200);
    const orbited = await sampleCamera();
    await viewport.screenshot({ path: resolve(output, 'samurai-orbited.png') });
    await page.mouse.move(startX, startY);
    await page.mouse.wheel(0, -520);
    await page.waitForTimeout(1000);
    const zoomed = await sampleCamera();
    await viewport.screenshot({ path: resolve(output, 'samurai-orbited-zoomed.png') });
    cameraMotion = { initial, orbited, zoomed };
  }
  console.log(JSON.stringify({ headed, scene, ...evidence, cameraMotion }, null, 2));
} finally {
  await browser?.close();
  server.kill();
}
