import type { PatchFileInput, SavePatchFileResult } from './fileAccess';

export async function openPatchFiles(): Promise<PatchFileInput[] | null> {
  throw new Error('A abertura de arquivos não está disponível nesta plataforma.');
}

export async function savePatchFile(_fileName: string, _bytes: Uint8Array): Promise<SavePatchFileResult> {
  throw new Error('A exportação de arquivos não está disponível nesta plataforma.');
}
