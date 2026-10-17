const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  });
  module._compile(outputText, filename);
};

const { hasValidFrameChecksum, refreshFrameChecksum } = require('../src/gt1/checksum.ts');
const {
  effectSections,
  getParameterValue,
  getVisibleParameterDefinitions,
  parameterDefinitions,
  updatePatchParameter,
} = require('../src/gt1/parameterMap.ts');
const { usesPercentSlider } = require('../src/gt1/controlPresentation.ts');

test('lists the six GT-1 effect tabs in panel order', () => {
  assert.deepEqual(effectSections.map((section) => section.label), [
    'FX1/Comp', 'OD/DS', 'Preamp', 'FX2/MOD', 'Delay', 'Reverb',
  ]);
});

test('maps effect selectors to their GT-1 patch offsets', () => {
  const offsets = Object.fromEntries(parameterDefinitions.map(({ id, offset }) => [id, offset]));
  assert.equal(offsets['fx1-enabled'], 0xc0);
  assert.equal(offsets['fx1-type'], 0xc1);
  assert.equal(offsets['fx2-enabled'], 0x1cc);
  assert.equal(offsets['fx2-type'], 0x1cd);
  assert.equal(offsets['delay-enabled'], 0x2e0);
  assert.equal(offsets['delay-type'], 0x2e1);
  assert.equal(offsets['reverb-enabled'], 0x310);
  assert.equal(offsets['reverb-type'], 0x311);
});

test('keeps every parameter ID unique and defines each effect section', () => {
  const ids = parameterDefinitions.map(({ id }) => id);
  assert.equal(new Set(ids).size, ids.length);

  for (const section of effectSections) {
    assert.ok(parameterDefinitions.some(({ sectionId }) => sectionId === section.id), `${section.label} has parameters`);
  }
});

test('uses a slider only for numeric parameters whose full range is 0 to 100', () => {
  assert.equal(usesPercentSlider({ control: 'number', min: 0, max: 100 }), true);
  assert.equal(usesPercentSlider({ control: 'number', min: 0, max: 120 }), false);
  assert.equal(usesPercentSlider({ control: 'number', min: -50, max: 50 }), false);
  assert.equal(usesPercentSlider({ control: 'select', min: 0, max: 100 }), false);
});

