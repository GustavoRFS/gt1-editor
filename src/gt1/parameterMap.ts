import type { Gt1EffectSectionId, Gt1ParameterDefinition, Gt1ParameterOption, Gt1Patch } from './types';
import { refreshFrameChecksum } from './checksum';

export const effectSections: ReadonlyArray<{ id: Gt1EffectSectionId; label: string; description: string }> = [
  { id: 'fx1-comp', label: 'FX1/Comp', description: 'Selecione um efeito para FX1; Compressor é uma das opções.' },
  { id: 'od-ds', label: 'OD/DS', description: 'Overdrive, distorção e seus controles de solo.' },
  { id: 'preamp', label: 'Preamp', description: 'Pré-amplificador da cadeia.' },
  { id: 'fx2-mod', label: 'FX2/MOD', description: 'Efeitos do bloco FX2, incluindo modulação.' },
  { id: 'delay', label: 'Delay', description: 'Tipos de delay, tempo, repetição e modulação.' },
  { id: 'reverb', label: 'Reverb', description: 'Tipos de reverberação e parâmetros de ambiência.' },
];

const optionList = (labels: string[], firstValue = 0): Gt1ParameterOption[] => labels.map((label, index) => ({ value: firstValue + index, label }));
const explicitOptions = (values: ReadonlyArray<readonly [number, string]>): Gt1ParameterOption[] => values.map(([value, label]) => ({ value, label }));
const onOff = optionList(['Desligado', 'Ligado']);

const compressorTypes = optionList(['BOSS Comp', 'Hi-Band', 'Light', 'D-Comp', 'Orange', 'FAT', 'Mild', 'Stereo']);
const odTypes = optionList([
  'Mid Boost', 'Clean Boost', 'Treble Boost', 'Crunch', 'Natural OD', 'Warm OD', 'Fat DS', 'Lead DS',
  'Metal DS', 'OCT Fuzz', 'A-Dist', 'Blues OD', 'OD-1', 'Tubescreamer', 'Turbo OD', 'Distortion',
  'RAT', 'GuV DS', 'DST+', 'Metal Zone', "'60s Fuzz", 'Muff Fuzz',
]);
const preampTypesA = optionList([
  'Natural Clean', 'Full Range', 'Combo Crunch', 'Stack Crunch', 'HiGain Stack', 'Power Drive',
  'Extreme Lead', 'Core Metal', 'JC-120', 'Clean Twin', 'Pro Crunch', 'Tweed', 'Deluxe Crunch',
  'VO Drive', 'VO Lead', 'Match Drive', 'BG Lead', 'BG Drive', 'MS-1959 I', 'MS-1959 I+II',
  'R-Fier Vintage', 'R-Fier Modern', 'T-Amp Lead', 'SLDN', '5150 Drive', 'Bogner Uber', 'Orange Rocker',
]);
const preampTypesB = optionList([
  'Natural Clean', 'Full Range', 'Combo Crunch', 'Stack Crunch', 'HiGain Stack', 'Power Drive',
  'Extreme Lead', 'Core Metal', 'JC-120', 'Clean Twin', 'Pro Crunch', 'Tweed', 'Deluxe Crunch',
  'VO Drive', 'VO Lead', 'Match Drive', 'BG Lead', 'BG Drive', 'MS-1959 I', 'MS-1959 I+II',
  'R-Fier Vintage', 'R-Fier Modern', 'T-Amp Lead', 'SLDN', '5150 Drive', 'Custom', 'Bogner Uber', 'Orange Rocker',
]);
const fxTypes = optionList([
  'Compressor', 'Limiter', 'T.Wah', 'Graphic EQ', 'Parametric EQ', 'Tone Modify', 'Guitar Sim',
  'AC Guitar Sim', 'Slow Gear', 'Octave', 'Pitch Shifter', 'Harmonist', 'Overtone', 'Feedbacker',
  'AC Processor', 'Phaser', 'Flanger', 'Tremolo', 'Rotary', 'Uni-V', 'Vibrato', 'Chorus', 'Sub Delay',
]);
const highCutOptions = optionList(['630 Hz', '800 Hz', '1.00 kHz', '1.25 kHz', '1.60 kHz', '2.00 kHz', '2.50 kHz', '3.15 kHz', '4.00 kHz', '5.00 kHz', '6.30 kHz', '8.00 kHz', '10.0 kHz', '12.5 kHz', 'Flat']);
const lowCutOptions = optionList(['Flat', '20 Hz', '25 Hz', '31.5 Hz', '40 Hz', '50 Hz', '63 Hz', '80 Hz', '100 Hz', '125 Hz', '160 Hz', '200 Hz', '250 Hz', '315 Hz', '400 Hz', '500 Hz', '630 Hz', '800 Hz']);
const eqFrequencyOptions = optionList([
  '20 Hz', '25 Hz', '31.5 Hz', '40 Hz', '50 Hz', '63 Hz', '80 Hz', '100 Hz', '125 Hz', '160 Hz', '200 Hz', '250 Hz',
  '315 Hz', '400 Hz', '500 Hz', '630 Hz', '800 Hz', '1.00 kHz', '1.25 kHz', '1.60 kHz', '2.00 kHz', '2.50 kHz',
  '3.15 kHz', '4.00 kHz', '5.00 kHz', '6.30 kHz', '8.00 kHz', '10.0 kHz',
]);
const qOptions = optionList(['0.5', '1', '2', '4', '8', '16']);
const tempoRateOptions = explicitOptions([
  [101, 'Whole note'], [102, 'Dotted half note'], [103, 'Whole note triplet'], [104, 'Half note'],
  [105, 'Dotted quarter note'], [106, 'Half note triplet'], [107, 'Quarter note'], [108, 'Dotted eighth note'],
  [109, 'Quarter note triplet'], [110, 'Eighth note'], [111, 'Dotted sixteenth note'], [112, 'Eighth note triplet'],
  [113, 'Sixteenth note'],
]);

