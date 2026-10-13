import { calculateFrameChecksum, hasValidFrameChecksum, refreshFrameChecksum } from './checksum';
import { parameterDefinitions, updatePatchParameter, updatePatchName } from './parameterMap';
import { Gt1Patch, Gt1PatchDestination, Gt1ProtocolError } from './types';

const ROLAND_MANUFACTURER_ID = 0x41;
const GT1_MODEL_LSB = 0x60;
const REQUEST_DATA_SIZE = [0x00, 0x00, 0x12, 0x17] as const;
const PATCH_REPLY_SIZE = 2316;
const DATA_BLOCK_SIZE = 128;
const BLOCK_COUNT = 17;
const HEADER_SIZE = 11;

function assertUnitId(unitId: number): void {
  if (!Number.isInteger(unitId) || unitId < 0 || unitId > 0x1f) {
    throw new Gt1ProtocolError('invalid-unit-id', 'O Device ID da GT-1 precisa estar entre 00 e 1F.');
  }
}

function checksumBytes(bytes: number[]): number {
  return (128 - (bytes.reduce((sum, byte) => sum + byte, 0) % 128)) % 128;
}

function buildFrame(unitId: number, address: number[], data: ArrayLike<number>): Uint8Array {
  const bytes = [0xf0, ROLAND_MANUFACTURER_ID, unitId, 0x00, 0x00, GT1_MODEL_LSB, 0x12, ...address, ...Array.from(data)];
  bytes.push(checksumBytes(bytes.slice(7)), 0xf7);
  return Uint8Array.from(bytes);
}

export function encodeReadRequest(unitId: number): Uint8Array[] {
  assertUnitId(unitId);
  const bytes = [0xf0, ROLAND_MANUFACTURER_ID, unitId, 0x00, 0x00, GT1_MODEL_LSB, 0x11, 0x60, 0x00, 0x00, 0x00, ...REQUEST_DATA_SIZE];
  bytes.push(checksumBytes(bytes.slice(7)), 0xf7);
  return [Uint8Array.from(bytes)];
}

export function encodeIdentityRequest(unitId: number): Uint8Array[] {
  assertUnitId(unitId);
  return [Uint8Array.from([0xf0, 0x7e, unitId, 0x06, 0x01, 0xf7])];
}

export function isGt1IdentityReply(message: Uint8Array): boolean {
  return message.length >= 7
    && message[0] === 0xf0
    && message[1] === 0x7e
    && message[3] === 0x06
    && message[4] === 0x02
    && message[5] === ROLAND_MANUFACTURER_ID
    && message[6] === 0x33
    && message[message.length - 1] === 0xf7;
}

export function validateGt1Frame(frame: Uint8Array): void {
  if (frame.length < 13 || frame[0] !== 0xf0 || frame[frame.length - 1] !== 0xf7) {
    throw new Gt1ProtocolError('invalid-sysex', 'A mensagem precisa ser um frame SysEx completo.');
  }
  if (frame[1] !== ROLAND_MANUFACTURER_ID || frame[6] !== 0x12) {
    throw new Gt1ProtocolError('invalid-sysex', 'O frame não tem o fabricante/comando DT1 esperado da GT-1.');
  }
  if (frame.some((byte, index) => index > 0 && index < frame.length - 1 && byte > 0x7f)) {
    throw new Gt1ProtocolError('invalid-sysex', 'O corpo de um frame SysEx contém um byte fora da faixa MIDI de 7 bits.');
  }
  if (!hasValidFrameChecksum(frame)) {
    throw new Gt1ProtocolError('invalid-checksum', 'O checksum Roland do frame SysEx não confere.');
  }
}

function patchNameFromFrames(frames: Uint8Array[]): string {
  const first = frames.find((frame) => frame[9] === 0 && frame[10] === 0);
  if (!first || first.length < HEADER_SIZE + 16 + 2) return 'Patch sem nome';
  return String.fromCharCode(...first.subarray(HEADER_SIZE, HEADER_SIZE + 16)).replace(/[\x00-\x1f\x7f]/g, ' ').trimEnd() || 'Sem nome';
}

function createPatch(frames: Uint8Array[], sourceFormat: Gt1Patch['sourceFormat'], id: string, sourceName?: string): Gt1Patch {
  for (const frame of frames) validateGt1Frame(frame);
  const ordered = frames.map((frame) => new Uint8Array(frame)).sort((left, right) => (left[9] - right[9]) || (left[10] - right[10]));
  const uniqueAddresses = new Set(ordered.map((frame) => `${frame[7]}:${frame[8]}:${frame[9]}:${frame[10]}`));
  if (uniqueAddresses.size !== ordered.length) throw new Gt1ProtocolError('invalid-address', 'O patch contém mais de um frame para o mesmo endereço.');
  const firstFrame = ordered[0];
  const unitId = firstFrame?.[2] ?? 0;
  if (unitId > 0x1f) throw new Gt1ProtocolError('invalid-unit-id', 'O Device ID retornado está fora da faixa da GT-1.');
  const complete = ordered.length === BLOCK_COUNT && ordered.every((frame, index) => frame[9] === index && frame[10] === 0 && frame.length === HEADER_SIZE + DATA_BLOCK_SIZE + 2);
  return { id, name: patchNameFromFrames(ordered), frames: ordered, sourceFormat, sourceName, complete };
}

