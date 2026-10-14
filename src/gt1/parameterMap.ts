import type { Gt1ParameterDefinition, Gt1Patch } from './types';
import { refreshFrameChecksum } from './checksum';

/**
 * Initial editor catalog transcribed from the named GT-1 fields in the
 * FxFloorBoard `midi.xml` map. Offsets address the temporary-buffer data blocks.
 */
export const parameterDefinitions: Gt1ParameterDefinition[] = [
  { id: 'comp-enabled', group: 'Compressor', label: 'Ligado', offset: 0x20, control: 'toggle', min: 0, max: 1, options: [{ value: 0, label: 'Desligado' }, { value: 1, label: 'Ligado' }] },
  { id: 'comp-type', group: 'Compressor', label: 'Tipo', offset: 0x21, control: 'select', min: 0, max: 6, options: [{ value: 0, label: 'Boss Comp' }, { value: 1, label: 'Hi-Band' }, { value: 2, label: 'Light' }, { value: 3, label: 'D-Comp' }, { value: 4, label: 'Orange' }, { value: 5, label: 'FAT' }, { value: 6, label: 'Mild' }] },
  { id: 'comp-value', group: 'Compressor', label: 'Compressor · 22', offset: 0x22, control: 'number', min: 0, max: 100 },
  { id: 'od-enabled', group: 'OD/DS', label: 'Ligado', offset: 0x30, control: 'toggle', min: 0, max: 1, options: [{ value: 0, label: 'Desligado' }, { value: 1, label: 'Ligado' }] },
  { id: 'od-type', group: 'OD/DS', label: 'Tipo', offset: 0x31, control: 'select', min: 0, max: 21, options: [{ value: 0, label: 'Mid Boost' }, { value: 1, label: 'Clean Boost' }, { value: 2, label: 'Treble Boost' }, { value: 3, label: 'Crunch' }, { value: 4, label: 'Natural OD' }, { value: 5, label: 'Warm OD' }, { value: 6, label: 'Fat DS' }, { value: 7, label: 'Lead DS' }, { value: 8, label: 'Metal DS' }, { value: 9, label: 'OCT Fuzz' }, { value: 10, label: 'A-Dist' }, { value: 11, label: 'Blues OD' }, { value: 12, label: 'OD-1' }, { value: 13, label: 'Tubescreamer' }, { value: 14, label: 'Turbo OD' }, { value: 15, label: 'Distortion' }, { value: 16, label: 'RAT' }, { value: 17, label: 'GuV DS' }, { value: 18, label: 'DST+' }, { value: 19, label: 'Metal Zone' }, { value: 20, label: "'60s Fuzz" }, { value: 21, label: 'Muff Fuzz' }] },
  { id: 'od-drive', group: 'OD/DS', label: 'Drive', offset: 0x32, control: 'number', min: 0, max: 120 },
  { id: 'od-bottom', group: 'OD/DS', label: 'Bottom', offset: 0x33, control: 'number', min: 0, max: 100 },
  { id: 'od-tone', group: 'OD/DS', label: 'Tone', offset: 0x34, control: 'number', min: 0, max: 100 },
  { id: 'od-effect-level', group: 'OD/DS', label: 'Effect level', offset: 0x37, control: 'number', min: 0, max: 100 },
  { id: 'od-direct-level', group: 'OD/DS', label: 'Direct level', offset: 0x38, control: 'number', min: 0, max: 100 },
  { id: 'preamp-a-enabled', group: 'Preamp A', label: 'Ligado', offset: 0x50, control: 'toggle', min: 0, max: 1, options: [{ value: 0, label: 'Desligado' }, { value: 1, label: 'Ligado' }] },
  { id: 'preamp-a-type', group: 'Preamp A', label: 'Tipo', offset: 0x51, control: 'select', min: 0, max: 26, options: [{ value: 0, label: 'Natural Clean' }, { value: 1, label: 'Full Range' }, { value: 2, label: 'Combo Crunch' }, { value: 3, label: 'Stack Crunch' }, { value: 4, label: 'HiGain Stack' }, { value: 5, label: 'Power Drive' }, { value: 6, label: 'Extreme Lead' }, { value: 7, label: 'Core Metal' }, { value: 8, label: 'JC-120' }, { value: 9, label: 'Clean Twin' }, { value: 10, label: 'Pro Crunch' }, { value: 11, label: 'Tweed' }, { value: 12, label: 'Deluxe Crunch' }, { value: 13, label: 'VO Drive' }, { value: 14, label: 'VO Lead' }, { value: 15, label: 'Match Drive' }, { value: 16, label: 'BG Lead' }, { value: 17, label: 'BG Drive' }, { value: 18, label: 'MS-1959 I' }, { value: 19, label: 'MS-1959 I+II' }, { value: 20, label: 'R-Fier Vintage' }, { value: 21, label: 'R-Fier Modern' }, { value: 22, label: 'T-Amp Lead' }, { value: 23, label: 'SLDN' }, { value: 24, label: '5150 Drive' }, { value: 25, label: 'Bogner Uber' }, { value: 26, label: 'Orange Rocker' }] },
  { id: 'preamp-a-gain', group: 'Preamp A', label: 'Gain', offset: 0x52, control: 'number', min: 0, max: 120 },
  { id: 'preamp-a-tcomp', group: 'Preamp A', label: 'T-Comp', offset: 0x53, control: 'number', min: 0, max: 100 },
  { id: 'preamp-a-bass', group: 'Preamp A', label: 'Bass', offset: 0x54, control: 'number', min: 0, max: 100 },
  { id: 'preamp-a-middle', group: 'Preamp A', label: 'Middle', offset: 0x55, control: 'number', min: 0, max: 100 },
  { id: 'preamp-a-treble', group: 'Preamp A', label: 'Treble', offset: 0x56, control: 'number', min: 0, max: 100 },
  { id: 'preamp-a-presence', group: 'Preamp A', label: 'Presence', offset: 0x57, control: 'number', min: 0, max: 100 },
  { id: 'preamp-a-level', group: 'Preamp A', label: 'Level', offset: 0x58, control: 'number', min: 0, max: 100 },
  { id: 'preamp-a-bright', group: 'Preamp A', label: 'Bright', offset: 0x59, control: 'toggle', min: 0, max: 1, options: [{ value: 0, label: 'Desligado' }, { value: 1, label: 'Ligado' }] },
  { id: 'preamp-a-speaker-type', group: 'Preamp A', label: 'Speaker type', offset: 0x5d, control: 'select', min: 0, max: 8, options: [{ value: 0, label: 'Off' }, { value: 1, label: 'ORIGINAL' }, { value: 2, label: '1x8"' }, { value: 3, label: '1x10"' }, { value: 4, label: '1x12"' }, { value: 5, label: '2x12"' }, { value: 6, label: '4x10"' }, { value: 7, label: '4x12"' }, { value: 8, label: '8x12"' }] },
  { id: 'preamp-b-enabled', group: 'Preamp B', label: 'Ligado', offset: 0x80, control: 'toggle', min: 0, max: 1, options: [{ value: 0, label: 'Desligado' }, { value: 1, label: 'Ligado' }] },
  { id: 'preamp-b-type', group: 'Preamp B', label: 'Tipo', offset: 0x81, control: 'select', min: 0, max: 27, options: Array.from({ length: 28 }, (_, value) => ({ value, label: value.toString(16).toUpperCase().padStart(2, '0') })) },
  { id: 'preamp-b-gain', group: 'Preamp B', label: 'Gain', offset: 0x82, control: 'number', min: 0, max: 120 },
  { id: 'preamp-b-tcomp', group: 'Preamp B', label: 'T-Comp', offset: 0x83, control: 'number', min: 0, max: 100 },
  { id: 'preamp-b-bass', group: 'Preamp B', label: 'Bass', offset: 0x84, control: 'number', min: 0, max: 100 },
  { id: 'preamp-b-middle', group: 'Preamp B', label: 'Middle', offset: 0x85, control: 'number', min: 0, max: 100 },
  { id: 'preamp-b-treble', group: 'Preamp B', label: 'Treble', offset: 0x86, control: 'number', min: 0, max: 100 },
  { id: 'preamp-b-presence', group: 'Preamp B', label: 'Presence', offset: 0x87, control: 'number', min: 0, max: 100 },
  { id: 'preamp-b-level', group: 'Preamp B', label: 'Level', offset: 0x88, control: 'number', min: 0, max: 100 },
];