type FieldSpec = Omit<Gt1ParameterDefinition, 'id' | 'group' | 'sectionId' | 'visibleWhen'> & {
  key: string;
  visibleWhen?: Gt1ParameterDefinition['visibleWhen'];
};

function numberField(key: string, label: string, offset: number, min = 0, max = 100, extras: Partial<FieldSpec> = {}): FieldSpec {
  return { key, label, offset, control: 'number', min, max, ...extras };
}

function selectField(key: string, label: string, offset: number, options: Gt1ParameterOption[], extras: Partial<FieldSpec> = {}): FieldSpec {
  return { key, label, offset, control: 'select', min: options[0]?.value ?? 0, max: options[options.length - 1]?.value ?? 0, options, ...extras };
}

function toggleField(key: string, label: string, offset: number, extras: Partial<FieldSpec> = {}): FieldSpec {
  return { key, label, offset, control: 'toggle', min: 0, max: 1, options: onOff, ...extras };
}

function definition(id: string, sectionId: Gt1EffectSectionId, group: string, field: FieldSpec, visibleWhen?: Gt1ParameterDefinition['visibleWhen']): Gt1ParameterDefinition {
  const { key: _key, visibleWhen: fieldConditions, ...properties } = field;
  const conditions = [...(fieldConditions ?? []), ...(visibleWhen ?? [])];
  return { id, sectionId, group, ...properties, ...(conditions.length ? { visibleWhen: conditions } : {}) };
}

const odDefinitions: Gt1ParameterDefinition[] = [
  definition('od-enabled', 'od-ds', 'OD/DS', toggleField('enabled', 'Ligado', 0x30)),
  definition('od-type', 'od-ds', 'OD/DS', selectField('type', 'Tipo', 0x31, odTypes)),
  definition('od-drive', 'od-ds', 'OD/DS', numberField('drive', 'Drive', 0x32, 0, 120)),
  definition('od-bottom', 'od-ds', 'OD/DS', numberField('bottom', 'Bottom', 0x33, -50, 50, { displayOffset: -50 })),
  definition('od-tone', 'od-ds', 'OD/DS', numberField('tone', 'Tone', 0x34, -50, 50, { displayOffset: -50 })),
  definition('od-solo-enabled', 'od-ds', 'OD/DS', toggleField('solo-enabled', 'Solo', 0x35)),
  definition('od-solo-level', 'od-ds', 'OD/DS', numberField('solo-level', 'Solo level', 0x36)),
  definition('od-effect-level', 'od-ds', 'OD/DS', numberField('effect-level', 'Effect level', 0x37)),
  definition('od-direct-level', 'od-ds', 'OD/DS', numberField('direct-level', 'Direct level', 0x38)),
];

const preampDefinitions: Gt1ParameterDefinition[] = [];

preampDefinitions.push(
  definition('divider-mode', 'preamp', 'Preamp routing', selectField('mode', 'Mode', 0x340, optionList(['Single', 'Dual']))),
  definition('divider-channel', 'preamp', 'Preamp routing', selectField('channel', 'Channel', 0x341, optionList(['A', 'B']))),
);