function decodeCompactPatchReply(reply: Uint8Array): Uint8Array[] {
  if (reply.length !== PATCH_REPLY_SIZE || reply[0] !== 0xf0 || reply[1] !== ROLAND_MANUFACTURER_ID || reply[reply.length - 1] !== 0xf7) {
    throw new Gt1ProtocolError('malformed-file', `A resposta compactada precisa ter ${PATCH_REPLY_SIZE} bytes e enquadramento SysEx completo.`);
  }

  // Source data ranges from FxFloorBoard bankTreeList::updatePatch, reblocked
  // as the 17 128-byte DT1 data areas used by the editor's patch files.
  const sourceRanges: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
    [[12, 128]], [[140, 113], [267, 15]], [[282, 128]], [[410, 98], [522, 30]],
    [[552, 128]], [[680, 83], [777, 45]], [[822, 128]], [[950, 68], [1032, 60]],
    [[1092, 128]], [[1220, 53], [1287, 75]], [[1362, 128]], [[1490, 39], [1542, 89]],
    [[1631, 128]], [[1759, 24], [1797, 104]], [[1901, 128]], [[2029, 9], [2052, 119]],
    [[2172, 121], [2307, 7]],
  ];
  const addressPrefix = [reply[8], reply[9]];
  const unitId = reply[2];
  assertUnitId(unitId);
  return sourceRanges.map((ranges, block) => {
    const payload = ranges.flatMap(([start, length]) => Array.from(reply.subarray(start, start + length)));
    if (payload.length !== DATA_BLOCK_SIZE) throw new Gt1ProtocolError('malformed-file', `Bloco ${block} da resposta compactada está incompleto.`);
    return buildFrame(unitId, [...addressPrefix, block, 0], payload);
  });
}

export function decodePatchResponse(frames: Uint8Array[]): Gt1Patch {
  if (frames.length === 1 && frames[0].length === PATCH_REPLY_SIZE) {
    return createPatch(decodeCompactPatchReply(frames[0]), 'device', 'current-patch');
  }
  if (frames.length === 0) throw new Gt1ProtocolError('incomplete-patch', 'A pedaleira não retornou dados do patch.');
  return createPatch(frames, 'device', 'current-patch');
}

export function encodePatchWrite(
  patch: Gt1Patch,
  unitId: number,
  destination?: Gt1PatchDestination,
): Uint8Array[] {
  assertUnitId(unitId);
  if (!patch.complete || patch.frames.length !== BLOCK_COUNT) {
    throw new Gt1ProtocolError('incomplete-patch', 'A escrita na pedaleira exige os 17 blocos completos do patch.');
  }
  let destinationAddress = [0x60, 0x00];
  if (destination) {
    if (!Number.isInteger(destination.bank) || destination.bank < 1 || destination.bank > 50 || !Number.isInteger(destination.patch) || destination.patch < 1 || destination.patch > 5) {
      throw new Gt1ProtocolError('invalid-address', 'O destino precisa ser um patch de usuário entre U01-1 e U50-5.');
    }
    const patchOffset = (destination.bank - 1) * 5 + (destination.patch - 1);
    destinationAddress = [0x10 + Math.floor(patchOffset / 0x80), patchOffset % 0x80];
  }
  return patch.frames.map((source) => {
    validateGt1Frame(source);
    const frame = new Uint8Array(source);
    frame[2] = unitId;
    frame[7] = destinationAddress[0];
    frame[8] = destinationAddress[1];
    return refreshFrameChecksum(frame);
  });
}

export function encodeParameterWrite(unitId: number, parameterId: string, value: number): Uint8Array {
  assertUnitId(unitId);
  const parameter = parameterDefinitions.find((candidate) => candidate.id === parameterId);
  if (!parameter || !Number.isInteger(value) || value < parameter.min || value > parameter.max) {
    throw new Gt1ProtocolError('invalid-address', `O parâmetro ${parameterId} ou seu valor não é suportado.`);
  }
  const block = Math.floor(parameter.offset / DATA_BLOCK_SIZE);
  const offset = parameter.offset % DATA_BLOCK_SIZE;
  return buildFrame(unitId, [0x60, 0x00, block, offset], [value]);
}

export function setParameterLocally(patch: Gt1Patch, parameterId: string, value: number): Gt1Patch {
  return updatePatchParameter(patch, parameterId, value);
}

export function setPatchNameLocally(patch: Gt1Patch, name: string): Gt1Patch {
  return updatePatchName(patch, name);
}

export function checksumForProtocolFrame(frame: Uint8Array): number {
  return calculateFrameChecksum(frame);
}