const nameParameter: Gt1ParameterDefinition = {
  id: 'patch-name', group: 'Patch', label: 'Nome', offset: 0, control: 'number', min: 0x20, max: 0x7e,
};

export const patchNameDefinition = nameParameter;

export function getParameterValue(patch: Gt1Patch, parameter: Gt1ParameterDefinition): number {
  const block = Math.floor(parameter.offset / 128);
  const byteOffset = parameter.offset % 128;
  const frame = patch.frames.find((candidate) => candidate[9] === block && candidate[10] === 0);
  if (!frame || byteOffset >= frame.length - 13) return parameter.min;
  return frame[11 + byteOffset] ?? parameter.min;
}

export function getPatchName(patch: Gt1Patch): string {
  return patch.name;
}

export function updatePatchParameter(patch: Gt1Patch, parameterId: string, rawValue: number): Gt1Patch {
  const parameter = parameterDefinitions.find((candidate) => candidate.id === parameterId);
  if (!parameter || !Number.isInteger(rawValue) || rawValue < parameter.min || rawValue > parameter.max) {
    return patch;
  }
  const frames = patch.frames.map((frame) => new Uint8Array(frame));
  const block = Math.floor(parameter.offset / 128);
  const byteOffset = parameter.offset % 128;
  const index = frames.findIndex((candidate) => candidate[9] === block && candidate[10] === 0);
  if (index < 0 || 11 + byteOffset >= frames[index].length - 2) return patch;
  frames[index][11 + byteOffset] = rawValue;
  frames[index].set(refreshFrameChecksum(frames[index]));
  return { ...patch, frames, complete: frames.every((frame) => frame.length - 13 === 128) };
}

export function updatePatchName(patch: Gt1Patch, name: string): Gt1Patch {
  const frames = patch.frames.map((frame) => new Uint8Array(frame));
  const firstFrameIndex = frames.findIndex((frame) => frame[9] === 0 && frame[10] === 0);
  if (firstFrameIndex < 0 || frames[firstFrameIndex].length < 29) return patch;
  const sanitized = Array.from(name.slice(0, 16), (character) => {
    const code = character.codePointAt(0) ?? 0x20;
    return code >= 0x20 && code <= 0x7e ? code : 0x20;
  });
  while (sanitized.length < 16) sanitized.push(0x20);
  for (let index = 0; index < 16; index += 1) frames[firstFrameIndex][11 + index] = sanitized[index];
  frames[firstFrameIndex].set(refreshFrameChecksum(frames[firstFrameIndex]));
  return { ...patch, name: String.fromCharCode(...sanitized).trimEnd(), frames };
}