function addPreampDefinitions(channel: 'a' | 'b', baseOffset: number, types: Gt1ParameterOption[], speakers: Gt1ParameterOption[]): void {
  const group = `Preamp ${channel.toUpperCase()}`;
  const id = `preamp-${channel}`;
  preampDefinitions.push(
    definition(`${id}-enabled`, 'preamp', group, toggleField('enabled', 'Ligado', baseOffset)),
    definition(`${id}-type`, 'preamp', group, selectField('type', 'Tipo', baseOffset + 1, types)),
    definition(`${id}-gain`, 'preamp', group, numberField('gain', 'Gain', baseOffset + 2, 0, 120)),
    definition(`${id}-tcomp`, 'preamp', group, numberField('tcomp', 'T-Comp', baseOffset + 3, -10, 10, { displayOffset: -10 })),
    definition(`${id}-bass`, 'preamp', group, numberField('bass', 'Bass', baseOffset + 4)),
    definition(`${id}-middle`, 'preamp', group, numberField('middle', 'Middle', baseOffset + 5)),
    definition(`${id}-treble`, 'preamp', group, numberField('treble', 'Treble', baseOffset + 6)),
    definition(`${id}-presence`, 'preamp', group, numberField('presence', 'Presence', baseOffset + 7)),
    definition(`${id}-level`, 'preamp', group, numberField('level', 'Level', baseOffset + 8)),
    definition(`${id}-bright`, 'preamp', group, toggleField('bright', 'Bright', baseOffset + 9)),
    definition(`${id}-gain-switch`, 'preamp', group, selectField('gain-switch', 'Gain switch', baseOffset + 0x0a, optionList(['Low', 'Middle', 'High']))),
    definition(`${id}-solo`, 'preamp', group, toggleField('solo', 'Solo', baseOffset + 0x0b)),
    definition(`${id}-solo-level`, 'preamp', group, numberField('solo-level', 'Solo level', baseOffset + 0x0c)),
    definition(`${id}-speaker-type`, 'preamp', group, selectField('speaker-type', 'Speaker type', baseOffset + 0x0d, speakers)),
    definition(`${id}-mic-type`, 'preamp', group, selectField('mic-type', 'Mic type', baseOffset + 0x0e, optionList(['DYN57', 'DYN421', 'CND451', 'CND87', 'Flat']))),
    definition(`${id}-mic`, 'preamp', group, selectField('mic', 'Mic position', baseOffset + 0x0f, optionList(['Off mic', 'On mic']))),
    definition(`${id}-mic-distance`, 'preamp', group, selectField('mic-distance', 'Mic distance', baseOffset + 0x10, explicitOptions([[0, 'Center'], ...Array.from({ length: 10 }, (_, index) => [index + 1, `${index + 1} cm`] as const)]))),
    definition(`${id}-mic-level`, 'preamp', group, numberField('mic-level', 'Mic level', baseOffset + 0x11)),
    definition(`${id}-direct-mix`, 'preamp', group, numberField('direct-mix', 'Direct mix', baseOffset + 0x12)),
  );
}

addPreampDefinitions('a', 0x50, preampTypesA, optionList(['Off', 'Original', '1x8"', '1x10"', '1x12"', '2x12"', '4x10"', '4x12"', '8x12"']));
addPreampDefinitions('b', 0x80, preampTypesB, optionList(['Off', 'Original', '1x8"', '1x10"', '1x12"', '2x12"', '4x10"', '4x12"', '8x12"', 'Custom']));

type EffectTemplate = { type: number; label: string; fields: FieldSpec[] };

