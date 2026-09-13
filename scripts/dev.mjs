import { spawn } from 'node:child_process';
import { createServer } from 'vite';
import { build } from 'esbuild';
import electron from 'electron';
await build({
  entryPoints: ['src/main/main.ts', 'src/main/preload.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  outdir: 'dist/main',
  outExtension: { '.js': '.cjs' },
  external: ['electron'],
  sourcemap: true,
});
const server = await createServer();
await server.listen();
const env = { ...process.env, LINGOLEAF_DEV_URL: 'http://127.0.0.1:5173' };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, ['.'], { stdio: 'inherit', env, windowsHide: true });
child.on('exit', async () => {
  await server.close();
  process.exit();
});
