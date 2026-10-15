import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import { normalize, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
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
  console.log(`Verified ${metadata.version} ${arch} package and native Electron ${runtime.electron} Node-mode startup.`);

  if (values.portable) {
    const portable = resolve(values.portable);
    const temporary = mkdtempSync(resolve(tmpdir(), 'lingoleaf-package-check-'));
    const script = resolve(temporary, 'probe.cjs');
    const marker = resolve(temporary, 'result.json');
    try {
      writeFileSync(script, `require('node:fs').writeFileSync(${JSON.stringify(marker)}, JSON.stringify({arch:process.arch,platform:process.platform,electron:process.versions.electron,portable:process.env.PORTABLE_EXECUTABLE_FILE}));`);
      const launcher = spawnSync(portable, [script], {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        windowsHide: true,
        timeout: 60000,
        encoding: 'utf8',
      });
      assert.ifError(launcher.error);
      assert.equal(launcher.status, 0, `Portable launcher failed: ${launcher.stderr}`);
      const launched = JSON.parse(readFileSync(marker, 'utf8'));
      assert.equal(launched.platform, 'win32');
      assert.equal(launched.arch, arch);
      assert.equal(launched.electron, runtime.electron);
      assert.equal(resolve(launched.portable).toLowerCase(), portable.toLowerCase());
      console.log(`Verified portable launcher extracted and started the ${arch} Electron runtime.`);
    } finally {
      // Delete only the two files created here; never recursively remove a computed directory.
      rmSync(script, { force: true });
      rmSync(marker, { force: true });
      rmdirSync(temporary);
    }
  }
}