const fxTemplates: EffectTemplate[] = [
  { type: 0, label: 'Compressor', fields: [
    selectField('compressor-type', 'Compressor type', 0x0e3, compressorTypes),
    numberField('compressor-sustain', 'Sustain', 0x0e4), numberField('compressor-attack', 'Attack', 0x0e5),
    numberField('compressor-tone', 'Tone', 0x0e6, -50, 50, { displayOffset: -50 }), numberField('compressor-level', 'Level', 0x0e7),
  ] },
  { type: 1, label: 'Limiter', fields: [
    selectField('limiter-type', 'Limiter type', 0x0e9, optionList(['BOSS Limiter', 'Rack 160D', 'Vintage Rack U'])),
    numberField('limiter-attack', 'Attack', 0x0ea), numberField('limiter-threshold', 'Threshold', 0x0eb),
    selectField('limiter-ratio', 'Ratio', 0x0ec, optionList(['1:1', '1.2:1', '1.4:1', '1.6:1', '1.8:1', '2:1', '2.3:1', '2.6:1', '3:1', '3.5:1', '4:1', '5:1', '6:1', '8:1', '10:1', '12:1', '20:1', '∞:1'])),
    numberField('limiter-release', 'Release', 0x0ed), numberField('limiter-level', 'Level', 0x0ee),
  ] },
  { type: 2, label: 'T.Wah', fields: [
    selectField('twah-mode', 'Mode', 0x0cc, optionList(['LPF', 'BPF'])), selectField('twah-polarity', 'Polarity', 0x0cd, optionList(['Down', 'Up'])),
    numberField('twah-sens', 'Sensitivity', 0x0ce), numberField('twah-frequency', 'Frequency', 0x0cf),
    numberField('twah-peak', 'Peak', 0x0d0), numberField('twah-direct-mix', 'Direct mix', 0x0d1), numberField('twah-level', 'Effect level', 0x0d2),
  ] },
  { type: 3, label: 'Graphic EQ', fields: [
    ...['100 Hz', '200 Hz', '400 Hz', '800 Hz', '1.6 kHz', '3.2 kHz', '6.4 kHz'].map((label, index) => numberField(`geq-${index}`, label, 0x0f0 + index, -20, 20, { displayOffset: -20 })),
    numberField('geq-level', 'Level', 0x0fa, -20, 20, { displayOffset: -20 }),
  ] },
  { type: 4, label: 'Parametric EQ', fields: [
    selectField('peq-low-cut', 'Low cut', 0x0fc, lowCutOptions), numberField('peq-low-gain', 'Low gain', 0x0fd, -20, 20, { displayOffset: -20 }),
    selectField('peq-low-mid-frequency', 'Low-mid frequency', 0x0fe, eqFrequencyOptions), selectField('peq-low-mid-q', 'Low-mid Q', 0x0ff, qOptions),
    numberField('peq-low-mid-gain', 'Low-mid gain', 0x100, -20, 20, { displayOffset: -20 }),
    selectField('peq-high-mid-frequency', 'High-mid frequency', 0x101, eqFrequencyOptions), selectField('peq-high-mid-q', 'High-mid Q', 0x102, qOptions),
    numberField('peq-high-mid-gain', 'High-mid gain', 0x103, -20, 20, { displayOffset: -20 }),
    numberField('peq-high-gain', 'High gain', 0x104, -20, 20, { displayOffset: -20 }),
    selectField('peq-high-cut', 'High cut', 0x105, highCutOptions), numberField('peq-level', 'Level', 0x106, -20, 20, { displayOffset: -20 }),
  ] },
  { type: 5, label: 'Tone Modify', fields: [
    selectField('tone-modify-type', 'Type', 0x108, optionList(['Fat', 'Presence', 'Mild', 'Tight', 'Enhance', 'Resonator 1', 'Resonator 2', 'Resonator 3'])),
    numberField('tone-modify-resonance', 'Resonance', 0x109), numberField('tone-modify-low', 'Low', 0x10a, -50, 50, { displayOffset: -50 }),
    numberField('tone-modify-high', 'High', 0x10b, -50, 50, { displayOffset: -50 }), numberField('tone-modify-level', 'Level', 0x10c),
  ] },
  { type: 6, label: 'Guitar Sim', fields: [
    selectField('guitar-sim-type', 'Type', 0x10e, optionList(['S→H', 'H→S', 'H→Half tone', 'S→Hollow', 'H→Hollow', 'S→Acoustic', 'H→Acoustic', 'Piezo→Acoustic'])),
    numberField('guitar-sim-low', 'Low', 0x10f, -50, 50, { displayOffset: -50 }), numberField('guitar-sim-high', 'High', 0x110, -50, 50, { displayOffset: -50 }),
    numberField('guitar-sim-level', 'Level', 0x111), numberField('guitar-sim-body', 'Body', 0x112),
  ] },
  { type: 7, label: 'AC Guitar Sim', fields: [
    numberField('ac-guitar-sim-high', 'High', 0x810, -50, 50, { displayOffset: -50 }), numberField('ac-guitar-sim-body', 'Body', 0x811),
    numberField('ac-guitar-sim-low', 'Low', 0x812, -50, 50, { displayOffset: -50 }), numberField('ac-guitar-sim-level', 'Level', 0x814),
  ] },
  { type: 8, label: 'Slow Gear', fields: [
    numberField('slow-gear-sens', 'Sensitivity', 0x114), numberField('slow-gear-rise-time', 'Rise time', 0x115), numberField('slow-gear-level', 'Level', 0x116),
  ] },
  { type: 9, label: 'Octave', fields: [
    numberField('octave-minus-two', '-2 octave', 0x131), numberField('octave-minus-one', '-1 octave', 0x132), numberField('octave-direct-mix', 'Direct mix', 0x133),
  ] },
  { type: 10, label: 'Pitch Shifter', fields: [
    selectField('pitch-shifter-voice', 'Voice', 0x135, optionList(['1 voice', '2 voices'])),
    selectField('pitch-shifter-mode', 'Voice 1 mode', 0x136, optionList(['Fast', 'Medium', 'Slow', 'Mono'])),
    numberField('pitch-shifter-pitch', 'Voice 1 pitch', 0x137, -24, 24, { displayOffset: -24 }),
    numberField('pitch-shifter-fine', 'Voice 1 fine', 0x138, -50, 50, { displayOffset: -50 }),
    numberField('pitch-shifter-pre-delay', 'Voice 1 pre-delay (ms)', 0x139, 0, 300, { width: 2 }),
    numberField('pitch-shifter-level', 'Voice 1 level', 0x13b),
    selectField('pitch-shifter-voice-2-mode', 'Voice 2 mode', 0x13c, optionList(['Fast', 'Medium', 'Slow', 'Mono']), {
      visibleWhen: [{ parameterId: 'fx1-pitch-shifter-voice', values: [1] }],
    }),
    numberField('pitch-shifter-voice-2-pitch', 'Voice 2 pitch', 0x13d, -24, 24, {
      displayOffset: -24, visibleWhen: [{ parameterId: 'fx1-pitch-shifter-voice', values: [1] }],
    }),
    numberField('pitch-shifter-voice-2-fine', 'Voice 2 fine', 0x13e, -50, 50, {
      displayOffset: -50, visibleWhen: [{ parameterId: 'fx1-pitch-shifter-voice', values: [1] }],
    }),
    numberField('pitch-shifter-voice-2-pre-delay', 'Voice 2 pre-delay (ms)', 0x13f, 0, 300, {
      width: 2, visibleWhen: [{ parameterId: 'fx1-pitch-shifter-voice', values: [1] }],
    }),
    numberField('pitch-shifter-voice-2-level', 'Voice 2 level', 0x141, 0, 100, {
      visibleWhen: [{ parameterId: 'fx1-pitch-shifter-voice', values: [1] }],
    }), numberField('pitch-shifter-feedback', 'Feedback', 0x142),
    numberField('pitch-shifter-direct-level', 'Direct level', 0x143),
  ] },
  { type: 11, label: 'Harmonist', fields: [
    selectField('harmonist-voice', 'Voice', 0x145, optionList(['1 voice', '2 voices'])),
    selectField('harmonist-harmony', 'Harmony 1', 0x146, optionList(['-2 oct', '-14th', '-13th', '-12th', '-11th', '-10th', '-9th', '-1 oct', '-7th', '-6th', '-5th', '-4th', '-3rd', '-2nd', 'Unison', '+2nd', '+3rd', '+4th', '+5th', '+6th', '+7th', '+1 oct', '+9th', '+10th', '+11th', '+12th', '+13th', '+14th', '+2 oct'])),
    numberField('harmonist-pre-delay', 'Pre-delay (ms)', 0x147, 0, 300, { width: 2 }), numberField('harmonist-level', 'Effect level', 0x149),
    selectField('harmonist-harmony-2', 'Harmony 2', 0x14a, optionList(['-2 oct', '-14th', '-13th', '-12th', '-11th', '-10th', '-9th', '-1 oct', '-7th', '-6th', '-5th', '-4th', '-3rd', '-2nd', 'Unison', '+2nd', '+3rd', '+4th', '+5th', '+6th', '+7th', '+1 oct', '+9th', '+10th', '+11th', '+12th', '+13th', '+14th', '+2 oct']), {
      visibleWhen: [{ parameterId: 'fx1-harmonist-voice', values: [1] }],
    }),
    numberField('harmonist-pre-delay-2', 'Voice 2 pre-delay (ms)', 0x14b, 0, 300, {
      width: 2, visibleWhen: [{ parameterId: 'fx1-harmonist-voice', values: [1] }],
    }),
    numberField('harmonist-level-2', 'Voice 2 level', 0x14d, 0, 100, {
      visibleWhen: [{ parameterId: 'fx1-harmonist-voice', values: [1] }],
    }),
    numberField('harmonist-feedback', 'Feedback', 0x14e), numberField('harmonist-direct-level', 'Direct level', 0x14f),
    selectField('harmonist-key', 'Master key', 0x398, optionList(['C (Am)', 'Db (Bbm)', 'D (Bm)', 'Eb (Cm)', 'E (C#m)', 'F (Dm)', 'F# (D#m)', 'G (Em)', 'Ab (Fm)', 'A (F#m)', 'Bb (Gm)', 'B (G#m)'])),
  ] },
  { type: 12, label: 'Overtone', fields: [
    numberField('overtone-detune', 'Detune', 0x83f), numberField('overtone-tone', 'Tone', 0x840, -50, 50, { displayOffset: -50 }),
    numberField('overtone-lower-level', 'Lower level', 0x841), numberField('overtone-upper-level', 'Upper level', 0x842),
    numberField('overtone-direct-level', 'Direct level', 0x843),
  ] },
  { type: 13, label: 'Feedbacker', fields: [
    numberField('feedbacker-depth', 'Depth', 0x846), toggleField('feedbacker-trigger', 'Trigger', 0x84d),
  ] },
  { type: 14, label: 'AC Processor', fields: [
    selectField('ac-processor-type', 'Type', 0x16d, optionList(['Small', 'Medium', 'Bright', 'Power'])),
    numberField('ac-processor-bass', 'Bass', 0x16e, -50, 50, { displayOffset: -50 }),
    numberField('ac-processor-middle', 'Middle', 0x16f, -50, 50, { displayOffset: -50 }),
    selectField('ac-processor-mid-frequency', 'Middle frequency', 0x170, eqFrequencyOptions),
    numberField('ac-processor-treble', 'Treble', 0x171, -50, 50, { displayOffset: -50 }),
    numberField('ac-processor-presence', 'Presence', 0x172, -50, 50, { displayOffset: -50 }), numberField('ac-processor-level', 'Level', 0x173),
  ] },
  { type: 15, label: 'Phaser', fields: [
    selectField('phaser-type', 'Type', 0x175, optionList(['4 stage', '8 stage', '12 stage', 'Bi-Phase'])),
    numberField('phaser-rate', 'Rate', 0x176, 0, 127, { options: tempoRateOptions }), numberField('phaser-depth', 'Depth', 0x177),
    numberField('phaser-manual', 'Manual', 0x178), numberField('phaser-resonance', 'Resonance', 0x179),
    numberField('phaser-step-rate', 'Step rate', 0x17a, 0, 127, { options: tempoRateOptions }),
    numberField('phaser-level', 'Effect level', 0x17b), numberField('phaser-direct-level', 'Direct level', 0x17c),
  ] },
  { type: 16, label: 'Flanger', fields: [
    numberField('flanger-rate', 'Rate', 0x17e, 0, 127, { options: tempoRateOptions }), numberField('flanger-depth', 'Depth', 0x17f),
    numberField('flanger-manual', 'Manual', 0x180), numberField('flanger-resonance', 'Resonance', 0x181),
    numberField('flanger-separation', 'Separation', 0x182), selectField('flanger-low-cut', 'Low cut', 0x183, optionList(['Flat', '55 Hz', '110 Hz', '165 Hz', '200 Hz', '280 Hz', '340 Hz', '400 Hz', '500 Hz', '630 Hz', '800 Hz'])),
    numberField('flanger-level', 'Effect level', 0x184), numberField('flanger-direct-level', 'Direct level', 0x185),
  ] },
  { type: 17, label: 'Tremolo', fields: [
    numberField('tremolo-wave', 'Wave shape', 0x187), numberField('tremolo-rate', 'Rate', 0x188, 0, 127, { options: tempoRateOptions }),
    numberField('tremolo-depth', 'Depth', 0x189), numberField('tremolo-level', 'Level', 0x18a),
  ] },
  { type: 18, label: 'Rotary', fields: [
    selectField('rotary-speed', 'Speed', 0x18c, optionList(['Slow', 'Fast'])), numberField('rotary-rate-slow', 'Rate slow', 0x18d, 0, 127, { options: tempoRateOptions }),
    numberField('rotary-rate-fast', 'Rate fast', 0x18e, 0, 127, { options: tempoRateOptions }),
    numberField('rotary-transition', 'Transition', 0x18f), numberField('rotary-balance', 'B/H balance', 0x191),
    numberField('rotary-level', 'Level', 0x192),
  ] },
  { type: 19, label: 'Uni-V', fields: [
    numberField('uni-v-rate', 'Rate', 0x194, 0, 127, { options: tempoRateOptions }), numberField('uni-v-depth', 'Depth', 0x195), numberField('uni-v-level', 'Level', 0x196),
  ] },
  { type: 20, label: 'Vibrato', fields: [
    numberField('vibrato-rate', 'Rate', 0x1a5, 0, 127, { options: tempoRateOptions }), numberField('vibrato-depth', 'Depth', 0x1a6),
    toggleField('vibrato-trigger', 'Trigger', 0x1a7), numberField('vibrato-rise-time', 'Rise time', 0x1a8), numberField('vibrato-level', 'Level', 0x1a9),
  ] },
  { type: 21, label: 'Chorus', fields: [
    selectField('chorus-mode', 'Mode', 0x84e, optionList(['Mono', 'Stereo 1', 'Stereo 2'])), numberField('chorus-rate', 'Rate', 0x84f, 0, 127, { options: tempoRateOptions }),
    numberField('chorus-depth', 'Depth', 0x850),
    selectField('chorus-low-cut', 'Low cut', 0x852, lowCutOptions), selectField('chorus-high-cut', 'High cut', 0x853, highCutOptions), numberField('chorus-level', 'Effect level', 0x854),
  ] },
  { type: 22, label: 'Sub Delay', fields: [
    selectField('sub-delay-type', 'Type', 0x1c3, optionList(['Mono', 'Pan'])), numberField('sub-delay-time', 'Time (ms)', 0x1c4, 1, 1000, { width: 2 }),
    numberField('sub-delay-feedback', 'Feedback', 0x1c6), selectField('sub-delay-high-cut', 'High cut', 0x1c7, highCutOptions),
    numberField('sub-delay-level', 'Effect level', 0x1c8, 0, 120), numberField('sub-delay-direct-level', 'Direct level', 0x1c9),
    numberField('sub-delay-tap-time', 'Tap time', 0x1ca),
  ] },
];

