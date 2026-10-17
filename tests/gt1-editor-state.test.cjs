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

const { getPatchSwitchDecision, patchSwitchReducer } = require('../src/gt1/patchSwitchState.ts');

test('selecting the active patch is a no-op', () => {
  assert.equal(getPatchSwitchDecision('active', 'active', true), 'noop');
});

test('selecting a different clean patch activates it directly', () => {
  assert.equal(getPatchSwitchDecision('active', 'target', false), 'activate');
});

test('selecting a different dirty patch requires confirmation', () => {
  assert.equal(getPatchSwitchDecision('active', 'target', true), 'confirm');
});

test('cancel keeps active selection and dirty IDs while clearing the target', () => {
  const state = { activePatchId: 'active', targetPatchId: 'target', dirtyPatchIds: new Set(['active', 'other']), phase: 'confirming' };
  const next = patchSwitchReducer(state, { type: 'cancel' });

  assert.equal(next.activePatchId, 'active');
  assert.equal(next.targetPatchId, null);
  assert.deepEqual([...next.dirtyPatchIds], ['active', 'other']);
  assert.equal(next.phase, 'idle');
});

test('discard retains dirty data until verified target activation succeeds', () => {
  const state = { activePatchId: 'active', targetPatchId: 'target', dirtyPatchIds: new Set(['active', 'other']), phase: 'confirming' };
  const switching = patchSwitchReducer(state, { type: 'discard' });

  assert.equal(switching.phase, 'activating');
  assert.deepEqual([...switching.dirtyPatchIds], ['active', 'other']);

  const activated = patchSwitchReducer(switching, { type: 'activation-succeeded' });
  assert.equal(activated.activePatchId, 'target');
  assert.equal(activated.targetPatchId, null);
  assert.deepEqual([...activated.dirtyPatchIds], ['other']);
  assert.equal(activated.phase, 'idle');
});

test('save failure leaves the old active patch and its dirty data pending', () => {
  const state = { activePatchId: 'active', targetPatchId: 'target', dirtyPatchIds: new Set(['active']), phase: 'saving' };
  const failed = patchSwitchReducer(state, { type: 'operation-failed' });

  assert.equal(failed.activePatchId, 'active');
  assert.equal(failed.targetPatchId, 'target');
  assert.deepEqual([...failed.dirtyPatchIds], ['active']);
  assert.equal(failed.phase, 'confirming');
});
