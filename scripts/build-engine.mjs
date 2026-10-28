// Compiles the C++ engine to WebAssembly with Emscripten.
// Output: src/engine/generated/hts.mjs + hts.wasm (committed, so the app runs
// without an Emscripten install; rebuild after changing anything in engine/).
//
// Finds em++ on PATH, or under $EMSDK, or in ~/emsdk.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const isWindows = process.platform === 'win32';
const executables = isWindows ? ['em++.exe', 'em++.bat'] : ['em++'];

function findEmxx() {
  const sdks = [process.env.EMSDK, join(homedir(), 'emsdk')].filter(Boolean);
  for (const sdk of sdks) {
    for (const exe of executables) {
      const candidate = join(sdk, 'upstream', 'emscripten', exe);
      if (existsSync(candidate)) return candidate;
    }
  }
  return executables[0]; // fall back to PATH
}

const sources = [
  ...readdirSync(join(root, 'engine/src')).filter((f) => f.endsWith('.cpp')).map((f) => join('engine/src', f)),
  'engine/bindings/wasm.cpp',
];
const outDir = join(root, 'src/engine/generated');
mkdirSync(outDir, { recursive: true });

const args = [
  '-std=c++17',
  '-O3',
  '-Wall',
  '-Iengine/include',
  ...sources,
  '-lembind',
  '-sMODULARIZE=1',
  '-sEXPORT_ES6=1',
  '-sEXPORT_NAME=createEngineModule',
  '-sENVIRONMENT=web,worker,node',
  '-sALLOW_MEMORY_GROWTH=1',
  '-sFILESYSTEM=0',
  '-sDYNAMIC_EXECUTION=0',
  `-o`,
  join('src/engine/generated', 'hts.mjs'),
];

const emxx = findEmxx();
console.log(`> ${emxx} ${args.join(' ')}`);
execFileSync(emxx, args, { cwd: root, stdio: 'inherit' });
console.log('engine built: src/engine/generated/hts.{mjs,wasm}');