function effectDefinitions(sectionId: Gt1EffectSectionId, prefix: 'fx1' | 'fx2', selectorId: string): Gt1ParameterDefinition[] {
  return fxTemplates.flatMap((template) => {
    const delta = prefix === 'fx1'
      ? 0
      : template.type === 7 ? 0x0f
        : template.type === 12 ? -0x08
          : template.type === 13 || template.type === 21 ? 0x12
            : 0x10c;
    const group = `${prefix.toUpperCase()} · ${template.label}`;
    const visibleWhen = [{ parameterId: selectorId, values: [template.type] }];
    return template.fields.map((field) => {
      const fieldVisibility = field.visibleWhen?.map((condition) => ({
        ...condition,
        parameterId: condition.parameterId.replace('fx1-', `${prefix}-`),
      }));
      return definition(`${prefix}-${field.key}`, sectionId, group, {
        ...field,
        visibleWhen: fieldVisibility,
        offset: field.offset + delta,
      }, visibleWhen);
    });
  });
}

const effectSelectors: Gt1ParameterDefinition[] = [
  definition('fx1-enabled', 'fx1-comp', 'FX1', toggleField('enabled', 'Ligado', 0x0c0)),
  definition('fx1-type', 'fx1-comp', 'FX1', selectField('type', 'Efeito', 0x0c1, fxTypes)),
  definition('fx2-enabled', 'fx2-mod', 'FX2', toggleField('enabled', 'Ligado', 0x1cc)),
  definition('fx2-type', 'fx2-mod', 'FX2', selectField('type', 'Efeito', 0x1cd, fxTypes)),
];

