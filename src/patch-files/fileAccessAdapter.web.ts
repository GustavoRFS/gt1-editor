import { isTauri } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readFile, writeFile } from '@tauri-apps/plugin-fs';
import type { PatchFileInput, SavePatchFileResult } from './fileAccess';

function requireTauri(): void {
  if (!isTauri()) throw new Error('A abertura e gravação de arquivos estão disponíveis pelo app desktop ou Android.');
}

export async function openPatchFiles(): Promise<PatchFileInput[] | null> {
  requireTauri();
  const paths = await open({
    title: 'Abrir patches da GT-1',
    multiple: true,
    filters: [{ name: 'Patches GT-1', extensions: ['syx', 'mid', 'midi', 'gcl'] }],
  });
  if (!paths) return null;
  const selected = Array.isArray(paths) ? paths : [paths];
  return Promise.all(selected.map(async (path) => ({
    name: path.split(/[\\/]/).pop() ?? 'patch.syx',
    bytes: await readFile(path),
  })));
}

export async function savePatchFile(fileName: string, bytes: Uint8Array): Promise<SavePatchFileResult> {
  requireTauri();
  const path = await save({
    title: 'Exportar patches da GT-1',
    defaultPath: fileName,
    filters: [{ name: 'Patches GT-1', extensions: ['syx', 'mid', 'gcl'] }],
  });
  if (!path) return 'cancelled';
  await writeFile(path, bytes);
  return 'saved';
}
