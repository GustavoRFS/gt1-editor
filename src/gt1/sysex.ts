import { calculateFrameChecksum, hasValidFrameChecksum } from './checksum';
import { parameterDefinitions, updatePatchParameter, updatePatchName } from './parameterMap';
import { addressToRolandInteger, decodeSystemSettingValue, getGt1SystemSetting, gt1SystemMemoryBlocks, gt1SystemSettingDefinitions } from './systemSettings';
import { Gt1Patch, Gt1PatchDestination, Gt1ProtocolError } from './types';
import type { Gt1PartialSystemSettings, Gt1SystemSettingId } from './systemSettings';

const ROLAND_MANUFACTURER_ID = 0x41;
const GT1_MODEL_LSB = 0x60;
const GT1_READ_MODEL_ID = [0x00, 0x00, 0x00, 0x30] as const;
const REQUEST_DATA_SIZE = [0x00, 0x00, 0x08, 0x00] as const;
const PATCH_REPLY_SIZE = 2316;
const GT1_PATCH_REPLY_FRAME_COUNT = 10;
const GT1_PATCH_REPLY_FRAME_DATA_LENGTH = 241;
const DATA_BLOCK_SIZE = 128;
const BLOCK_COUNT = 17;
const HEADER_SIZE = 11;
export const GT1_USER_PATCH_COUNT = 99;
const GT1_PATCH_WRITE_RANGES: ReadonlyArray<readonly [number, number, number]> = [
  [0x00, 0x00, 64], [0x00, 0x50, 48], [0x01, 0x00, 64], [0x01, 0x40, 64],
  [0x02, 0x00, 65], [0x02, 0x41, 63], [0x03, 0x00, 64], [0x03, 0x40, 64],
  [0x04, 0x00, 64], [0x04, 0x41, 63], [0x05, 0x01, 63], [0x05, 0x40, 64],
  [0x06, 0x00, 64], [0x06, 0x40, 64], [0x07, 0x00, 64], [0x07, 0x40, 64],
  [0x08, 0x00, 64], [0x08, 0x50, 48], [0x09, 0x10, 48], [0x09, 0x50, 48],
  [0x0a, 0x10, 33], [0x10, 0x10, 64], [0x10, 0x50, 48],
];

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

function encodeInternalFrameForGt1(frame: Uint8Array): Uint8Array {
  validateGt1Frame(frame);
  if (frame[3] !== 0x00 || frame[4] !== 0x00 || frame[5] !== GT1_MODEL_LSB) {
    throw new Gt1ProtocolError('invalid-sysex', 'O frame interno não tem o model ID esperado para a conversão da GT-1.');
  }

  const wireFrame = Uint8Array.from([
    ...frame.subarray(0, 5),
    0x00, 0x30, 0x12,
    ...frame.subarray(7),
  ]);
  wireFrame[wireFrame.length - 2] = checksumBytes(Array.from(wireFrame.subarray(8, wireFrame.length - 2)));
  return wireFrame;
}

export function encodeReadRequest(unitId: number): Uint8Array[] {
  return encodeReadRequestAt(unitId, [0x60, 0x00]);
}

export function encodeUserPatchReadRequest(unitId: number, userPatch: number): Uint8Array[] {
  if (!Number.isInteger(userPatch) || userPatch < 1 || userPatch > GT1_USER_PATCH_COUNT) {
    throw new Gt1ProtocolError('invalid-address', 'O destino de leitura precisa ser um patch de usuário entre U01 e U99.');
  }
  return encodeReadRequestAt(unitId, [0x10, userPatch - 1]);
}

/** Tone Studio fetches the 16-byte display name for each user slot before loading full patch data on demand. */
export function encodeUserPatchNameReadRequest(unitId: number, userPatch: number): Uint8Array {
  if (!Number.isInteger(userPatch) || userPatch < 1 || userPatch > GT1_USER_PATCH_COUNT) {
    throw new Gt1ProtocolError('invalid-address', 'O destino de leitura precisa ser um patch de usuário entre U01 e U99.');
  }
  assertUnitId(unitId);
  const address = [0x10, userPatch - 1, 0x00, 0x00];
  const size = [0x00, 0x00, 0x00, 0x10];
  const body = [...address, ...size];
  return Uint8Array.from([
    0xf0, ROLAND_MANUFACTURER_ID, unitId, ...GT1_READ_MODEL_ID, 0x11,
    ...body, checksumBytes(body), 0xf7,
  ]);
}

