import { rolandChecksum } from '../gt1/checksum';
import { decodePatchResponse } from '../gt1/sysex';
import type { Gt1Patch } from '../gt1/types';
import { gt1ParameterAddresses } from './gt1ParameterAddresses';
import type { ToneCentralPatch } from './api';

const PATCH_DATA_LENGTH = 17 * 128;

function compact(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function frame(payload: Uint8Array, block: number): Uint8Array {
  const message = [0xf0, 0x41, 0x00, 0x00, 0x00, 0x60, 0x12, 0x60, 0x00, block, 0x00, ...payload];
  return Uint8Array.from([...message, rolandChecksum(message.slice(7)), 0xf7]);
}

function safePatchName(name: string): string {
  return Array.from(name.slice(0, 16), (character) => {
    const code = character.codePointAt(0) ?? 0x20;
    return code >= 0x20 && code <= 0x7e ? code : 0x20;
  }).map((code) => String.fromCharCode(code)).join('').trimEnd() || 'Tone Central';
}

export function convertToneCentralPatch(source: ToneCentralPatch, id: string, sourceName: string): Gt1Patch {
  const payload = new Uint8Array(PATCH_DATA_LENGTH);
  const params = source.params && typeof source.params === 'object' ? source.params : {};
  for (const [key, rawValue] of Object.entries(params)) {
    const numericValue = typeof rawValue === 'number' ? rawValue : typeof rawValue === 'string' && rawValue.trim() ? Number(rawValue) : NaN;
    if (!Number.isFinite(numericValue)) continue;
    const normalizedKey = compact(key);
    const offset = gt1ParameterAddresses[normalizedKey];
    if (offset === undefined || offset < 0 || offset >= payload.length) continue;
    payload[offset] = Math.max(0, Math.min(127, Math.trunc(numericValue)));
  }

  const patchName = safePatchName(source.name || 'Tone Central');
  for (let index = 0; index < 16; index += 1) payload[index] = patchName.charCodeAt(index) || 0x20;
  const frames = Array.from({ length: 17 }, (_, block) => frame(payload.subarray(block * 128, (block + 1) * 128), block));
  const decoded = decodePatchResponse(frames);
  return { ...decoded, id, name: patchName, sourceFormat: 'syx', sourceName, complete: true };
}
