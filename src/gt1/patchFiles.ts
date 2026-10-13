import { rolandChecksum } from './checksum';
import { decodePatchResponse, validateGt1Frame } from './sysex';
import { Gt1Patch, Gt1ProtocolError } from './types';

const GCL_SIGNATURE = 'GCLLibrarianFile0001';
const GCL_HEADER_LENGTH = 160;
const GCL_RECORD_LENGTH = 2194;
const GCL_RECORD_PREFIX = Uint8Array.from([0, 0, 0, 0, 0x08, 0x8e, 0, 0, 0, 1, 0x08, 0x82]);
const GCL_DATA_LENGTH = 16 * 128 + 60;
const GCL_RECORD_SUFFIX_LENGTH = 74;

function bytesToAscii(bytes: ArrayLike<number>): string {
  return String.fromCharCode(...Array.from(bytes));
}

function parseSysexStream(bytes: Uint8Array): Uint8Array[] {
  const messages: Uint8Array[] = [];
  let start = -1;
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] === 0xf0) {
      if (start !== -1) throw new Gt1ProtocolError('malformed-file', 'Foi encontrado F0 antes do término do frame SysEx anterior.');
      start = index;
    } else if (bytes[index] === 0xf7 && start !== -1) {
      const frame = bytes.slice(start, index + 1);
      validateGt1Frame(frame);
      if (frame[7] !== 0x60) throw new Gt1ProtocolError('unsupported-format', 'O arquivo SysEx não contém dados de patch GT-1 no buffer temporário.');
      messages.push(frame);
      start = -1;
    } else if (start === -1 && bytes[index] !== 0x00 && bytes[index] !== 0x20 && bytes[index] !== 0x0a && bytes[index] !== 0x0d) {
      throw new Gt1ProtocolError('malformed-file', `Byte fora de uma mensagem SysEx no offset ${index}.`);
    }
  }
  if (start !== -1) throw new Gt1ProtocolError('malformed-file', 'O arquivo termina antes de fechar a mensagem SysEx com F7.');
  if (messages.length === 0) throw new Gt1ProtocolError('malformed-file', 'Nenhuma mensagem SysEx da GT-1 foi encontrada.');
  return messages;
}

function readUint16(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (((bytes[offset] ?? 0) * 0x1000000) + ((bytes[offset + 1] ?? 0) << 16) + ((bytes[offset + 2] ?? 0) << 8) + (bytes[offset + 3] ?? 0)) >>> 0;
}

function readVariableLength(bytes: Uint8Array, cursor: { value: number }, end: number): number {
  let value = 0;
  let count = 0;
  while (cursor.value < end && count < 4) {
    const byte = bytes[cursor.value++];
    value = (value << 7) | (byte & 0x7f);
    count += 1;
    if ((byte & 0x80) === 0) return value;
  }
  throw new Gt1ProtocolError('malformed-file', 'Comprimento variável MIDI inválido ou truncado.');
}

function encodeVariableLength(value: number): number[] {
  const result = [value & 0x7f];
  while ((value >>= 7) > 0) result.unshift((value & 0x7f) | 0x80);
  return result;
}

