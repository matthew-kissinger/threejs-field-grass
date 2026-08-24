// SPDX-License-Identifier: MIT

import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(repo, 'output', 'playwright', 'island');
const vite = resolve(repo, 'node_modules', 'vite', 'bin', 'vite.js');
const port = 5196;
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
  throw new Error('Island capture preview did not start');
}

async function capture(browser, requestedBackend, viewport, formFactor) {
  const page = await browser.newPage({
    viewport,
    deviceScaleFactor: 1,
    isMobile: formFactor === 'mobile',
    hasTouch: formFactor === 'mobile',
  });
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  const suffix = requestedBackend === 'webgl2' ? '?backend=webgl2' : '';
  await page.goto(`http://127.0.0.1:${port}/${suffix}`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Island Terrain' }).click({ force: true });
  await page.locator('.viewport').scrollIntoViewIfNeeded();
  await page.waitForTimeout(1300);
  const receipt = await page.evaluate(() => window.__FIELD_GRASS_QA__);
  if (!receipt || receipt.scene !== 'island') throw new Error(`Missing island receipt: ${JSON.stringify(receipt)}`);
  const clip = await page.locator('.viewport').boundingBox();
  if (!clip) throw new Error('Island viewport has no capture bounds');
  const name = `island-${formFactor}-requested-${requestedBackend}-actual-${receipt.actualBackend}.png`;
  await page.screenshot({ path: resolve(output, name), clip });
  if (errors.length > 0) throw new Error(`${name} console errors:\n${errors.join('\n')}`);
  await page.close();
  return { name, ...receipt };
}

let browser;
try {
  await mkdir(output, { recursive: true });
  await ready();
  browser = await chromium.launch({ headless: true, args: [
    '--enable-unsafe-webgpu',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
  ] });
  const receipts = [];
  receipts.push(await capture(browser, 'webgpu', { width: 1280, height: 900 }, 'desktop'));
  receipts.push(await capture(browser, 'webgl2', { width: 1280, height: 900 }, 'desktop'));
  receipts.push(await capture(browser, 'webgpu', { width: 390, height: 844 }, 'mobile'));
  receipts.push(await capture(browser, 'webgl2', { width: 390, height: 844 }, 'mobile'));
  console.log(JSON.stringify(receipts, null, 2));
} finally {
  await browser?.close();
  server.kill();
}