export function encodeSystemSettingsReadRequest(unitId: number, blockIndex: number): Uint8Array {
  assertUnitId(unitId);
  const block = gt1SystemMemoryBlocks[blockIndex];
  if (!block) throw new Gt1ProtocolError('invalid-address', `Bloco de configurações de sistema inválido: ${blockIndex}.`);
  const address = [...block.address];
  const size = [0x00, 0x00, 0x00, block.size];
  const body = [...address, ...size];
  return Uint8Array.from([
    0xf0, ROLAND_MANUFACTURER_ID, unitId, ...GT1_READ_MODEL_ID, 0x11,
    ...body, checksumBytes(body), 0xf7,
  ]);
}

export function encodeSystemSettingWrite(unitId: number, settingId: Gt1SystemSettingId, value: number): Uint8Array {
  assertUnitId(unitId);
  const definition = getGt1SystemSetting(settingId);
  if (!Number.isInteger(value)
    || value < definition.min
    || value > definition.max
    || (value - definition.min) % definition.step !== 0
    || (definition.options && !definition.options.some((option) => option.value === value))) {
    throw new Gt1ProtocolError('invalid-address', `O valor não é suportado para ${definition.label}.`);
  }
  const rawValue = value / definition.step;
  const data = definition.width === 1
    ? [rawValue]
    : [Math.floor(rawValue / 128), rawValue % 128];
  return encodeInternalFrameForGt1(buildFrame(unitId, [...definition.address], data));
}

export function decodeSystemSettingsBlock(
  response: Uint8Array,
  blockIndex: number,
  previous: Gt1PartialSystemSettings = {},
): Gt1PartialSystemSettings {
  const block = gt1SystemMemoryBlocks[blockIndex];
  if (!block) throw new Gt1ProtocolError('invalid-address', `Bloco de configurações de sistema inválido: ${blockIndex}.`);
  validateGt1WireFrame(response);
  if (response.length !== 12 + block.size + 2) {
    throw new Gt1ProtocolError('incomplete-patch', `A resposta do bloco de sistema ${blockIndex + 1} está incompleta.`);
  }
  const responseAddress = Array.from(response.subarray(8, 12));
  if (!responseAddress.every((byte, index) => byte === block.address[index])) {
    throw new Gt1ProtocolError('invalid-address', `A resposta da GT-1 veio de outro bloco de sistema (${blockIndex + 1}).`);
  }
  const data = response.subarray(12, response.length - 2);
  const blockStart = addressToRolandInteger(block.address);
  const decoded: Gt1PartialSystemSettings = { ...previous };
  for (const definition of gt1SystemSettingDefinitions) {
    const offset = addressToRolandInteger(definition.address) - blockStart;
    if (offset < 0 || offset + definition.width > data.length) continue;
    const value = decodeSystemSettingValue(data, offset, definition);
    if (value !== undefined) decoded[definition.id] = value;
  }
  return decoded;
}

function encodeReadRequestAt(unitId: number, addressPrefix: readonly [number, number]): Uint8Array[] {
  assertUnitId(unitId);
  return [0x00, 0x08, 0x10].map((page) => {
    const requestData = [...addressPrefix, page, 0x00, ...REQUEST_DATA_SIZE];
    const bytes = [0xf0, ROLAND_MANUFACTURER_ID, unitId, ...GT1_READ_MODEL_ID, 0x11, ...requestData];
    bytes.push(checksumBytes(requestData), 0xf7);
    return Uint8Array.from(bytes);
  });
}

export function encodeEditorCommunicationLevelRequest(unitId: number): Uint8Array {
  assertUnitId(unitId);
  const requestData = [0x7f, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01];
  return Uint8Array.from([
    0xf0, ROLAND_MANUFACTURER_ID, unitId, ...GT1_READ_MODEL_ID, 0x11,
    ...requestData, checksumBytes(requestData), 0xf7,
  ]);
}

export function encodeEditorCommunicationModeWrite(unitId: number, enabled: boolean): Uint8Array {
  assertUnitId(unitId);
  const frame = buildFrame(unitId, [0x7f, 0x00, 0x00, 0x01], [enabled ? 0x01 : 0x00]);
  return encodeInternalFrameForGt1(frame);
}

