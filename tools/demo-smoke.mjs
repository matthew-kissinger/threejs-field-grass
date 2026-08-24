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

async function verify(browser, url, viewport) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.locator('canvas').waitFor({ state: 'visible' });
  const canvas = await page.locator('canvas').evaluate((element) => ({
    width: element.width,
    height: element.height,
    clientWidth: element.clientWidth,
    clientHeight: element.clientHeight,
  }));
  if (canvas.width <= 0 || canvas.height <= 0 || canvas.clientWidth <= 0 || canvas.clientHeight <= 0) {
    throw new Error(`Blank canvas dimensions: ${JSON.stringify(canvas)}`);
  }
  await page.keyboard.down('w');
  await page.waitForTimeout(300);
  await page.keyboard.up('w');
  await page.getByRole('button', { name: 'Orbit' }).click();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.getByRole('button', { name: 'Reset view' }).click();
  await page.getByRole('button', { name: 'Storygrass' }).click();
  await page.locator('.backend-badge').waitFor();
  if (errors.length > 0) throw new Error(`Browser console errors:\n${errors.join('\n')}`);
  await page.close();
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  await verify(browser, `http://127.0.0.1:${port}/`, { width: 1280, height: 900 });
  await verify(browser, `http://127.0.0.1:${port}/?backend=webgl2`, { width: 390, height: 844 });
  console.log('demo browser smoke passed');
} finally {
  await browser?.close();
  server.kill();
}
