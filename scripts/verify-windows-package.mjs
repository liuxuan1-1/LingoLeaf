import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, rmdirSync, statSync, writeFileSync } from 'node:fs';
import { normalize, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    arch: { type: 'string' },
    dir: { type: 'string' },
    portable: { type: 'string' },
    'skip-runtime': { type: 'boolean', default: false },
  },
});
const machineTypes = { x64: 0x8664, arm64: 0xaa64 };
const arch = values.arch;
assert.ok(Object.hasOwn(machineTypes, arch), 'Pass --arch x64 or --arch arm64');
const directory = resolve(values.dir ?? `release/win${arch === 'x64' ? '' : '-arm64'}-unpacked`);
const executable = resolve(directory, 'LingoLeaf.exe');

// The portable NSIS launcher can be x86. Inspect the actual Electron executable.
const pe = readFileSync(executable);
assert.ok(pe.length >= 64 && pe.toString('ascii', 0, 2) === 'MZ', 'Invalid executable header');
const offset = pe.readUInt32LE(0x3c);
assert.ok(offset + 6 <= pe.length, 'Invalid PE header offset');
assert.equal(pe.readUInt32LE(offset), 0x00004550, 'Invalid PE signature');
assert.equal(pe.readUInt16LE(offset + 4), machineTypes[arch], `Expected ${arch} Electron executable`);

// asar is supplied by electron-builder; no verification tooling is shipped in the app.
const require = createRequire(import.meta.url);
const { extractFile } = require('@electron/asar');
const archive = resolve(directory, 'resources/app.asar');
const metadata = JSON.parse(extractFile(archive, 'package.json').toString('utf8'));
assert.equal(metadata.name, 'lingoleaf');
assert.equal(metadata.main, 'dist/main/main.cjs');
for (const filename of [metadata.main, 'dist/main/preload.cjs', 'dist/renderer/index.html']) {
  assert.ok(extractFile(archive, normalize(filename)).length > 0, `Missing packaged ${filename}`);
}
for (const filename of ['native/windows-helper.ps1', 'native/SelectionBridge.cs', 'icon.png']) {
  assert.ok(readFileSync(resolve(directory, 'resources', filename)).length > 0, `Missing packaged ${filename}`);
}

if (values['skip-runtime']) {
  console.log(`Verified ${metadata.version} ${arch} PE architecture and package contents. Runtime startup was skipped.`);
} else {
  assert.equal(process.platform, 'win32', 'Runtime smoke check needs Windows');
  assert.equal(process.arch, arch, `Use a native ${arch} runner, or --skip-runtime for static checks only`);
  const runtimeStarted = Date.now();
  const probe = spawnSync(executable, ['-e', 'console.log(JSON.stringify({arch:process.arch,platform:process.platform,electron:process.versions.electron}))'], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    windowsHide: true,
    timeout: 30000,
    encoding: 'utf8',
  });
  assert.ifError(probe.error);
  assert.equal(probe.status, 0, `Packaged Electron failed to start: ${probe.stderr}`);
  const runtime = JSON.parse(probe.stdout.trim());
  assert.equal(runtime.platform, 'win32');
  assert.equal(runtime.arch, arch);
  assert.ok(runtime.electron, 'Expected the packaged Electron runtime');
  console.log(`Verified ${metadata.version} ${arch} package and native Electron ${runtime.electron} Node-mode startup in ${Date.now() - runtimeStarted} ms.`);

  if (values.portable) {
    const portable = resolve(values.portable);
    const diagnostics = resolve('test-results', `package-check-${arch}`);
    mkdirSync(diagnostics, { recursive: true });
    const temporary = mkdtempSync(resolve(diagnostics, 'probe-'));
    const script = resolve(temporary, 'probe.cjs');
    const marker = resolve(temporary, 'result.json');
    let verified = false;
    try {
      writeFileSync(script, `const fs = require('node:fs'); try { fs.writeFileSync(${JSON.stringify(marker)}, JSON.stringify({arch:process.arch,platform:process.platform,electron:process.versions.electron,portable:process.env.PORTABLE_EXECUTABLE_FILE})); } catch (error) { fs.writeFileSync(${JSON.stringify(marker)}, JSON.stringify({error:String(error),stack:error.stack})); process.exitCode = 1; }`);
      const launcher = await runPortable(portable, script, marker);
      writeFileSync(resolve(diagnostics, 'launcher.json'), JSON.stringify({
        portable, bytes: statSync(portable).size, temporary, ...launcher,
        marker: existsSync(marker) ? readFileSync(marker, 'utf8') : null,
      }, null, 2));
      assert.ok(!launcher.timedOut, `Portable launcher timed out after ${launcher.elapsedMs} ms; runtime marker present: ${existsSync(marker)}. See ${diagnostics}`);
      assert.equal(launcher.status, 0, `Portable launcher failed after ${launcher.elapsedMs} ms; runtime marker present: ${existsSync(marker)}. stdout: ${launcher.stdout}; stderr: ${launcher.stderr}. See ${diagnostics}`);
      const launched = JSON.parse(readFileSync(marker, 'utf8'));
      assert.equal(launched.platform, 'win32');
      assert.equal(launched.arch, arch);
      assert.equal(launched.electron, runtime.electron);
      assert.equal(resolve(launched.portable).toLowerCase(), portable.toLowerCase());
      verified = true;
      console.log(`Verified portable launcher extracted and started the ${arch} Electron runtime in ${launcher.elapsedMs} ms.`);
    } finally {
      // Preserve failed probes for CI artifacts. Delete only files created here on success.
      if (verified) {
        rmSync(script, { force: true });
        rmSync(marker, { force: true });
        rmdirSync(temporary);
      }
    }
  }
}

function runPortable(portable, script, marker) {
  return new Promise((resolveResult, reject) => {
    const started = Date.now();
    console.log('Starting portable extraction and runtime probe (180 s limit).');
    const child = spawn(portable, [script], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let fallback;
    const heartbeat = setInterval(() => {
      console.log(`Portable probe: ${Date.now() - started} ms elapsed; runtime marker present: ${existsSync(marker)}.`);
    }, 30000);
    const deadline = setTimeout(() => {
      timedOut = true;
      // Terminate only this probe's process tree, including any extracted child.
      if (child.pid) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, timeout: 10000 });
      fallback = setTimeout(() => finish(null), 5000);
    }, 180000);
    function finish(status, error) {
      clearInterval(heartbeat);
      clearTimeout(deadline);
      clearTimeout(fallback);
      if (error) reject(error);
      else resolveResult({ status, timedOut, elapsedMs: Date.now() - started, stdout, stderr });
    }
    child.stdout.on('data', chunk => { stdout = (stdout + chunk.toString()).slice(-8192); });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-8192); });
    child.on('error', error => finish(null, error));
    child.on('close', status => finish(status));
  });
}