export function encodeProgramChange(userPatch: number, channel = 1): Uint8Array {
  if (!Number.isInteger(userPatch) || userPatch < 1 || userPatch > GT1_USER_PATCH_COUNT) {
    throw new Gt1ProtocolError('invalid-address', 'O destino precisa ser um patch de usuário entre U01 e U99.');
  }
  if (!Number.isInteger(channel) || channel < 1 || channel > 16) {
    throw new Gt1ProtocolError('invalid-address', 'O canal MIDI precisa estar entre 1 e 16.');
  }
  return Uint8Array.of(0xc0 | (channel - 1), userPatch - 1);
}

/** Tone Studio selects a stored patch by writing setup.current_patch_no. */
export function encodePatchSelectionWrite(unitId: number, userPatch: number): Uint8Array {
  if (!Number.isInteger(userPatch) || userPatch < 1 || userPatch > GT1_USER_PATCH_COUNT) {
    throw new Gt1ProtocolError('invalid-address', 'O destino precisa ser um patch de usuário entre U01 e U99.');
  }
  assertUnitId(unitId);
  const patchIndex = userPatch - 1;
  return encodeInternalFrameForGt1(buildFrame(unitId, [0x00, 0x01, 0x00, 0x00], [Math.floor(patchIndex / 128), patchIndex % 128]));
}

export function encodePatchNameWrite(unitId: number, name: string): Uint8Array {
  assertUnitId(unitId);
  const sanitized = Array.from(name.slice(0, 16), (character) => {
    const code = character.codePointAt(0) ?? 0x20;
    return code >= 0x20 && code <= 0x7e ? code : 0x20;
  });
  while (sanitized.length < 16) sanitized.push(0x20);
  return encodeInternalFrameForGt1(buildFrame(unitId, [0x60, 0x00, 0x00, 0x00], sanitized));
}

export function encodeIdentityRequest(unitId: number): Uint8Array[] {
  assertUnitId(unitId);
  return [Uint8Array.from([0xf0, 0x7e, unitId, 0x06, 0x01, 0xf7])];
}

