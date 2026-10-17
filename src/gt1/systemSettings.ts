import { Gt1ProtocolError } from './types';
import { knobAssignmentOptions } from './knobAssignmentOptions';

export type Gt1SystemSettingId =
  | 'sys_play_option_exp_pedal_hold'
  | 'sys_exp2_pedal_hold'
  | 'sys_play_option_knob_lock'
  | 'sys_pedal_double_down_up'
  | 'sys_pedal_double_up_ctl'
  | 'sys_play_option_pedal_indicat'
  | 'sys_knob_setting_knob1'
  | 'sys_knob_setting_knob2'
  | 'sys_knob_setting_knob3'
  | 'sys_preference_exp'
  | 'sys_preference_accel_ctl'
  | 'sys_preference_exp_sw'
  | 'sys_pedal_down_setting_pref'
  | 'sys_pedal_up_setting_pref'
  | 'sys_preference_sub_exp'
  | 'sys_preference_sub_ctl1'
  | 'sys_preference_sub_ctl2'
  | 'sys_phrase_loop_play_level'
  | 'sys_usb_primary_mix_level'
  | 'sys_usb_primary_output_level'
  | 'sys_output_select';

export type Gt1SystemSettings = Record<Gt1SystemSettingId, number>;
export type Gt1PartialSystemSettings = Partial<Gt1SystemSettings>;
export type Gt1SystemSettingOption = { value: number; label: string };
export type Gt1SystemSettingDefinition = {
  id: Gt1SystemSettingId;
  group: string;
  label: string;
  address: readonly [number, number, number, number];
  width: 1 | 2;
  control: 'toggle' | 'select' | 'number';
  min: number;
  max: number;
  step: number;
  options?: Gt1SystemSettingOption[];
  slider?: boolean;
};

export type Gt1SystemSettingGroup = {
  id: string;
  label: string;
  description: string;
  settings: Gt1SystemSettingDefinition[];
};

export const gt1SystemMemoryBlocks: ReadonlyArray<{
  address: readonly [number, number, number, number];
  size: 64;
}> = [
  { address: [0x00, 0x00, 0x00, 0x00], size: 64 },
  { address: [0x00, 0x00, 0x00, 0x40], size: 64 },
  { address: [0x00, 0x00, 0x01, 0x00], size: 64 },
  { address: [0x00, 0x00, 0x01, 0x40], size: 64 },
  { address: [0x00, 0x00, 0x02, 0x00], size: 64 },
  { address: [0x00, 0x00, 0x02, 0x40], size: 64 },
  { address: [0x00, 0x00, 0x03, 0x00], size: 64 },
];

const onOffOptions = [
  { value: 0, label: 'OFF' },
  { value: 1, label: 'ON' },
];
const pedalComboOptions = [
  { value: 0, label: 'OFF' },
  { value: 1, label: 'TUNER' },
  { value: 2, label: 'LOOP' },
  { value: 3, label: 'MEM +1' },
  { value: 4, label: 'MEM -1' },
];
const patchSystemOptions = [
  { value: 0, label: 'PATCH' },
  { value: 1, label: 'SYSTEM' },
];
const outputSelectOptions = [
  { value: 0, label: 'JC-120' },
  { value: 1, label: 'SMALL AMP' },
  { value: 2, label: 'COMBO AMP' },
  { value: 3, label: 'STACK AMP' },
  { value: 4, label: 'JC-120 RETURN' },
  { value: 5, label: 'COMBO RETURN' },
  { value: 6, label: 'STACK RETURN' },
  { value: 7, label: 'LINE/PHONES' },
];
const knobOptions: Gt1SystemSettingOption[] = knobAssignmentOptions.map(({ value, label }) => ({ value, label }));

function setting(
  id: Gt1SystemSettingId,
  group: string,
  label: string,
  address: readonly [number, number, number, number],
  min: number,
  max: number,
  options?: Gt1SystemSettingOption[],
  width: 1 | 2 = 1,
  step = 1,
  slider = false,
): Gt1SystemSettingDefinition {
  return { id, group, label, address, width, control: options ? (max === 1 && options === onOffOptions ? 'toggle' : 'select') : 'number', min, max, step, options, slider };
}