test('includes all eight compressor algorithms for the FX1 Compressor effect', () => {
  const compressor = parameterDefinitions.find(({ id }) => id === 'fx1-compressor-type');
  assert.deepEqual(compressor.options.map(({ value }) => value), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(compressor.options[7].label, 'Stereo');
});

test('selects Compressor as one exclusive FX1 effect type', () => {
  const compressorPatch = makePatch({ 0xc1: 0 });
  const twahPatch = makePatch({ 0xc1: 2 });
  const compressorIds = getVisibleParameterDefinitions(compressorPatch, 'fx1-comp').map(({ id }) => id);
  const twahIds = getVisibleParameterDefinitions(twahPatch, 'fx1-comp').map(({ id }) => id);

  assert.ok(compressorIds.includes('fx1-type'));
  assert.ok(compressorIds.includes('fx1-compressor-type'));
  assert.ok(compressorIds.includes('fx1-compressor-sustain'));
  assert.ok(!compressorIds.includes('fx1-twah-sens'));
  assert.ok(twahIds.includes('fx1-twah-sens'));
  assert.ok(!twahIds.includes('fx1-compressor-sustain'));
  assert.ok(!compressorIds.includes('comp-enabled'));
  assert.ok(!compressorIds.includes('comp-type'));
});

test('shows only the FX1 and FX2 controls for the selected type', () => {
  const patch = makePatch({ 0xc1: 2, 0x1cd: 15 });
  const fx1Ids = getVisibleParameterDefinitions(patch, 'fx1-comp').map(({ id }) => id);
  const fx2Ids = getVisibleParameterDefinitions(patch, 'fx2-mod').map(({ id }) => id);

  assert.ok(fx1Ids.includes('fx1-twah-sens'));
  assert.ok(!fx1Ids.includes('fx1-comp-sustain'));
  assert.ok(fx2Ids.includes('fx2-phaser-rate'));
  assert.ok(!fx2Ids.includes('fx2-graphic-eq-100hz'));
});

test('maps the documented chorus and rotary controls without hidden placeholders', () => {
  const chorusPatch = makePatch({ 0xc1: 21 });
  const chorusIds = getVisibleParameterDefinitions(chorusPatch, 'fx1-comp').map(({ id }) => id);
  const rotaryPatch = makePatch({ 0xc1: 18 });
  const rotaryParameters = getVisibleParameterDefinitions(rotaryPatch, 'fx1-comp');
  const rotaryIds = rotaryParameters.map(({ id }) => id);

  assert.ok(chorusIds.includes('fx1-chorus-rate'));
  assert.ok(chorusIds.includes('fx1-chorus-low-cut'));
  assert.ok(!chorusIds.includes('fx1-chorus-pre-delay'));
  assert.ok(rotaryIds.includes('fx1-rotary-transition'));
  assert.ok(rotaryIds.includes('fx1-rotary-balance'));
  assert.ok(!rotaryIds.includes('fx1-rotary-fall-time'));
  assert.equal(rotaryParameters.find(({ id }) => id === 'fx1-rotary-transition').offset, 0x18f);
  assert.equal(rotaryParameters.find(({ id }) => id === 'fx1-rotary-balance').offset, 0x191);
});

test('shows delay and reverb parameters for their selected type', () => {
  const patch = makePatch({ 0x2e1: 5, 0x311: 5 });
  const delayIds = getVisibleParameterDefinitions(patch, 'delay').map(({ id }) => id);
  const reverbIds = getVisibleParameterDefinitions(patch, 'reverb').map(({ id }) => id);

  assert.ok(delayIds.includes('delay-mod-rate'));
  assert.ok(!delayIds.includes('delay-tera-time'));
  assert.ok(reverbIds.includes('reverb-spring-sens'));
  assert.ok(!reverbIds.includes('reverb-density'));
});

test('shows second pitch and harmony voices only when two voices are selected', () => {
  const singleVoicePatch = makePatch({ 0xc1: 10, 0x135: 0, 0x1cd: 11, 0x251: 0 });
  const dualVoicePatch = makePatch({ 0xc1: 10, 0x135: 1, 0x1cd: 11, 0x251: 1 });
  const fx1Single = getVisibleParameterDefinitions(singleVoicePatch, 'fx1-comp').map(({ id }) => id);
  const fx2Single = getVisibleParameterDefinitions(singleVoicePatch, 'fx2-mod').map(({ id }) => id);
  const fx1Dual = getVisibleParameterDefinitions(dualVoicePatch, 'fx1-comp').map(({ id }) => id);
  const fx2Dual = getVisibleParameterDefinitions(dualVoicePatch, 'fx2-mod').map(({ id }) => id);

  assert.ok(!fx1Single.includes('fx1-pitch-shifter-voice-2-pitch'));
  assert.ok(!fx2Single.includes('fx2-harmonist-harmony-2'));
  assert.ok(fx1Dual.includes('fx1-pitch-shifter-voice-2-pitch'));
  assert.ok(fx2Dual.includes('fx2-harmonist-harmony-2'));
  assert.ok(fx2Dual.includes('fx2-harmonist-level-2'));
});

test('writes selectors and controls to independent bytes with valid checksums', () => {
  const patch = makePatch();
  const updated = updatePatchParameter(patch, 'fx2-type', 15);
  const fx2Type = parameterDefinitions.find(({ id }) => id === 'fx2-type');

  assert.equal(getParameterValue(updated, fx2Type), 15);
  assert.equal(getParameterValue(patch, fx2Type), 0);
  assert.notEqual(updated.frames[3][11 + 0x4d], patch.frames[3][11 + 0x4d]);
  assert.equal(hasValidFrameChecksum(updated.frames[3]), true);
});

test('uses signed ranges for OD/DS and the preamp T-Comp control', () => {
  const ranges = Object.fromEntries(parameterDefinitions.map(({ id, min, max }) => [id, [min, max]]));
  assert.deepEqual(ranges['od-bottom'], [-50, 50]);
  assert.deepEqual(ranges['od-tone'], [-50, 50]);
  assert.deepEqual(ranges['preamp-a-tcomp'], [-10, 10]);
  assert.deepEqual(ranges['preamp-b-tcomp'], [-10, 10]);
});

test('translates signed values to and from the GT-1 byte representation', () => {
  const patch = makePatch({ 0x33: 0 });
  const definition = parameterDefinitions.find(({ id }) => id === 'od-bottom');
  assert.equal(getParameterValue(patch, definition), -50);

  const updated = updatePatchParameter(patch, 'od-bottom', 25);
  assert.equal(getParameterValue(updated, definition), 25);
  assert.equal(updated.frames[0][11 + 0x33], 75);
});

test('reads and writes two-byte delay times as 14-bit GT-1 values', () => {
  const patch = makePatch();
  const updated = updatePatchParameter(patch, 'delay-time', 1294);
  const definition = parameterDefinitions.find(({ id }) => id === 'delay-time');
  const frame = updated.frames[5];

  assert.equal(getParameterValue(updated, definition), 1294);
  assert.equal(frame[11 + 0x62], 10);
  assert.equal(frame[11 + 0x63], 14);
  assert.equal(hasValidFrameChecksum(frame), true);
});

function makePatch(initialValues = {}) {
  const frames = Array.from({ length: 17 }, (_, block) => {
    const frame = new Uint8Array(141);
    frame.set([0xf0, 0x41, 0x00, 0x00, 0x00, 0x60, 0x12, 0x60, 0x00, block, 0x00]);
    frame[140] = 0xf7;
    return refreshFrameChecksum(frame);
  });
  for (const [offsetText, value] of Object.entries(initialValues)) {
    const offset = Number(offsetText);
    const frame = frames[Math.floor(offset / 128)];
    frame[11 + (offset % 128)] = value;
    frames[Math.floor(offset / 128)] = refreshFrameChecksum(frame);
  }
  return { id: 'test', name: 'Test', frames, sourceFormat: 'device', complete: true };
}
