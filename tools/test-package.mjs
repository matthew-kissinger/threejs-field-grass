// SPDX-License-Identifier: MIT

import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const npmCli = process.env.npm_execpath;
const scratch = mkdtempSync(join(tmpdir(), 'threejs-field-grass-consumer-'));
let tarball = '';

function run(args, cwd) {
  return execFileSync(args[0], args.slice(1), { cwd, encoding: 'utf8', stdio: 'pipe' });
}

function runNpm(args, cwd) {
  if (npmCli) return run([process.execPath, npmCli, ...args], cwd);
  return execFileSync('npm', args, {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
    shell: process.platform === 'win32',
  });
}

function verify(name, fixture, dependencies) {
  const target = join(scratch, name);
  mkdirSync(target, { recursive: true });
  writeFileSync(join(target, 'package.json'), `${JSON.stringify({ private: true, type: 'module' }, null, 2)}\n`);
  copyFileSync(resolve(repo, 'tests', 'fixtures', fixture), join(target, 'fixture.mjs'));
  runNpm(['install', '--ignore-scripts', '--no-audit', '--no-fund', tarball, ...dependencies], target);
  process.stdout.write(run([process.execPath, 'fixture.mjs'], target));
}

try {
  const packed = JSON.parse(runNpm(['pack', '--ignore-scripts', '--json'], repo));
  const descriptor = Array.isArray(packed) ? packed[0] : Object.values(packed)[0];
  if (!descriptor?.filename) throw new Error('npm pack did not report a tarball filename');
  tarball = resolve(repo, descriptor.filename);
  verify('vanilla', 'vanilla.mjs', ['three@0.185.1']);
  verify('react', 'react.mjs', [
    'three@0.185.1',
    'react@19.2.8',
    '@react-three/fiber@9.7.0',
  ]);
  console.log(`package consumers passed for ${basename(tarball)}`);
} finally {
  if (tarball) rmSync(tarball, { force: true });
  rmSync(scratch, { recursive: true, force: true });
}
