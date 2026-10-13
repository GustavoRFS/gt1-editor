export type PatchFileInput = {
  name: string;
  bytes: Uint8Array;
};

export type SavePatchFileResult = 'saved' | 'shared' | 'cancelled';

export { openPatchFiles, savePatchFile } from './fileAccessAdapter';