function parseMidi(bytes: Uint8Array): Uint8Array[] {
  if (bytes.length < 14 || bytesToAscii(bytes.subarray(0, 4)) !== 'MThd') {
    throw new Gt1ProtocolError('malformed-file', 'O arquivo MID não tem um cabeçalho SMF MThd.');
  }
  const headerLength = readUint32(bytes, 4);
  if (headerLength < 6 || 8 + headerLength > bytes.length) throw new Gt1ProtocolError('malformed-file', 'Cabeçalho SMF inválido.');
  const trackCount = readUint16(bytes, 10);
  if (trackCount < 1) throw new Gt1ProtocolError('malformed-file', 'O arquivo SMF não contém trilhas.');
  const sysex: Uint8Array[] = [];
  let offset = 8 + headerLength;
  let pending: number[] | undefined;

  for (let trackIndex = 0; trackIndex < trackCount; trackIndex += 1) {
    if (offset + 8 > bytes.length || bytesToAscii(bytes.subarray(offset, offset + 4)) !== 'MTrk') {
      throw new Gt1ProtocolError('malformed-file', `Trilha SMF ${trackIndex + 1} ausente ou truncada.`);
    }
    const trackLength = readUint32(bytes, offset + 4);
    const trackStart = offset + 8;
    const trackEnd = trackStart + trackLength;
    if (trackEnd > bytes.length) throw new Gt1ProtocolError('malformed-file', `Trilha SMF ${trackIndex + 1} excede o tamanho do arquivo.`);
    const cursor = { value: trackStart };
    let runningStatus = 0;
    while (cursor.value < trackEnd) {
      readVariableLength(bytes, cursor, trackEnd);
      let status = bytes[cursor.value];
      if (status === undefined) throw new Gt1ProtocolError('malformed-file', 'Evento MIDI sem status.');
      if (status & 0x80) {
        cursor.value += 1;
        if (status < 0xf0) runningStatus = status;
      } else {
        if (runningStatus === 0) throw new Gt1ProtocolError('malformed-file', 'Evento MIDI sem status corrente.');
        status = runningStatus;
      }

      if (status === 0xf0 || status === 0xf7) {
        const length = readVariableLength(bytes, cursor, trackEnd);
        if (cursor.value + length > trackEnd) throw new Gt1ProtocolError('malformed-file', 'Evento SysEx MIDI truncado.');
        const payload = Array.from(bytes.subarray(cursor.value, cursor.value + length));
        cursor.value += length;
        if (status === 0xf0) {
          if (pending) throw new Gt1ProtocolError('malformed-file', 'Evento SysEx anterior não foi encerrado.');
          pending = [0xf0, ...payload];
        } else if (pending) {
          pending.push(...payload);
        } else {
          throw new Gt1ProtocolError('malformed-file', 'Continuação SysEx sem evento F0 inicial.');
        }
        if (pending[pending.length - 1] === 0xf7) {
          const frame = Uint8Array.from(pending);
          validateGt1Frame(frame);
          if (frame[7] !== 0x60) throw new Gt1ProtocolError('unsupported-format', 'O MID não contém patch GT-1 no buffer temporário.');
          sysex.push(frame);
          pending = undefined;
        }
      } else if (status === 0xff) {
        cursor.value += 1;
        const length = readVariableLength(bytes, cursor, trackEnd);
        cursor.value += length;
      } else if (status === 0xf1 || status === 0xf3) {
        cursor.value += 1;
      } else if (status === 0xf2) {
        cursor.value += 2;
      } else if (status >= 0x80 && status <= 0xef) {
        cursor.value += (status & 0xe0) === 0xc0 ? 1 : 2;
      } else if (status !== 0xf6 && status !== 0xf8 && status !== 0xfa && status !== 0xfb && status !== 0xfc && status !== 0xfe) {
        throw new Gt1ProtocolError('malformed-file', `Status MIDI SMF 0x${status.toString(16)} não suportado.`);
      }
      if (cursor.value > trackEnd) throw new Gt1ProtocolError('malformed-file', 'Evento MIDI excede o limite da trilha.');
    }
    offset = trackEnd;
  }
  if (pending) throw new Gt1ProtocolError('malformed-file', 'O último evento SysEx MIDI não termina em F7.');
  if (sysex.length === 0) throw new Gt1ProtocolError('malformed-file', 'Nenhum patch GT-1 foi encontrado nas trilhas SMF.');
  return sysex;
}

function makeFrame(payload: Uint8Array, block: number): Uint8Array {
  const bytes = [0xf0, 0x41, 0x00, 0x00, 0x00, 0x60, 0x12, 0x60, 0x00, block, 0x00, ...Array.from(payload)];
  const checksum = rolandChecksum(bytes.slice(7));
  return Uint8Array.from([...bytes, checksum, 0xf7]);
}

function framesFromGclData(data: Uint8Array): Uint8Array[] {
  const frames: Uint8Array[] = [];
  for (let block = 0; block < 17; block += 1) {
    const length = block === 16 ? 60 : 128;
    const start = block * 128;
    frames.push(makeFrame(data.subarray(start, start + length), block));
  }
  return frames;
}

function parseGcl(bytes: Uint8Array, name: string): Gt1Patch[] {
  if (bytes.length < GCL_HEADER_LENGTH + GCL_RECORD_LENGTH || bytesToAscii(bytes.subarray(0, GCL_SIGNATURE.length)) !== GCL_SIGNATURE) {
    throw new Gt1ProtocolError('malformed-file', 'O arquivo GCL não tem o cabeçalho de biblioteca GT-1 esperado.');
  }
  const patchCount = readUint16(bytes, 34);
  if (patchCount < 1 || bytes.length < GCL_HEADER_LENGTH + patchCount * GCL_RECORD_LENGTH) {
    throw new Gt1ProtocolError('malformed-file', 'A contagem de patches GCL não confere com o tamanho do arquivo.');
  }
  const patches: Gt1Patch[] = [];
  for (let index = 0; index < patchCount; index += 1) {
    const recordStart = GCL_HEADER_LENGTH + index * GCL_RECORD_LENGTH;
    if (bytes[recordStart + 10] !== 0x08 || bytes[recordStart + 11] !== 0x82) {
      throw new Gt1ProtocolError('malformed-file', `O marcador de patch GCL ${index + 1} está inválido.`);
    }
    const payloadStart = recordStart + GCL_RECORD_PREFIX.length;
    const payload = bytes.slice(payloadStart, payloadStart + GCL_DATA_LENGTH);
    const frames = framesFromGclData(payload);
    const decoded = decodePatchResponse(frames);
    patches.push({ ...decoded, id: `${name}-${index + 1}`, sourceFormat: 'gcl', sourceName: name, complete: false });
  }
  return patches;
}