const delayDefinitions: Gt1ParameterDefinition[] = [
  definition('delay-enabled', 'delay', 'Delay', toggleField('enabled', 'Ligado', 0x2e0)),
  definition('delay-type', 'delay', 'Delay', selectField('type', 'Tipo', 0x2e1, optionList(['Standard', 'Pan', 'Reverse', 'Analog', 'Tape Echo', 'Modulate', 'Tera Echo']))),
  ...[
    numberField('time', 'Time (ms)', 0x2e2, 1, 2000, { width: 2 }),
    numberField('feedback', 'Feedback', 0x2e4), selectField('high-cut', 'High cut', 0x2e5, highCutOptions),
    numberField('effect-level', 'Effect level', 0x2e6, 0, 120),
  ].map((field) => definition(`delay-${field.key}`, 'delay', 'Delay · Standard–Modulate', field, [{ parameterId: 'delay-type', values: [0, 1, 2, 3, 4, 5] }])),
  definition('delay-tap-time', 'delay', 'Delay · Pan', numberField('tap-time', 'Tap time (%)', 0x2e8), [{ parameterId: 'delay-type', values: [1] }]),
  definition('delay-mod-rate', 'delay', 'Delay · Modulate', numberField('mod-rate', 'Modulation rate', 0x2f3), [{ parameterId: 'delay-type', values: [5] }]),
  definition('delay-mod-depth', 'delay', 'Delay · Modulate', numberField('mod-depth', 'Modulation depth', 0x2f4), [{ parameterId: 'delay-type', values: [5] }]),
  definition('delay-tera-time', 'delay', 'Delay · Tera Echo', numberField('tera-time', 'Time', 0x86a), [{ parameterId: 'delay-type', values: [6] }]),
  definition('delay-tera-feedback', 'delay', 'Delay · Tera Echo', numberField('tera-feedback', 'Feedback', 0x86b), [{ parameterId: 'delay-type', values: [6] }]),
  definition('delay-tera-tone', 'delay', 'Delay · Tera Echo', numberField('tera-tone', 'Tone', 0x86c, -50, 50, { displayOffset: -50 }), [{ parameterId: 'delay-type', values: [6] }]),
  definition('delay-tera-level', 'delay', 'Delay · Tera Echo', numberField('tera-level', 'Effect level', 0x86d), [{ parameterId: 'delay-type', values: [6] }]),
  definition('delay-tera-direct-level', 'delay', 'Delay · Tera Echo', numberField('tera-direct-level', 'Direct level', 0x86e), [{ parameterId: 'delay-type', values: [6] }]),
  definition('delay-tera-hold', 'delay', 'Delay · Tera Echo', toggleField('tera-hold', 'Hold', 0x86f), [{ parameterId: 'delay-type', values: [6] }]),
];

