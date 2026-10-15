import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { openLibraryDirectory } from '../src/main/library-directory';

let directory: string;
beforeEach(async () => { directory = await fs.mkdtemp(path.join(os.tmpdir(), 'lingoleaf-open-')); });
afterEach(async () => { await fs.rm(directory, { recursive: true, force: true }); });
it('creates the selected note directory and opens that exact directory', async () => {
  const target = path.join(directory, 'notes', 'LingoLeaf');
  const open = vi.fn().mockResolvedValue('');
  await expect(openLibraryDirectory(target, open)).resolves.toBeUndefined();
  expect((await fs.stat(target)).isDirectory()).toBe(true);
  expect(open).toHaveBeenCalledOnce();
  expect(open).toHaveBeenCalledWith(target);
});
it('surfaces a file manager error or exception instead of silently doing nothing', async () => {
  for (const open of [vi.fn().mockResolvedValue('Failed to open'), vi.fn().mockRejectedValue(new Error('missing shell'))]) {
    await expect(openLibraryDirectory(directory, open)).rejects.toThrow('无法打开学习库文件夹');
  }
});
it('does not invoke the shell when the note directory cannot be created', async () => {
  const file = path.join(directory, 'not-a-directory');
  await fs.writeFile(file, 'content');
  const open = vi.fn();
  await expect(openLibraryDirectory(path.join(file, 'LingoLeaf'), open)).rejects.toThrow('无法访问');
  await expect(openLibraryDirectory('relative', open)).rejects.toThrow('有效');
  expect(open).not.toHaveBeenCalled();
});