export function isGt1IdentityReply(message: Uint8Array): boolean {
  return message.length >= 15
    && message[0] === 0xf0
    && message[1] === 0x7e
    && message[3] === 0x06
    && message[4] === 0x02
    && message[5] === ROLAND_MANUFACTURER_ID
    && message[6] === 0x30
    && message[7] === 0x03
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

function decodeCompactPatchReply(reply: Uint8Array, expectedAddress: readonly [number, number]): Uint8Array[] {
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
  if (reply[8] !== expectedAddress[0] || reply[9] !== expectedAddress[1]) {
    throw new Gt1ProtocolError('invalid-address', 'A resposta da GT-1 veio de outro endereço de patch.');
  }
  const addressPrefix = [reply[8], reply[9]];
  const unitId = reply[2];
  assertUnitId(unitId);
  return sourceRanges.map((ranges, block) => {
    const payload = ranges.flatMap(([start, length]) => Array.from(reply.subarray(start, start + length)));
    if (payload.length !== DATA_BLOCK_SIZE) throw new Gt1ProtocolError('malformed-file', `Bloco ${block} da resposta compactada está incompleto.`);
    return buildFrame(unitId, [...addressPrefix, block, 0], payload);
  });
}

function validateGt1CompactReplyFrame(frame: Uint8Array, index: number, expectedAddress: readonly [number, number]): void {
  const dataLength = index < GT1_PATCH_REPLY_FRAME_COUNT - 1 ? GT1_PATCH_REPLY_FRAME_DATA_LENGTH : 7;
  const expectedLength = 12 + dataLength + 2;
  const address = index * GT1_PATCH_REPLY_FRAME_DATA_LENGTH;

  if (frame.length !== expectedLength || frame[0] !== 0xf0 || frame[frame.length - 1] !== 0xf7) {
    throw new Gt1ProtocolError('malformed-file', `O frame ${index + 1} da resposta da GT-1 está incompleto.`);
  }
  if (frame[1] !== ROLAND_MANUFACTURER_ID
    || frame[3] !== 0x00 || frame[4] !== 0x00 || frame[5] !== 0x00 || frame[6] !== 0x30
    || frame[7] !== 0x12) {
    throw new Gt1ProtocolError('invalid-sysex', `O cabeçalho do frame ${index + 1} da GT-1 não confere.`);
  }
  if (frame[8] !== expectedAddress[0] || frame[9] !== expectedAddress[1]
    || frame[10] !== Math.floor(address / 128) || frame[11] !== address % 128) {
    throw new Gt1ProtocolError('invalid-address', `O endereço do frame ${index + 1} da GT-1 não confere.`);
  }
  if (frame.some((byte, byteIndex) => byteIndex > 0 && byteIndex < frame.length - 1 && byte > 0x7f)) {
    throw new Gt1ProtocolError('invalid-sysex', `O frame ${index + 1} da GT-1 contém um byte fora da faixa MIDI de 7 bits.`);
  }
  if (frame[frame.length - 2] !== checksumBytes(Array.from(frame.subarray(8, frame.length - 2)))) {
    throw new Gt1ProtocolError('invalid-checksum', `O checksum do frame ${index + 1} da GT-1 não confere.`);
  }
}

function decodeGt1CompactReplyFrames(frames: Uint8Array[], expectedAddress: readonly [number, number]): Gt1Patch {
  if (frames.length !== GT1_PATCH_REPLY_FRAME_COUNT
    || frames.reduce((sum, frame) => sum + frame.length, 0) !== PATCH_REPLY_SIZE) {
    throw new Gt1ProtocolError('incomplete-patch', 'A resposta da GT-1 não contém os dez frames completos do buffer.');
  }

  const payload = new Uint8Array(BLOCK_COUNT * DATA_BLOCK_SIZE);
  let offset = 0;
  frames.forEach((frame, index) => {
    validateGt1CompactReplyFrame(frame, index, expectedAddress);
    if (index > 0 && frame[2] !== frames[0][2]) {
      throw new Gt1ProtocolError('invalid-unit-id', 'Os frames recebidos vieram de Device IDs diferentes.');
    }
    const data = frame.subarray(12, frame.length - 2);
    payload.set(data, offset);
    offset += data.length;
  });
  if (offset !== payload.length) throw new Gt1ProtocolError('incomplete-patch', 'Os frames da GT-1 não contêm os 17 blocos de dados completos.');

  const unitId = frames[0]?.[2] ?? 0;
  const patchFrames = Array.from({ length: BLOCK_COUNT }, (_, block) => buildFrame(
    unitId,
    [...expectedAddress, block, 0],
    payload.subarray(block * DATA_BLOCK_SIZE, (block + 1) * DATA_BLOCK_SIZE),
  ));
  return createPatch(patchFrames, 'device', 'current-patch');
}

export function validateGt1WireFrame(frame: Uint8Array): void {
  if (frame.length < 14 || frame[0] !== 0xf0 || frame[frame.length - 1] !== 0xf7) {
    throw new Gt1ProtocolError('invalid-sysex', 'A resposta precisa ser um frame DT1 completo da GT-1.');
  }
  if (frame[1] !== ROLAND_MANUFACTURER_ID
    || frame[3] !== 0x00 || frame[4] !== 0x00 || frame[5] !== 0x00 || frame[6] !== 0x30
    || frame[7] !== 0x12) {
    throw new Gt1ProtocolError('invalid-sysex', 'A resposta não tem o model ID/comando DT1 esperado da GT-1.');
  }
  if (frame.some((byte, index) => index > 0 && index < frame.length - 1 && byte > 0x7f)) {
    throw new Gt1ProtocolError('invalid-sysex', 'O corpo da resposta SysEx contém um byte fora da faixa MIDI de 7 bits.');
  }
  if (frame[frame.length - 2] !== checksumBytes(Array.from(frame.subarray(8, frame.length - 2)))) {
    throw new Gt1ProtocolError('invalid-checksum', 'O checksum Roland da resposta SysEx não confere.');
  }
  assertUnitId(frame[2]);
}

/** Decode address-bearing DT1 data returned by the three Tone Studio RQ1 reads. */
export function decodeAddressedPatchResponse(
  frames: Uint8Array[],
  expectedAddress: readonly [number, number],
): Gt1Patch {
  if (frames.length === 0) throw new Gt1ProtocolError('incomplete-patch', 'A pedaleira não retornou dados do patch.');
  const payload = new Uint8Array(BLOCK_COUNT * DATA_BLOCK_SIZE);
  const first = frames[0];
  const unitId = first[2];

  for (const frame of frames) {
    validateGt1WireFrame(frame);
    if (frame[2] !== unitId) throw new Gt1ProtocolError('invalid-unit-id', 'Os frames recebidos vieram de Device IDs diferentes.');
    if (frame[8] !== expectedAddress[0] || frame[9] !== expectedAddress[1]) {
      throw new Gt1ProtocolError('invalid-address', 'A resposta da GT-1 veio de outro patch.');
    }

    let page = frame[10];
    let offset = frame[11];
    for (const value of frame.subarray(12, frame.length - 2)) {
      if (page < BLOCK_COUNT && offset < DATA_BLOCK_SIZE) payload[page * DATA_BLOCK_SIZE + offset] = value;
      offset += 1;
      if (offset === DATA_BLOCK_SIZE) {
        offset = 0;
        page += 1;
      }
    }
  }

  const patchFrames = Array.from({ length: BLOCK_COUNT }, (_, block) => buildFrame(
    unitId,
    [...expectedAddress, block, 0],
    payload.subarray(block * DATA_BLOCK_SIZE, (block + 1) * DATA_BLOCK_SIZE),
  ));
  return createPatch(patchFrames, 'device', 'current-patch');
}

export function decodePatchResponse(frames: Uint8Array[], expectedAddress: readonly [number, number] = [0x60, 0x00]): Gt1Patch {
  if (frames.length === 1 && frames[0].length === PATCH_REPLY_SIZE) {
    return createPatch(decodeCompactPatchReply(frames[0], expectedAddress), 'device', 'current-patch');
  }
  if (frames.length === GT1_PATCH_REPLY_FRAME_COUNT) {
    return decodeGt1CompactReplyFrames(frames, expectedAddress);
  }
  if (frames.length === 0) throw new Gt1ProtocolError('incomplete-patch', 'A pedaleira não retornou dados do patch.');
  for (const [index, frame] of frames.entries()) {
    if (frame[7] !== expectedAddress[0] || frame[8] !== expectedAddress[1] || frame[9] !== index || frame[10] !== 0) {
      throw new Gt1ProtocolError('invalid-address', 'A resposta da GT-1 veio de outro endereço de patch.');
    }
  }
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
  if (destination) {
    if (!Number.isInteger(destination.userPatch) || destination.userPatch < 1 || destination.userPatch > GT1_USER_PATCH_COUNT) {
      throw new Gt1ProtocolError('invalid-address', 'O destino precisa ser um patch de usuário entre U01 e U99.');
    }
  }

  // Tone Studio writes mapped portions of the temporary buffer and then uses
  // a separate command to persist the current buffer to a user slot. The last
  // mapped range (11 00, 64 bytes) is outside the editor's 17-block model.
  const frames = GT1_PATCH_WRITE_RANGES.map(([page, offset, size]) => {
    const source = patch.frames[page];
    validateGt1Frame(source);
    const data = source.subarray(HEADER_SIZE + offset, HEADER_SIZE + offset + size);
    if (data.length !== size) throw new Gt1ProtocolError('incomplete-patch', `O bloco ${page} não contém os ${size} bytes necessários para a gravação.`);
    return encodeInternalFrameForGt1(buildFrame(unitId, [0x60, 0x00, page, offset], data));
  });

  if (destination) {
    const slot = destination.userPatch - 1;
    const command = buildFrame(unitId, [0x7f, 0x00, 0x01, 0x04], [Math.floor(slot / 128), slot % 128]);
    frames.push(encodeInternalFrameForGt1(command));
  }
  return frames;
}

export function patchContentsEqual(left: Gt1Patch, right: Gt1Patch): boolean {
  if (!left.complete || !right.complete || left.frames.length !== BLOCK_COUNT || right.frames.length !== BLOCK_COUNT) return false;
  return GT1_PATCH_WRITE_RANGES.every(([page, offset, size]) => {
    const frame = left.frames[page];
    const other = right.frames[page];
    if (!frame || !other || frame[9] !== page || other[9] !== page) return false;
    for (let index = 0; index < size; index += 1) {
      if (frame[HEADER_SIZE + offset + index] !== other[HEADER_SIZE + offset + index]) return false;
    }
    return true;
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
  return encodeInternalFrameForGt1(buildFrame(unitId, [0x60, 0x00, block, offset], [value]));
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