const reverbDefinitions: Gt1ParameterDefinition[] = [
  definition('reverb-enabled', 'reverb', 'Reverb', toggleField('enabled', 'Ligado', 0x310)),
  definition('reverb-type', 'reverb', 'Reverb', selectField('type', 'Tipo', 0x311, optionList(['Ambience', 'Room', 'Hall 1', 'Hall 2', 'Plate', 'Spring', 'Mod', 'Delay']))),
  definition('reverb-time', 'reverb', 'Reverb', numberField('time', 'Reverb time (s)', 0x312, 1, 100, { displayOffset: 1, displayDivisor: 10 })),
  definition('reverb-pre-delay', 'reverb', 'Reverb', numberField('pre-delay', 'Pre-delay (ms)', 0x313, 0, 300, { width: 2 })),
  definition('reverb-low-cut', 'reverb', 'Reverb · Filter', selectField('low-cut', 'Low cut', 0x315, lowCutOptions)),
  definition('reverb-high-cut', 'reverb', 'Reverb · Filter', selectField('high-cut', 'High cut', 0x316, highCutOptions)),
  definition('reverb-level', 'reverb', 'Reverb · Level', numberField('level', 'Effect level', 0x318)),
  definition('reverb-direct-level', 'reverb', 'Reverb · Level', numberField('direct-level', 'Direct level', 0x319)),
  definition('reverb-spring-sens', 'reverb', 'Reverb · Spring', numberField('spring-sens', 'Spring sensitivity', 0x31a), [{ parameterId: 'reverb-type', values: [5] }]),
  ...[
    numberField('delay-time', 'Delay time (ms)', 0x870, 1, 650, { width: 2 }),
    numberField('delay-feedback', 'Feedback', 0x872), selectField('delay-high-cut', 'High cut', 0x873, highCutOptions),
    numberField('delay-level', 'Effect level', 0x874, 0, 120), numberField('delay-direct-level', 'Direct level', 0x875),
  ].map((field) => definition(`reverb-${field.key}`, 'reverb', 'Reverb · Delay', field, [{ parameterId: 'reverb-type', values: [7] }])),
];

