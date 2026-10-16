import { decodeAddressedPatchResponse, decodePatchResponse, decodeSystemSettingsBlock, encodeEditorCommunicationLevelRequest, encodeEditorCommunicationModeWrite, encodeParameterWrite, encodePatchNameWrite, encodePatchSelectionWrite, encodePatchWrite, encodeReadRequest, encodeSystemSettingWrite, encodeSystemSettingsReadRequest, encodeUserPatchNameReadRequest, encodeUserPatchReadRequest, GT1_USER_PATCH_COUNT, patchContentsEqual, setParameterLocally, setPatchNameLocally, validateGt1WireFrame } from './sysex';
import { gt1SystemMemoryBlocks, gt1SystemSettingDefinitions } from './systemSettings';
import type { Gt1PartialSystemSettings, Gt1SystemSettingId, Gt1SystemSettings } from './systemSettings';
import type { Gt1Patch, Gt1PatchDestination } from './types';
import { Gt1ProtocolError } from './types';
import type { MidiTransport } from '../transport/transport';

const PATCH_READ_TIMEOUT_MS = 10_000;
const PATCH_NAME_READ_GAP_MS = 30;
const EDITOR_COMMUNICATION_TIMEOUT_MS = 3_000;
const PATCH_WRITE_GAP_MS = 30;
const PATCH_WRITE_SETTLE_MS = 1_000;
const PATCH_SELECTION_RETRY_MS = 500;
const PATCH_SELECTION_TIMEOUT_MS = 5_000;
const SYSTEM_BLOCK_READ_TIMEOUT_MS = 3_000;
const PATCH_READ_TERMINATORS = [[0x07, 0x44], [0x0f, 0x44], [0x10, 0x10]] as const;

export type Gt1UserPatchScanUpdate = {
  completed: number;
  total: number;
  userPatch: number;
  patch?: Gt1Patch;
  error?: unknown;
};

export type Gt1UserPatchScanResult = {
  patches: Gt1Patch[];
  failures: Array<{ userPatch: number; error: unknown }>;
};

export interface Gt1EditorClient {
  initializeEditorCommunication(unitId: number): Promise<void>;
  readCurrentPatch(unitId: number): Promise<Gt1Patch>;
  readSystemSettings(unitId: number): Promise<Gt1SystemSettings>;
  writeSystemSetting(unitId: number, settingId: Gt1SystemSettingId, value: number): Promise<void>;
  readUserPatchNames(
    unitId: number,
    onProgress?: (update: Gt1UserPatchScanUpdate) => void,
    signal?: AbortSignal,
  ): Promise<Gt1UserPatchScanResult>;
  selectUserPatch(unitId: number, userPatch: number): Promise<Gt1Patch>;
  loadPatchToEditBufferAndVerify(patch: Gt1Patch, unitId: number): Promise<Gt1Patch>;
  writeUserPatchAndVerify(patch: Gt1Patch, unitId: number, userPatch: number): Promise<Gt1Patch>;
  setParameter(patch: Gt1Patch, parameterId: string, value: number): Promise<Gt1Patch>;
  setPatchName(patch: Gt1Patch, name: string): Promise<Gt1Patch>;
}

export class Gt1Client implements Gt1EditorClient {
  private pending: Promise<unknown> = Promise.resolve();

