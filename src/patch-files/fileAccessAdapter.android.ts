import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { PatchFileInput, SavePatchFileResult } from './fileAccess';

export async function openPatchFiles(): Promise<PatchFileInput[] | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: true, copyToCacheDirectory: true });
  if (result.canceled) return null;
  return Promise.all(result.assets.map(async (asset) => ({
    name: asset.name,
    bytes: new Uint8Array(await new File(asset.uri).arrayBuffer()),
  })));
}

export async function savePatchFile(fileName: string, bytes: Uint8Array): Promise<SavePatchFileResult> {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const file = new File(Paths.cache, safeName);
  if (file.exists) file.delete();
  file.create();
  file.write(bytes);
  if (!(await Sharing.isAvailableAsync())) throw new Error('O compartilhamento de arquivos não está disponível neste dispositivo.');
  await Sharing.shareAsync(file.uri, { dialogTitle: 'Exportar patches da GT-1', mimeType: 'application/octet-stream' });
  return 'shared';
}