export const parameterDefinitions: Gt1ParameterDefinition[] = [
  ...effectSelectors.slice(0, 2),
  ...effectDefinitions('fx1-comp', 'fx1', 'fx1-type'),
  ...odDefinitions,
  ...preampDefinitions,
  ...effectSelectors.slice(2),
  ...effectDefinitions('fx2-mod', 'fx2', 'fx2-type'),
  ...delayDefinitions,
  ...reverbDefinitions,
];

const definitionsById = new Map(parameterDefinitions.map((parameter) => [parameter.id, parameter]));

export function getVisibleParameterDefinitions(patch: Gt1Patch, sectionId: Gt1EffectSectionId): Gt1ParameterDefinition[] {
  return parameterDefinitions.filter((parameter) => {
    if (parameter.sectionId !== sectionId) return false;
    if (!parameter.visibleWhen) return true;
    return parameter.visibleWhen.every((condition) => {
      const selector = definitionsById.get(condition.parameterId);
      return Boolean(selector && condition.values.includes(getParameterValue(patch, selector)));
    });
  });
}

const nameParameter: Gt1ParameterDefinition = {
  id: 'patch-name', group: 'Patch', label: 'Nome', offset: 0, control: 'number', min: 0x20, max: 0x7e,
};

export const patchNameDefinition = nameParameter;

export function getParameterValue(patch: Gt1Patch, parameter: Gt1ParameterDefinition): number {
  const width = parameter.width ?? 1;
  let rawValue = 0;
  for (let byte = 0; byte < width; byte += 1) {
    const offset = parameter.offset + byte;
    const block = Math.floor(offset / 128);
    const byteOffset = offset % 128;
    const frame = patch.frames.find((candidate) => candidate[9] === block && candidate[10] === 0);
    if (!frame || byteOffset >= frame.length - 13) return parameter.min;
    rawValue = rawValue * 128 + (frame[11 + byteOffset] ?? 0);
  }
  return rawValue + (parameter.displayOffset ?? 0);
}

export function getPatchName(patch: Gt1Patch): string {
  return patch.name;
}

export function updatePatchParameter(patch: Gt1Patch, parameterId: string, value: number): Gt1Patch {
  const parameter = definitionsById.get(parameterId);
  if (!parameter || !Number.isInteger(value) || value < parameter.min || value > parameter.max) return patch;

  const width = parameter.width ?? 1;
  let rawValue = value - (parameter.displayOffset ?? 0);
  if (!Number.isInteger(rawValue) || rawValue < 0 || rawValue >= 128 ** width) return patch;

  const frames = patch.frames.map((frame) => new Uint8Array(frame));
  const changedFrameIndexes = new Set<number>();
  for (let byte = width - 1; byte >= 0; byte -= 1) {
    const offset = parameter.offset + byte;
    const block = Math.floor(offset / 128);
    const byteOffset = offset % 128;
    const frameIndex = frames.findIndex((candidate) => candidate[9] === block && candidate[10] === 0);
    if (frameIndex < 0 || 11 + byteOffset >= frames[frameIndex].length - 2) return patch;
    frames[frameIndex][11 + byteOffset] = rawValue % 128;
    rawValue = Math.floor(rawValue / 128);
    changedFrameIndexes.add(frameIndex);
  }

  for (const frameIndex of changedFrameIndexes) frames[frameIndex].set(refreshFrameChecksum(frames[frameIndex]));
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