export const gt1SystemSettingGroups: Gt1SystemSettingGroup[] = [
  {
    id: 'play-option',
    label: 'Play Option',
    description: 'Opções de operação e controles de pedal da GT-1.',
    settings: [
      setting('sys_play_option_exp_pedal_hold', 'Play Option', 'EXP1 PEDAL HOLD', [0, 0, 0, 0x11], 0, 1, onOffOptions),
      setting('sys_exp2_pedal_hold', 'Play Option', 'EXP2 PEDAL HOLD', [0, 0, 3, 0x31], 0, 1, onOffOptions),
      setting('sys_play_option_knob_lock', 'Play Option', 'KNOB LOCK', [0, 0, 0, 0x12], 0, 1, onOffOptions),
      setting('sys_pedal_double_down_up', 'Play Option', 'DOWN + UP', [0, 0, 3, 0x33], 0, 4, pedalComboOptions),
      setting('sys_pedal_double_up_ctl', 'Play Option', 'UP + CTL1', [0, 0, 3, 0x34], 0, 4, pedalComboOptions),
      setting('sys_play_option_pedal_indicat', 'Play Option', 'PEDAL LIGHT', [0, 0, 0, 0x18], 0, 1, onOffOptions),
    ],
  },
  {
    id: 'knob-setting',
    label: 'Knob Setting',
    description: 'Função atribuída a cada knob da pedaleira.',
    settings: [
      setting('sys_knob_setting_knob1', 'Knob Setting', 'KNOB 1', [0, 0, 2, 0x50], 0, 309, knobOptions, 2),
      setting('sys_knob_setting_knob2', 'Knob Setting', 'KNOB 2', [0, 0, 2, 0x52], 0, 309, knobOptions, 2),
      setting('sys_knob_setting_knob3', 'Knob Setting', 'KNOB 3', [0, 0, 2, 0x54], 0, 309, knobOptions, 2),
    ],
  },
  {
    id: 'preference',
    label: 'Preference',
    description: 'Define se cada pedal segue o patch ou a configuração do sistema.',
    settings: [
      setting('sys_preference_exp', 'Preference', 'EXP1', [0, 0, 0, 0x43], 0, 1, patchSystemOptions),
      setting('sys_preference_accel_ctl', 'Preference', 'CTL1', [0, 0, 0, 0x42], 0, 1, patchSystemOptions),
      setting('sys_preference_exp_sw', 'Preference', 'EXP SW', [0, 0, 0, 0x44], 0, 1, patchSystemOptions),
      setting('sys_pedal_down_setting_pref', 'Preference', 'DOWN', [0, 0, 3, 0x35], 0, 1, patchSystemOptions),
      setting('sys_pedal_up_setting_pref', 'Preference', 'UP', [0, 0, 3, 0x36], 0, 1, patchSystemOptions),
      setting('sys_preference_sub_exp', 'Preference', 'EXP2', [0, 0, 0, 0x47], 0, 1, patchSystemOptions),
      setting('sys_preference_sub_ctl1', 'Preference', 'CTL2', [0, 0, 0, 0x45], 0, 1, patchSystemOptions),
      setting('sys_preference_sub_ctl2', 'Preference', 'CTL3', [0, 0, 0, 0x46], 0, 1, patchSystemOptions),
    ],
  },
  {
    id: 'phrase-loop',
    label: 'Phrase Loop',
    description: 'Nível de reprodução do Phrase Loop.',
    settings: [setting('sys_phrase_loop_play_level', 'Phrase Loop', 'LEVEL', [0, 0, 1, 0x04], 0, 120, undefined, 1, 1, true)],
  },
  {
    id: 'usb',
    label: 'USB',
    description: 'Níveis de mixagem e saída de áudio USB.',
    settings: [
      setting('sys_usb_primary_mix_level', 'USB', 'MIX LEVEL', [0, 0, 0, 0x53], 0, 200, undefined, 1, 2, true),
      setting('sys_usb_primary_output_level', 'USB', 'EFFECT OUT LEVEL', [0, 0, 0, 0x52], 0, 200, undefined, 1, 2, true),
    ],
  },
  {
    id: 'output-select',
    label: 'Output Select',
    description: 'Simulação da saída conectada à GT-1.',
    settings: [setting('sys_output_select', 'Output Select', 'OUTPUT SELECT', [0, 0, 0, 0x70], 0, 7, outputSelectOptions)],
  },
];

export const gt1SystemSettingDefinitions = gt1SystemSettingGroups.flatMap((group) => group.settings);

export function getGt1SystemSetting(id: string): Gt1SystemSettingDefinition {
  const definition = gt1SystemSettingDefinitions.find((candidate) => candidate.id === id);
  if (!definition) throw new Gt1ProtocolError('invalid-address', `Configuração de sistema não suportada: ${id}.`);
  return definition;
}

export function addressToRolandInteger(address: readonly number[]): number {
  return address.reduce((value, byte) => value * 128 + byte, 0);
}

export function decodeSystemSettingValue(data: Uint8Array, offset: number, definition: Gt1SystemSettingDefinition): number | undefined {
  if (offset < 0 || offset + definition.width > data.length) return undefined;
  const raw = definition.width === 1
    ? data[offset]
    : data[offset] * 128 + data[offset + 1];
  const value = raw * definition.step;
  if (value < definition.min || value > definition.max || (value - definition.min) % definition.step !== 0) {
    throw new Gt1ProtocolError('invalid-address', `A GT-1 retornou um valor inválido para ${definition.label}.`);
  }
  if (definition.options && !definition.options.some((option) => option.value === value)) {
    throw new Gt1ProtocolError('invalid-address', `A GT-1 retornou uma opção desconhecida para ${definition.label}.`);
  }
  return value;
}
