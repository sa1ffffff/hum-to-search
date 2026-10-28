// Compiles and runs the native engine tests with the host C++ compiler.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cxx = process.env.CXX || 'g++';
const binary = join('build', process.platform === 'win32' ? 'engine_tests.exe' : 'engine_tests');
const sources = readdirSync(join(root, 'engine/src')).filter((f) => f.endsWith('.cpp')).map((f) => join('engine/src', f));

mkdirSync(join(root, 'build'), { recursive: true });
execFileSync(cxx, ['-std=c++17', '-O2', '-Wall', '-Wextra', '-Wpedantic', '-Iengine/include', '-Iengine/tests',
  ...sources, 'engine/tests/test_main.cpp', '-o', binary], { cwd: root, stdio: 'inherit' });
execFileSync(resolve(root, binary), { cwd: root, stdio: 'inherit' });