  constructor(private readonly transport: MidiTransport, private readonly unitId = 0) {}

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const current = this.pending.then(operation, operation);
    this.pending = current.then(() => undefined, () => undefined);
    return current;
  }

  readCurrentPatch(unitId: number): Promise<Gt1Patch> {
    return this.readPatch(unitId, encodeReadRequest(unitId), [0x60, 0x00]);
  }

  readUserPatch(unitId: number, userPatch: number, signal?: AbortSignal): Promise<Gt1Patch> {
    const address = [0x10, userPatch - 1] as const;
    return this.readPatch(unitId, encodeUserPatchReadRequest(unitId, userPatch), address, signal).then((patch) => ({
      ...patch,
      id: `gt1-user-${String(userPatch).padStart(2, '0')}`,
      userPatch,
      sourceName: `GT-1 · U${String(userPatch).padStart(2, '0')}`,
    }));
  }

  selectUserPatch(unitId: number, userPatch: number): Promise<Gt1Patch> {
    return this.enqueue(async () => {
      await this.requestPatchSelection(unitId, userPatch);
      const active = await this.readPatchUnqueued(unitId, encodeReadRequest(unitId), [0x60, 0x00]);
      return { ...active, id: `gt1-user-${String(userPatch).padStart(2, '0')}`, userPatch, sourceName: `GT-1 · U${String(userPatch).padStart(2, '0')}` };
    });
  }

  loadPatchToEditBufferAndVerify(patch: Gt1Patch, unitId: number): Promise<Gt1Patch> {
    return this.enqueue(async () => {
      await this.sendPatchFrames(encodePatchWrite(patch, unitId));
      await new Promise((resolve) => setTimeout(resolve, 100));
      const active = await this.readPatchUnqueued(unitId, encodeReadRequest(unitId), [0x60, 0x00]);
      if (!patchContentsEqual(patch, active)) {
        throw new Gt1ProtocolError('write-verification-failed', 'A releitura do buffer temporário não corresponde ao patch enviado.');
      }
      return { ...active, id: patch.id, userPatch: patch.userPatch, sourceName: patch.sourceName };
    });
  }

  readSystemSettings(
    unitId: number,
    onProgress?: (completed: number, total: number) => void,
    signal?: AbortSignal,
  ): Promise<Gt1SystemSettings> {
    return this.enqueue(async () => {
      let settings: Gt1PartialSystemSettings = {};
      for (let blockIndex = 0; blockIndex < gt1SystemMemoryBlocks.length; blockIndex += 1) {
        if (signal?.aborted) throw new Gt1ProtocolError('cancelled', 'A leitura das configurações foi cancelada.');
        const response = await this.readSystemBlock(unitId, blockIndex, signal);
        settings = decodeSystemSettingsBlock(response, blockIndex, settings);
        onProgress?.(blockIndex + 1, gt1SystemMemoryBlocks.length);
      }
      if (!gt1SystemSettingDefinitions.every((definition) => settings[definition.id] !== undefined)) {
        throw new Gt1ProtocolError('incomplete-patch', 'A leitura da GT-1 não retornou todas as configurações de sistema esperadas.');
      }
      return settings as Gt1SystemSettings;
    });
  }

  writeSystemSetting(unitId: number, settingId: Gt1SystemSettingId, value: number): Promise<void> {
    return this.enqueue(() => this.transport.sendSysEx(encodeSystemSettingWrite(unitId, settingId, value)));
  }

  private readSystemBlock(unitId: number, blockIndex: number, signal?: AbortSignal): Promise<Uint8Array> {
    const block = gt1SystemMemoryBlocks[blockIndex];
    if (!block) return Promise.reject(new Gt1ProtocolError('invalid-address', `Bloco de sistema inválido: ${blockIndex}.`));
    return new Promise<Uint8Array>((resolve, reject) => {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      let unsubscribe: () => void = () => {};
      let unsubscribeDisconnect: () => void = () => {};
      let settled = false;
      const cleanup = () => {
        if (timeout) clearTimeout(timeout);
        unsubscribe();
        unsubscribeDisconnect();
        signal?.removeEventListener('abort', abort);
      };
      const finish = (error?: unknown, response?: Uint8Array) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) reject(error);
        else if (response) resolve(response);
      };
      const abort = () => finish(new Gt1ProtocolError('cancelled', 'A leitura das configurações foi cancelada.'));

      unsubscribe = this.transport.onSysEx((bytes) => {
        if (settled || bytes[0] !== 0xf0 || bytes[1] !== 0x41 || bytes[7] !== 0x12 || bytes.length < 14) return;
        const addressMatches = block.address.every((byte, index) => bytes[8 + index] === byte);
        if (!addressMatches) return;
        if (bytes[2] !== unitId) {
          finish(new Gt1ProtocolError('invalid-unit-id', 'A resposta de configurações veio de outro Device ID.'));
          return;
        }
        try {
          validateGt1WireFrame(bytes);
          finish(undefined, new Uint8Array(bytes));
        } catch (error) {
          finish(error);
        }
      });
      unsubscribeDisconnect = this.transport.onDisconnect?.(() => finish(new Gt1ProtocolError('device-disconnected', 'A GT-1 foi desconectada durante a leitura das configurações.'))) ?? (() => {});
      timeout = setTimeout(() => finish(new Gt1ProtocolError('incomplete-patch', `Tempo esgotado aguardando o bloco de sistema ${blockIndex + 1}.`)), SYSTEM_BLOCK_READ_TIMEOUT_MS);
      if (signal?.aborted) {
        abort();
        return;
      }
      signal?.addEventListener('abort', abort, { once: true });
      void this.transport.sendSysEx(encodeSystemSettingsReadRequest(unitId, blockIndex)).catch((error) => finish(error));
    });
  }

  initializeEditorCommunication(unitId: number): Promise<void> {
    return this.enqueue(async () => {
      const address = [0x7f, 0x00, 0x00, 0x00] as const;
      await new Promise<void>((resolve, reject) => {
        let timeout: ReturnType<typeof setTimeout> | undefined;
        let unsubscribe: () => void = () => {};
        let unsubscribeDisconnect: () => void = () => {};
        let settled = false;
        const finish = (error?: unknown) => {
          if (settled) return;
          settled = true;
          if (timeout) clearTimeout(timeout);
          unsubscribe();
          unsubscribeDisconnect();
          if (error) reject(error);
          else resolve();
        };
        unsubscribe = this.transport.onSysEx((bytes) => {
          if (bytes[0] !== 0xf0 || bytes[1] !== 0x41 || bytes[7] !== 0x12) return;
          if (bytes[8] !== address[0] || bytes[9] !== address[1] || bytes[10] !== address[2] || bytes[11] !== address[3]) return;
          try {
            validateGt1WireFrame(bytes);
            if (bytes[2] !== unitId) {
              throw new Gt1ProtocolError('invalid-unit-id', 'A resposta de comunicação veio de outro Device ID.');
            }
            finish();
          } catch (error) {
            finish(error);
          }
        });
        unsubscribeDisconnect = this.transport.onDisconnect?.(() => finish(new Gt1ProtocolError('device-disconnected', 'A GT-1 foi desconectada ao ativar o modo de comunicação.'))) ?? (() => {});
        timeout = setTimeout(() => finish(new Gt1ProtocolError('incomplete-patch', 'Tempo esgotado aguardando o nível de comunicação da GT-1.')), EDITOR_COMMUNICATION_TIMEOUT_MS);
        void this.transport.sendSysEx(encodeEditorCommunicationLevelRequest(unitId)).catch((error) => finish(error));
      });

      await this.transport.sendSysEx(encodeEditorCommunicationModeWrite(unitId, true));
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
  }

  async readUserPatches(
    unitId: number,
    onProgress?: (update: Gt1UserPatchScanUpdate) => void,
    signal?: AbortSignal,
  ): Promise<Gt1UserPatchScanResult> {
    const patches: Gt1Patch[] = [];
    const failures: Array<{ userPatch: number; error: unknown }> = [];

    for (let userPatch = 1; userPatch <= GT1_USER_PATCH_COUNT; userPatch += 1) {
      if (signal?.aborted) throw new Gt1ProtocolError('cancelled', 'A leitura dos patches foi cancelada.');
      try {
        const patch = await this.readUserPatch(unitId, userPatch, signal);
        patches.push(patch);
        onProgress?.({ completed: userPatch, total: GT1_USER_PATCH_COUNT, userPatch, patch });
      } catch (error) {
        if (signal?.aborted) throw new Gt1ProtocolError('cancelled', 'A leitura dos patches foi cancelada.');
        const code = error instanceof Gt1ProtocolError ? error.code : (error as { code?: string } | null)?.code;
        if (code === 'device-disconnected' || code === 'not-connected') throw error;
        failures.push({ userPatch, error });
        onProgress?.({ completed: userPatch, total: GT1_USER_PATCH_COUNT, userPatch, error });
      }
    }

    return { patches, failures };
  }

  async readUserPatchNames(
    unitId: number,
    onProgress?: (update: Gt1UserPatchScanUpdate) => void,
    signal?: AbortSignal,
  ): Promise<Gt1UserPatchScanResult> {
    const patches: Gt1Patch[] = [];
    const failures: Array<{ userPatch: number; error: unknown }> = [];

    for (let userPatch = 1; userPatch <= GT1_USER_PATCH_COUNT; userPatch += 1) {
      if (signal?.aborted) throw new Gt1ProtocolError('cancelled', 'A leitura dos patches foi cancelada.');
      try {
        const name = await this.readUserPatchName(unitId, userPatch, signal);
        const patch: Gt1Patch = {
          id: `gt1-user-${String(userPatch).padStart(2, '0')}`,
          userPatch,
          name,
          frames: [],
          sourceFormat: 'device',
          sourceName: `GT-1 · U${String(userPatch).padStart(2, '0')}`,
          complete: false,
        };
        patches.push(patch);
        onProgress?.({ completed: userPatch, total: GT1_USER_PATCH_COUNT, userPatch, patch });
      } catch (error) {
        if (signal?.aborted) throw new Gt1ProtocolError('cancelled', 'A leitura dos patches foi cancelada.');
        const code = error instanceof Gt1ProtocolError ? error.code : (error as { code?: string } | null)?.code;
        if (code === 'device-disconnected' || code === 'not-connected') throw error;
        failures.push({ userPatch, error });
        onProgress?.({ completed: userPatch, total: GT1_USER_PATCH_COUNT, userPatch, error });
      }
      if (userPatch < GT1_USER_PATCH_COUNT && !signal?.aborted) {
        await new Promise((resolve) => setTimeout(resolve, PATCH_NAME_READ_GAP_MS));
      }
    }

    return { patches, failures };
  }

  private readPatch(unitId: number, requests: Uint8Array[], expectedAddress: readonly [number, number], signal?: AbortSignal): Promise<Gt1Patch> {
    return this.enqueue(() => this.readPatchUnqueued(unitId, requests, expectedAddress, signal));
  }

  private readPatchUnqueued(unitId: number, requests: Uint8Array[], expectedAddress: readonly [number, number], signal?: AbortSignal): Promise<Gt1Patch> {
    return new Promise<Gt1Patch>((resolve, reject) => {
      const frames: Uint8Array[] = [];
      let timeout: ReturnType<typeof setTimeout> | undefined;
      let unsubscribe: () => void = () => {};
      let unsubscribeDisconnect: () => void = () => {};
      let settled = false;
      let requestIndex = 0;

      const cleanup = () => {
        if (timeout) clearTimeout(timeout);
        unsubscribe();
        unsubscribeDisconnect();
        signal?.removeEventListener('abort', abort);
      };
      const finish = (error?: unknown, patch?: Gt1Patch) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) reject(error);
        else if (patch) resolve(patch);
      };
      const finishCompact = () => {
        try {
          const patch = decodePatchResponse(frames, expectedAddress);
          if (!patch.complete) return;
          finish(undefined, patch);
        } catch (error) {
          finish(error);
        }
      };

      unsubscribe = this.transport.onSysEx((bytes) => {
        if (settled || bytes[0] !== 0xf0 || bytes[1] !== 0x41) return;
        if (bytes.length === 2316) {
          frames.push(new Uint8Array(bytes));
          finishCompact();
          return;
        }
        if (bytes.length < 14 || bytes[7] !== 0x12) return;
        if (bytes[8] === expectedAddress[0] && bytes[9] !== expectedAddress[1]) {
          finish(new Gt1ProtocolError('invalid-address', 'A resposta da GT-1 veio de outro patch.'));
          return;
        }
        if (bytes[8] !== expectedAddress[0] || bytes[9] !== expectedAddress[1]) return;
        frames.push(new Uint8Array(bytes));
        if (frames.length === 10 && frames.reduce((sum, frame) => sum + frame.length, 0) === 2316) {
          finishCompact();
          return;
        }

        const terminal = PATCH_READ_TERMINATORS[requestIndex];
        if (bytes[10] !== terminal[0] || bytes[11] !== terminal[1]) return;
        requestIndex += 1;
        if (requestIndex === requests.length) {
          try {
            finish(undefined, decodeAddressedPatchResponse(frames, expectedAddress));
          } catch (error) {
            finish(error);
          }
          return;
        }
        void this.transport.sendSysEx(requests[requestIndex]).catch((error) => finish(error));
      });
      unsubscribeDisconnect = this.transport.onDisconnect?.(() => finish(new Gt1ProtocolError('device-disconnected', 'A GT-1 foi desconectada antes do patch completo.'))) ?? (() => {});
      timeout = setTimeout(() => finish(new Gt1ProtocolError('incomplete-patch', 'Tempo esgotado aguardando o patch completo da GT-1.')), PATCH_READ_TIMEOUT_MS);
      const abort = () => finish(new Gt1ProtocolError('cancelled', 'A leitura dos patches foi cancelada.'));
      if (signal?.aborted) {
        abort();
        return;
      }
      signal?.addEventListener('abort', abort, { once: true });

      if (requests.length !== PATCH_READ_TERMINATORS.length) {
        finish(new Gt1ProtocolError('invalid-address', 'A leitura da GT-1 precisa conter as três faixas de memória esperadas.'));
        return;
      }
      void this.transport.sendSysEx(requests[0]).catch((error) => finish(error));
    });
  }

  private readUserPatchName(unitId: number, userPatch: number, signal?: AbortSignal): Promise<string> {
    const request = encodeUserPatchNameReadRequest(unitId, userPatch);
    return this.enqueue(() => new Promise<string>((resolve, reject) => {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      let unsubscribe: () => void = () => {};
      let unsubscribeDisconnect: () => void = () => {};
      let settled = false;
      const cleanup = () => {
        if (timeout) clearTimeout(timeout);
        unsubscribe();
        unsubscribeDisconnect();
        signal?.removeEventListener('abort', abort);
      };
      const finish = (error?: unknown, name?: string) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) reject(error);
        else resolve(name ?? 'Patch sem nome');
      };
      const abort = () => finish(new Gt1ProtocolError('cancelled', 'A leitura dos patches foi cancelada.'));

      unsubscribe = this.transport.onSysEx((bytes) => {
        if (settled || bytes[0] !== 0xf0 || bytes[1] !== 0x41 || bytes[7] !== 0x12) return;
        if (bytes[8] !== 0x10 || bytes[9] !== userPatch - 1) return;
        try {
          validateGt1WireFrame(bytes);
          if (bytes[2] !== unitId) throw new Gt1ProtocolError('invalid-unit-id', 'A resposta do nome veio de outro Device ID.');
          if (bytes[10] !== 0 || bytes[11] !== 0 || bytes.length !== 30) {
            throw new Gt1ProtocolError('incomplete-patch', `O nome de U${String(userPatch).padStart(2, '0')} veio incompleto.`);
          }
          const name = String.fromCharCode(...bytes.subarray(12, 28)).replace(/[\x00-\x1f\x7f]/g, ' ').trimEnd();
          finish(undefined, name || 'Sem nome');
        } catch (error) {
          finish(error);
        }
      });
      unsubscribeDisconnect = this.transport.onDisconnect?.(() => finish(new Gt1ProtocolError('device-disconnected', 'A GT-1 foi desconectada durante a leitura dos nomes.'))) ?? (() => {});
      timeout = setTimeout(() => finish(new Gt1ProtocolError('incomplete-patch', `Tempo esgotado lendo o nome de U${String(userPatch).padStart(2, '0')}.`)), PATCH_READ_TIMEOUT_MS);
      if (signal?.aborted) {
        abort();
        return;
      }
      signal?.addEventListener('abort', abort, { once: true });
      void this.transport.sendSysEx(request).catch((error) => finish(error));
    }));
  }

  private requestPatchSelection(unitId: number, userPatch: number): Promise<void> {
    const frame = encodePatchSelectionWrite(unitId, userPatch);
    return new Promise<void>((resolve, reject) => {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      let retryTimer: ReturnType<typeof setTimeout> | undefined;
      let unsubscribe: () => void = () => {};
      let settled = false;
      const expectedIndex = userPatch - 1;
      const cleanup = () => {
        if (timeout) clearTimeout(timeout);
        if (retryTimer) clearTimeout(retryTimer);
        unsubscribe();
      };
      const finish = (error?: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) reject(error);
        else resolve();
      };
      const sendAndRetry = () => {
        if (settled) return;
        void this.transport.sendSysEx(frame).catch((error) => finish(error));
        retryTimer = setTimeout(sendAndRetry, PATCH_SELECTION_RETRY_MS);
      };

      unsubscribe = this.transport.onSysEx((bytes) => {
        if (settled || bytes[0] !== 0xf0 || bytes[1] !== 0x41 || bytes[7] !== 0x12) return;
        if (bytes[8] !== 0x00 || bytes[9] !== 0x01 || bytes[10] !== 0x00 || bytes[11] !== 0x00) return;
        try {
          validateGt1WireFrame(bytes);
          if (bytes[2] !== unitId) throw new Gt1ProtocolError('invalid-unit-id', 'A confirmação da seleção veio de outro Device ID.');
          if (bytes.length !== 16) throw new Gt1ProtocolError('incomplete-patch', 'A confirmação de seleção da GT-1 veio incompleta.');
          const actualIndex = bytes[12] * 128 + bytes[13];
          if (actualIndex === expectedIndex) finish();
        } catch (error) {
          finish(error);
        }
      });
      timeout = setTimeout(() => finish(new Gt1ProtocolError('write-verification-failed', `A GT-1 não selecionou U${String(userPatch).padStart(2, '0')}.`)), PATCH_SELECTION_TIMEOUT_MS);
      sendAndRetry();
    });
  }

  writePatch(patch: Gt1Patch, unitId: number, destination?: Gt1PatchDestination): Promise<void> {
    return this.enqueue(async () => {
      await this.sendPatchFrames(encodePatchWrite(patch, unitId, destination));
      if (destination) await new Promise((resolve) => setTimeout(resolve, PATCH_WRITE_SETTLE_MS));
    });
  }

  private async sendPatchFrames(frames: Uint8Array[]): Promise<void> {
    for (let index = 0; index < frames.length; index += 1) {
      await this.transport.sendSysEx(frames[index]);
      const nextFrame = frames[index + 1];
      const nextIsPatchWriteCommand = nextFrame?.[8] === 0x7f && nextFrame[10] === 0x01 && nextFrame[11] === 0x04;
      if (index < frames.length - 1 && !nextIsPatchWriteCommand) await new Promise((resolve) => setTimeout(resolve, PATCH_WRITE_GAP_MS));
    }
  }

  async writeUserPatchAndVerify(patch: Gt1Patch, unitId: number, userPatch: number): Promise<Gt1Patch> {
    await this.writePatch(patch, unitId, { userPatch });
    const written = await this.readUserPatch(unitId, userPatch);
    if (!patchContentsEqual(patch, written)) {
      throw new Gt1ProtocolError('write-verification-failed', `A releitura de U${String(userPatch).padStart(2, '0')} não corresponde ao patch enviado.`);
    }
    return written;
  }

  setParameter(patch: Gt1Patch, parameterId: string, value: number): Promise<Gt1Patch> {
    return this.enqueue(async () => {
      const frame = encodeParameterWrite(this.unitId, parameterId, value);
      const updated = setParameterLocally(patch, parameterId, value);
      if (updated === patch) throw new Gt1ProtocolError('invalid-address', `Parâmetro inválido ou ausente: ${parameterId}.`);
      await this.transport.sendSysEx(frame);
      return updated;
    });
  }

  setPatchName(patch: Gt1Patch, name: string): Promise<Gt1Patch> {
    return this.enqueue(async () => {
      if (!patch.complete || patch.frames.length !== 17) {
        throw new Gt1ProtocolError('incomplete-patch', 'A edição do nome exige os 17 blocos completos do patch.');
      }
      const updated = setPatchNameLocally(patch, name);
      if (updated === patch) throw new Gt1ProtocolError('incomplete-patch', 'O patch não contém o bloco base para atualizar o nome.');
      await this.transport.sendSysEx(encodePatchNameWrite(this.unitId, name));
      return updated;
    });
  }
}
