import { promises as fs } from 'node:fs';
import path from 'node:path';

/** Resolve shell.openPath's error string as a rejected action the UI can display. */
export async function openLibraryDirectory(directory: string, openPath: (directory: string) => Promise<string>): Promise<void> {
  if (!path.isAbsolute(directory)) throw new Error('请选择一个有效的学习库文件夹。');
  try {
    await fs.mkdir(directory, { recursive: true });
  } catch {
    throw new Error('无法访问学习库文件夹，请检查目录是否在线、可写。');
  }
  try {
    const error = await openPath(directory);
    if (error) throw new Error(error);
  } catch {
    throw new Error('无法打开学习库文件夹，请检查目录是否存在以及系统文件管理器是否可用。');
  }
}
