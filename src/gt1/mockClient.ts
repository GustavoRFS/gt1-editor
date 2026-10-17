import type { Gt1EditorClient, Gt1UserPatchScanResult, Gt1UserPatchScanUpdate } from './client';
import { setParameterLocally, setPatchNameLocally } from './sysex';
import { createMockSystemSettings, createMockUserPatches } from './mockData';
import { getGt1SystemSetting } from './systemSettings';
import type { Gt1SystemSettingId, Gt1SystemSettings } from './systemSettings';
import type { Gt1Patch, Gt1PatchDestination } from './types';
import { Gt1ProtocolError } from './types';

export type MockGt1Client = Gt1EditorClient & {
  reset(): void;
  clear(): void;
  getUserPatches(): Gt1Patch[];
};

function clonePatch(patch: Gt1Patch): Gt1Patch {
  return { ...patch, frames: patch.frames.map((frame) => new Uint8Array(frame)) };
}

function slotPatchId(userPatch: number): string {
  return `gt1-user-${String(userPatch).padStart(2, '0')}`;
}

export function createMockGt1Client(): MockGt1Client {
  let userPatches: Gt1Patch[] = [];
  let systemSettings: Gt1SystemSettings | null = null;
  let currentPatch: Gt1Patch | null = null;

  const reset = () => {
    userPatches = createMockUserPatches();
    systemSettings = createMockSystemSettings();
    currentPatch = clonePatch(userPatches[10]);
  };

  const clear = () => {
    userPatches = [];
    systemSettings = null;
    currentPatch = null;
  };

  reset();

  return {
    reset,
    clear,
    getUserPatches: () => userPatches.map(clonePatch),
    async initializeEditorCommunication() {},
    async readCurrentPatch() {
      if (!currentPatch) throw new Gt1ProtocolError('device-disconnected', 'O dispositivo mock não está ativo.');
      return clonePatch(currentPatch);
    },
    async readSystemSettings() {
      if (!systemSettings) throw new Gt1ProtocolError('device-disconnected', 'O dispositivo mock não está ativo.');
      return { ...systemSettings };
    },
    async writeSystemSetting(_unitId: number, settingId: Gt1SystemSettingId, value: number) {
      const definition = getGt1SystemSetting(settingId);
      if (!systemSettings) throw new Gt1ProtocolError('device-disconnected', 'O dispositivo mock não está ativo.');
      if (!Number.isInteger(value)
        || value < definition.min
        || value > definition.max
        || (value - definition.min) % definition.step !== 0
        || (definition.options && !definition.options.some((option) => option.value === value))) {
        throw new Gt1ProtocolError('invalid-address', `O valor não é suportado para ${definition.label}.`);
      }
      systemSettings = { ...systemSettings, [settingId]: value };
    },
    async readUserPatchNames(
      _unitId: number,
      onProgress?: (update: Gt1UserPatchScanUpdate) => void,
      signal?: AbortSignal,
    ): Promise<Gt1UserPatchScanResult> {
      const patches: Gt1Patch[] = [];
      for (const patch of userPatches) {
        if (signal?.aborted) throw new Gt1ProtocolError('cancelled', 'A leitura mock dos patches foi cancelada.');
        const copy = clonePatch(patch);
        patches.push(copy);
        onProgress?.({ completed: patches.length, total: userPatches.length, userPatch: patch.userPatch!, patch: copy });
      }
      return { patches, failures: [] };
    },
    async selectUserPatch(_unitId: number, userPatch: number) {
      const selected = userPatches.find((patch) => patch.userPatch === userPatch);
      if (!selected) throw new Gt1ProtocolError('invalid-address', `Slot mock inválido: U${userPatch}.`);
      currentPatch = clonePatch(selected);
      return clonePatch(currentPatch);
    },
    async loadPatchToEditBufferAndVerify(patch: Gt1Patch, _unitId: number) {
      currentPatch = clonePatch(patch);
      return clonePatch(currentPatch);
    },
    async writeUserPatchAndVerify(patch: Gt1Patch, _unitId: number, userPatch: number) {
      const index = userPatches.findIndex((candidate) => candidate.userPatch === userPatch);
      if (index < 0) throw new Gt1ProtocolError('invalid-address', `Slot mock inválido: U${userPatch}.`);
      const written: Gt1Patch = {
        ...clonePatch(patch),
        id: slotPatchId(userPatch),
        userPatch,
        sourceFormat: 'device',
        sourceName: `GT-1 (mock) · U${String(userPatch).padStart(2, '0')}`,
      };
      userPatches = userPatches.map((candidate, candidateIndex) => candidateIndex === index ? written : candidate);
      currentPatch = clonePatch(written);
      return clonePatch(written);
    },
    async setParameter(patch: Gt1Patch, parameterId: string, value: number) {
      const updated = setParameterLocally(patch, parameterId, value);
      if (updated === patch) throw new Gt1ProtocolError('invalid-address', `Parâmetro mock inválido ou ausente: ${parameterId}.`);
      currentPatch = clonePatch(updated);
      return clonePatch(updated);
    },
    async setPatchName(patch: Gt1Patch, name: string) {
      const updated = setPatchNameLocally(patch, name);
      if (updated === patch) throw new Gt1ProtocolError('incomplete-patch', 'O patch mock não contém os blocos necessários para atualizar o nome.');
      currentPatch = clonePatch(updated);
      return clonePatch(updated);
    },
  };
}
