import { decodePatchResponse, encodeParameterWrite, encodePatchWrite, encodeReadRequest, setParameterLocally } from './sysex';
import type { Gt1Patch, Gt1PatchDestination } from './types';
import { Gt1ProtocolError } from './types';
import type { MidiTransport } from '../transport/transport';

const PATCH_READ_TIMEOUT_MS = 10_000;
const PATCH_READ_IDLE_MS = 400;
const PATCH_WRITE_GAP_MS = 5;

export class Gt1Client {
  private pending: Promise<unknown> = Promise.resolve();

  constructor(private readonly transport: MidiTransport, private readonly unitId = 0) {}

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const current = this.pending.then(operation, operation);
    this.pending = current.then(() => undefined, () => undefined);
    return current;
  }

  readCurrentPatch(unitId: number): Promise<Gt1Patch> {
    return this.enqueue(() => new Promise<Gt1Patch>((resolve, reject) => {
      const frames: Uint8Array[] = [];
      let idleTimer: ReturnType<typeof setTimeout> | undefined;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      let unsubscribe: () => void = () => {};
      let settled = false;

      const cleanup = () => {
        if (idleTimer) clearTimeout(idleTimer);
        if (timeout) clearTimeout(timeout);
        unsubscribe();
      };
      const finish = (error?: unknown, patch?: Gt1Patch) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) reject(error);
        else if (patch) resolve(patch);
      };
      const tryDecode = () => {
        try {
          const patch = decodePatchResponse(frames);
          if (!patch.complete) return;
          finish(undefined, patch);
        } catch (error) {
          finish(error);
        }
      };

      unsubscribe = this.transport.onSysEx((bytes) => {
        if (settled || bytes[0] !== 0xf0 || bytes[1] !== 0x41) return;
        frames.push(new Uint8Array(bytes));
        if (idleTimer) clearTimeout(idleTimer);
        if (frames.length === 1 && bytes.length === 2316) {
          tryDecode();
          return;
        }
        if (frames.length === 17) {
          tryDecode();
          return;
        }
        idleTimer = setTimeout(tryDecode, PATCH_READ_IDLE_MS);
      });
      timeout = setTimeout(() => finish(new Gt1ProtocolError('incomplete-patch', 'Tempo esgotado aguardando o patch completo da GT-1.')), PATCH_READ_TIMEOUT_MS);

      void this.transport.sendSysEx(encodeReadRequest(unitId)[0]).catch((error) => finish(error));
    }));
  }

  writePatch(patch: Gt1Patch, unitId: number, destination?: Gt1PatchDestination): Promise<void> {
    return this.enqueue(async () => {
      const frames = encodePatchWrite(patch, unitId, destination);
      for (let index = 0; index < frames.length; index += 1) {
        await this.transport.sendSysEx(frames[index]);
        if (index < frames.length - 1) await new Promise((resolve) => setTimeout(resolve, PATCH_WRITE_GAP_MS));
      }
    });
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
}