function splitPatchGroups(frames: Uint8Array[], name: string, sourceFormat: Gt1Patch['sourceFormat']): Gt1Patch[] {
  const groups: Uint8Array[][] = [];
  let current: Uint8Array[] = [];
  for (const frame of frames) {
    if (current.length > 0 && frame[9] === 0 && frame[10] === 0) {
      groups.push(current);
      current = [];
    }
    current.push(frame);
  }
  if (current.length > 0) groups.push(current);
  return groups.map((group, index) => {
    const decoded = decodePatchResponse(group);
    return { ...decoded, id: `${name}-${index + 1}`, sourceFormat, sourceName: name };
  });
}

export function parsePatchFile(name: string, bytes: Uint8Array): Gt1Patch[] {
  const extension = name.split('.').pop()?.toLowerCase();
  if (extension === 'gcl') return parseGcl(bytes, name);
  if (extension === 'mid' || extension === 'midi') return splitPatchGroups(parseMidi(bytes), name, 'mid');
  if (extension === 'syx') return splitPatchGroups(parseSysexStream(bytes), name, 'syx');
  throw new Gt1ProtocolError('unsupported-format', 'Formato de patch não suportado. Use .syx, .mid ou .gcl.');
}

function encodeMidi(patches: Gt1Patch[]): Uint8Array {
  const track: number[] = [];
  for (const patch of patches) {
    for (const frame of patch.frames) {
      validateGt1Frame(frame);
      track.push(0x00, 0xf0, ...encodeVariableLength(frame.length - 1), ...Array.from(frame.subarray(1)));
    }
  }
  track.push(0x00, 0xff, 0x2f, 0x00);
  const header = [0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0x01, 0x00, 0x60];
  const length = track.length;
  const trackHeader = [0x4d, 0x54, 0x72, 0x6b, (length >>> 24) & 0xff, (length >>> 16) & 0xff, (length >>> 8) & 0xff, length & 0xff];
  return Uint8Array.from([...header, ...trackHeader, ...track]);
}

function patchPayload(patch: Gt1Patch): Uint8Array {
  const result: number[] = [];
  for (const block of patch.frames) {
    validateGt1Frame(block);
    result.push(...Array.from(block.subarray(11, block.length - 2)));
  }
  return Uint8Array.from(result);
}

function encodeGcl(patches: Gt1Patch[]): Uint8Array {
  if (patches.length < 1 || patches.length > 255) throw new Gt1ProtocolError('unsupported-format', 'O GCL do FxFloorBoard armazena de 1 a 255 patches por arquivo.');
  const header = new Uint8Array(GCL_HEADER_LENGTH);
  header.set(new TextEncoder().encode(GCL_SIGNATURE), 0);
  header.fill(0x20, GCL_SIGNATURE.length, 34);
  header[34] = 0;
  header[35] = patches.length;
  const output: number[] = Array.from(header);
  for (const patch of patches) {
    const data = patchPayload(patch);
    if (data.length < GCL_DATA_LENGTH) throw new Gt1ProtocolError('incomplete-patch', `O patch ${patch.name} não tem os 2108 bytes exigidos pelo formato GCL.`);
    output.push(...GCL_RECORD_PREFIX, ...Array.from(data.subarray(0, GCL_DATA_LENGTH)), ...new Array(GCL_RECORD_SUFFIX_LENGTH).fill(0));
  }
  return Uint8Array.from(output);
}

export function serializePatchFile(format: 'syx' | 'mid' | 'gcl', patches: Gt1Patch[]): Uint8Array {
  if (patches.length === 0) throw new Gt1ProtocolError('incomplete-patch', 'Selecione ao menos um patch para exportar.');
  if (format === 'mid') return encodeMidi(patches);
  if (format === 'gcl') return encodeGcl(patches);
  return Uint8Array.from(patches.flatMap((patch) => patch.frames.flatMap((frame) => {
    validateGt1Frame(frame);
    return Array.from(frame);
  })));
}
