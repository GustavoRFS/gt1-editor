import { refreshFrameChecksum } from './checksum';
import { getVisibleParameterDefinitions, parameterDefinitions } from './parameterMap';
import { GT1_USER_PATCH_COUNT, setParameterLocally, setPatchNameLocally } from './sysex';
import { gt1SystemSettingDefinitions } from './systemSettings';
import type { Gt1Patch, Gt1EffectSectionId } from './types';
import type { Gt1SystemSettings } from './systemSettings';

const patchNameTemplates = [
  'Studio Clean', 'Brit Crunch', 'Tweed Blues', 'Modern Lead', 'Ambient Pad',
  'Acoustic Sim', 'Vintage Drive', 'Wide Chorus', 'Tape Echo', 'Metal Core',
  'Warm Jazz', 'Solo Boost',
];

const effectSections: Gt1EffectSectionId[] = ['fx1-comp', 'od-ds', 'preamp', 'fx2-mod', 'delay', 'reverb'];

function createPatchFrames(name: string): Uint8Array[] {
  return Array.from({ length: 17 }, (_, block) => {
    const frame = new Uint8Array(141);
    frame.set([0xf0, 0x41, 0x00, 0x00, 0x00, 0x60, 0x12, 0x60, 0x00, block, 0x00]);
    frame[140] = 0xf7;
    if (block === 0) {
      for (let index = 0; index < 16; index += 1) frame[11 + index] = name.charCodeAt(index) || 0x20;
    }
    return refreshFrameChecksum(frame);
  });
}

function preferredValue(parameterId: string, slot: number, min: number, max: number): number {
  const parameter = parameterDefinitions.find(({ id }) => id === parameterId);
  if (parameter?.options?.length) return parameter.options[(slot - 1) % parameter.options.length].value;
  const step = 1;
  return min + Math.floor(((max - min) / 2) / step) * step;
}

function createMockPatch(userPatch: number): Gt1Patch {
  const number = String(userPatch).padStart(2, '0');
  const template = patchNameTemplates[(userPatch - 1) % patchNameTemplates.length];
  const initial: Gt1Patch = {
    id: `gt1-user-${number}`,
    userPatch,
    name: `${template} ${number}`.slice(0, 16),
    frames: createPatchFrames(`${template} ${number}`.slice(0, 16)),
    sourceFormat: 'device',
    sourceName: `GT-1 · U${number}`,
    complete: true,
  };

  let patch = initial;
  const selectors = ['fx1-type', 'fx2-type', 'od-type', 'delay-type', 'reverb-type', 'preamp-a-type', 'preamp-b-type'];
  for (const parameterId of selectors) {
    const parameter = parameterDefinitions.find((candidate) => candidate.id === parameterId);
    if (parameter) patch = setParameterLocally(patch, parameterId, preferredValue(parameterId, userPatch, parameter.min, parameter.max));
  }

  for (const parameter of parameterDefinitions) {
    if (parameter.label === 'Ligado') patch = setParameterLocally(patch, parameter.id, 1);
  }

  for (const section of effectSections) {
    for (const parameter of getVisibleParameterDefinitions(patch, section)) {
      if (selectors.includes(parameter.id) || parameter.label === 'Ligado') continue;
      const value = parameter.options?.length
        ? parameter.options[(userPatch - 1) % parameter.options.length].value
        : Math.max(parameter.min, Math.min(parameter.max, Math.floor((parameter.min + parameter.max) / 2)));
      patch = setParameterLocally(patch, parameter.id, value);
    }
  }

  return setPatchNameLocally(patch, initial.name);
}

export function createMockUserPatches(): Gt1Patch[] {
  return Array.from({ length: GT1_USER_PATCH_COUNT }, (_, index) => createMockPatch(index + 1));
}

export function createMockSystemSettings(): Gt1SystemSettings {
  return Object.fromEntries(gt1SystemSettingDefinitions.map((definition, index) => {
    const value = definition.options?.length
      ? definition.options[index % definition.options.length].value
      : definition.min + Math.floor(((definition.max - definition.min) / 2) / definition.step) * definition.step;
    return [definition.id, value];
  })) as Gt1SystemSettings;
}
