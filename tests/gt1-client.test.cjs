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

const { Gt1Client } = require('../src/gt1/client.ts');
const { upsertUserPatch } = require('../src/gt1/editorState.ts');
const { composePatchLibrary, findMatchingUserPatch, mergeUserPatchScan } = require('../src/gt1/userPatchQuery.ts');
const { decodePatchResponse, patchContentsEqual } = require('../src/gt1/sysex.ts');

test('scans user patch slots sequentially from U01 through U99', async () => {
  const transport = new FakeTransport();
  const progress = [];
  const client = new Gt1Client(transport);

  const result = await client.readUserPatches(0, (update) => progress.push(update));

  assert.equal(result.patches.length, 99);
  assert.equal(result.failures.length, 0);
  assert.deepEqual(result.patches.map(({ userPatch }) => userPatch), Array.from({ length: 99 }, (_, index) => index + 1));
  assert.equal(transport.requests.length, 99 * 3);
  assert.deepEqual(transport.requests.filter((_, index) => index % 3 === 0).map((request) => request[9]), Array.from({ length: 99 }, (_, index) => index));
  assert.ok(transport.requests.every((request, index) => request[10] === [0, 8, 16][index % 3]));
  assert.deepEqual(progress.map(({ completed }) => completed), Array.from({ length: 99 }, (_, index) => index + 1));
  assert.equal(result.patches[0].name, 'U01');
  assert.equal(result.patches[98].name, 'U99');
});

test('lists all user slots using Tone Studio name reads instead of full patch transfers', async () => {
  const transport = new PatchNameScanTransport();
  const client = new Gt1Client(transport);

  const result = await client.readUserPatchNames(0);

  assert.equal(result.patches.length, 99);
  assert.equal(result.failures.length, 0);
  assert.equal(transport.requests.length, 99);
  assert.deepEqual(transport.requests.slice(0, 3).map((request) => Array.from(request.subarray(8, 12))), [
    [0x10, 0x00, 0x00, 0x00],
    [0x10, 0x01, 0x00, 0x00],
    [0x10, 0x02, 0x00, 0x00],
  ]);
  assert.equal(transport.requests.every((request) => request[7] === 0x11 && request[12] === 0x00 && request[13] === 0x00 && request[14] === 0x00 && request[15] === 0x10), true);
  assert.equal(result.patches[0].name, 'U01');
  assert.equal(result.patches[98].name, 'U99');
  assert.equal(result.patches.every((patch) => patch.complete === false && patch.frames.length === 0), true);
});

test('continues scanning after one slot returns an invalid reply address', async () => {
  const transport = new FakeTransport({ invalidSlot: 3 });
  const client = new Gt1Client(transport);

  const result = await client.readUserPatches(0);

  assert.equal(result.patches.length, 98);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].userPatch, 3);
  assert.equal(result.patches.some(({ userPatch }) => userPatch === 4), true);
  assert.equal(transport.requests.length, 98 * 3 + 1);
});

test('enables the Tone Studio editor communication mode before patch exchange', async () => {
  const transport = new HandshakeTransport();
  const client = new Gt1Client(transport);

  await client.initializeEditorCommunication(0);

  assert.equal(transport.messages.length, 2);
  assert.deepEqual(Array.from(transport.messages[0].subarray(7, 16)), [
    0x11, 0x7f, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01,
  ]);
  assert.deepEqual(Array.from(transport.messages[1].subarray(7, 13)), [
    0x12, 0x7f, 0x00, 0x00, 0x01, 0x01,
  ]);
});

test('refreshes a device slot in place and preserves its local edits while dirty', () => {
  const previous = { id: 'gt1-user-01', userPatch: 1, sourceFormat: 'device', name: 'Old', frames: [], complete: true };
  const refreshed = { ...previous, name: 'New' };
  const another = { id: 'gt1-user-02', userPatch: 2, sourceFormat: 'device', name: 'Another', frames: [], complete: true };

  const refreshedList = upsertUserPatch([previous], refreshed, new Set());
  assert.deepEqual(refreshedList.map(({ id }) => id), ['gt1-user-01']);
  assert.equal(refreshedList[0].name, 'New');
  assert.deepEqual(upsertUserPatch([previous], refreshed, new Set([previous.id])), [previous]);
  assert.deepEqual(upsertUserPatch([previous], another, new Set()).map(({ userPatch }) => userPatch), [1, 2]);
});

test('partialUserPatchScanPreservesCachedFailedSlotsAndRefreshesSuccessfulSlots', () => {
  const cached = [
    { id: 'gt1-user-01', userPatch: 1, sourceFormat: 'device', name: 'Old U01', frames: [], complete: true },
    { id: 'gt1-user-02', userPatch: 2, sourceFormat: 'device', name: 'Cached U02', frames: [], complete: true },
  ];
  const scanned = [
    { id: 'gt1-user-01', userPatch: 1, sourceFormat: 'device', name: 'New U01', frames: [], complete: true },
    { id: 'gt1-user-03', userPatch: 3, sourceFormat: 'device', name: 'New U03', frames: [], complete: true },
  ];

  const merged = mergeUserPatchScan(cached, scanned, [{ userPatch: 2 }]);

  assert.deepEqual(merged.map(({ userPatch }) => userPatch), [1, 2, 3]);
  assert.deepEqual(merged.map(({ name }) => name), ['New U01', 'Cached U02', 'New U03']);
});

test('a compact name scan keeps the last complete cached patch payload for each slot', () => {
  const cached = [{ id: 'gt1-user-01', userPatch: 1, sourceFormat: 'device', name: 'Previous name', frames: [Uint8Array.of(1, 2, 3)], complete: true }];
  const names = [{ id: 'gt1-user-01', userPatch: 1, sourceFormat: 'device', name: 'Saved name', frames: [], complete: false }];

  const merged = mergeUserPatchScan(cached, names, []);

  assert.equal(merged[0].name, 'Saved name');
  assert.equal(merged[0].complete, true);
  assert.deepEqual(merged[0].frames, cached[0].frames);
});

test('matches the live pedal buffer to the corresponding user slot', () => {
  const makePatch = (id, userPatch, nameByte) => ({
    id,
    userPatch,
    complete: true,
    frames: Array.from({ length: 17 }, (_, page) => {
      const frame = new Uint8Array(139);
      frame[9] = page;
      if (page === 0) frame[11] = nameByte;
      return frame;
    }),
  });
  const livePatch = makePatch('device-current', undefined, 42);
  const matchingSlot = makePatch('gt1-user-12', 12, 42);
  const otherSlot = makePatch('gt1-user-13', 13, 43);

  assert.equal(findMatchingUserPatch(livePatch, [otherSlot, matchingSlot]), matchingSlot);
  assert.equal(findMatchingUserPatch(livePatch, [otherSlot]), undefined);
});

test('userPatchScanProgressRetainsCachedSlotsUntilTheyAreRead', () => {
  const cached = [
    { id: 'gt1-user-01', userPatch: 1, sourceFormat: 'device', name: 'Old U01', frames: [], complete: true },
    { id: 'gt1-user-02', userPatch: 2, sourceFormat: 'device', name: 'Cached U02', frames: [], complete: true },
  ];
  const progress = [{ ...cached[0], name: 'New U01' }];

  const merged = mergeUserPatchScan(cached, progress, []);

  assert.deepEqual(merged.map(({ userPatch }) => userPatch), [1, 2]);
  assert.deepEqual(merged.map(({ name }) => name), ['New U01', 'Cached U02']);
});

test('refreshing the device snapshot keeps session edits visible as overlays', () => {
  const oldDevicePatch = { id: 'gt1-user-01', userPatch: 1, sourceFormat: 'device', name: 'Device old', frames: [], complete: true };
  const newDevicePatch = { ...oldDevicePatch, name: 'Device refreshed' };
  const editedOverlay = { ...oldDevicePatch, name: 'Unsaved edit' };
  const imported = { id: 'imported-1', sourceFormat: 'syx', name: 'Imported', frames: [], complete: true };

  const visible = composePatchLibrary([newDevicePatch], [imported], { [oldDevicePatch.id]: editedOverlay });

  assert.deepEqual(visible.map(({ name }) => name), ['Unsaved edit', 'Imported']);
});

test('verifies a user-slot write by reading back the exact patch payload', async () => {
  const transport = new WriteVerifyTransport();
  const client = new Gt1Client(transport);
  const patch = decodePatchResponse(makeGt1CompactReplyFrames([0x60, 0x00], 'PATCH TEST'));
  const readBack = decodePatchResponse(makeGt1CompactReplyFrames([0x10, 0x62], 'PATCH TEST'), [0x10, 0x62]);
  assert.equal(patchContentsEqual(patch, readBack), true);

  const verified = await client.writeUserPatchAndVerify(patch, 0, 99);

  assert.equal(verified.userPatch, 99);
  assert.equal(transport.writes.length, 24);
  assert.ok(transport.writes.slice(0, 23).every((frame) => frame[8] === 0x60 && frame[9] === 0x00));
  assert.deepEqual(Array.from(transport.writes[23].subarray(8, 14)), [0x7f, 0x00, 0x01, 0x04, 0x00, 0x62]);
});

test('reports a user-slot write as unverified when the read-back payload differs', async () => {
  const transport = new WriteVerifyTransport({ replyName: 'OLD PATCH' });
  const client = new Gt1Client(transport);
  const patch = decodePatchResponse(makeGt1CompactReplyFrames([0x60, 0x00], 'PATCH TEST'));

  await assert.rejects(client.writeUserPatchAndVerify(patch, 0, 1), { code: 'write-verification-failed' });
});

test('selects U11 through the current-patch-number command without copying data into the edit buffer', async () => {
  const transport = new PatchSelectionTransport();
  const client = new Gt1Client(transport);

  const active = await client.selectUserPatch(0, 11);

  assert.equal(transport.midiMessages.length, 0);
  const selectionWrites = transport.writes.filter((bytes) => bytes[8] === 0x00 && bytes[9] === 0x01 && bytes[10] === 0x00 && bytes[11] === 0x00);
  assert.equal(selectionWrites.length, 1);
  assert.deepEqual(Array.from(selectionWrites[0].subarray(12, 14)), [0x00, 0x0a]);
  assert.equal(transport.writes.some((bytes) => bytes[8] === 0x60), false);
  assert.equal(transport.requests.length, 3);
  assert.equal(active.userPatch, 11);
  assert.equal(active.complete, true);
  assert.equal(active.name, 'U11');
});

test('retries the Tone Studio selection command when the pedal reports a different current slot', async () => {
  const transport = new PatchSelectionTransport({ wrongFirstReply: true });
  const client = new Gt1Client(transport);

  const active = await client.selectUserPatch(0, 11);

  assert.equal(transport.writes.filter((bytes) => bytes[8] === 0x00 && bytes[9] === 0x01).length, 2);
  assert.equal(active.userPatch, 11);
});

test('loads an imported patch into the temporary buffer without a patch_write command', async () => {
  const transport = new WriteVerifyTransport();
  const client = new Gt1Client(transport);
  const patch = decodePatchResponse(makeGt1CompactReplyFrames([0x60, 0x00], 'PATCH TEST'));
  patch.id = 'imported-1';

  const active = await client.loadPatchToEditBufferAndVerify(patch, 0);

  assert.equal(active.id, 'imported-1');
  assert.equal(active.name, patch.name);
  assert.equal(transport.writes.length, 23);
  assert.equal(transport.writes.some((frame) => frame[8] === 0x7f && frame[10] === 0x01 && frame[11] === 0x04), false);
});

test('live parameter edit sends one DT1 frame and returns the changed patch', async () => {
  const transport = new SendCaptureTransport();
  const client = new Gt1Client(transport);
  const patch = decodePatchResponse(makeGt1CompactReplyFrames([0x60, 0x00], 'PATCH TEST'));

  const updated = await client.setParameter(patch, 'fx1-type', 1);

  assert.equal(updated.frames[1][11 + 0x41], 1);
  assert.equal(transport.messages.length, 1);
  assert.deepEqual(Array.from(transport.messages[0].subarray(8, 13)), [0x60, 0x00, 0x01, 0x41, 0x01]);
  assert.equal(transport.messages.some((frame) => frame[8] === 0x7f && frame[10] === 0x01 && frame[11] === 0x04), false);
});

test('patch name edit sends one live frame without a permanent patch_write command', async () => {
  const transport = new SendCaptureTransport();
  const client = new Gt1Client(transport);
  const patch = decodePatchResponse(makeGt1CompactReplyFrames([0x60, 0x00], 'PATCH TEST'));

  const updated = await client.setPatchName(patch, 'New Ω');

  assert.equal(updated.name, 'New');
  assert.equal(transport.messages.length, 1);
  assert.deepEqual(Array.from(transport.messages[0].subarray(8, 12)), [0x60, 0x00, 0x00, 0x00]);
  assert.equal(transport.messages[0].subarray(12, 28).length, 16);
  assert.equal(transport.messages.some((frame) => frame[8] === 0x7f && frame[10] === 0x01 && frame[11] === 0x04), false);
});

test('rejects a patch name edit for an incomplete patch before sending', async () => {
  const transport = new SendCaptureTransport();
  const client = new Gt1Client(transport);
  const incomplete = { id: 'incomplete', name: 'Partial', frames: [], sourceFormat: 'syx', complete: false };

  await assert.rejects(client.setPatchName(incomplete, 'New name'), { code: 'incomplete-patch' });
  assert.equal(transport.messages.length, 0);
});

class PatchNameScanTransport {
  listeners = new Set();
  requests = [];

  async sendSysEx(bytes) {
    this.requests.push(new Uint8Array(bytes));
    const slot = bytes[9] + 1;
    const data = Buffer.alloc(16, 0x20);
    Buffer.from(`U${String(slot).padStart(2, '0')}`).copy(data);
    const frame = makeGt1WireFrame([bytes[8], bytes[9]], 0, 0, data);
    for (const listener of this.listeners) listener(frame);
  }

  onSysEx(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

class FakeTransport {
  listeners = new Set();
  requests = [];

  constructor({ invalidSlot } = {}) {
    this.invalidSlot = invalidSlot;
  }

  async sendSysEx(bytes) {
    this.requests.push(new Uint8Array(bytes));
    const requestedSlot = bytes[9] + 1;
    const address = [bytes[8], bytes[9]];
    if (requestedSlot === this.invalidSlot) address[1] += 1;
    emitToneStudioReadRange(this.listeners, address, bytes[10], makePatchPayload(`U${String(requestedSlot).padStart(2, '0')}`));
  }

  onSysEx(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

class PatchSelectionTransport {
  listeners = new Set();
  writes = [];
  requests = [];
  midiMessages = [];
  currentPatch = 11;
  currentBuffer = makePatchPayload('U11');

  constructor({ wrongFirstReply = false } = {}) {
    this.wrongFirstReply = wrongFirstReply;
  }

  async sendSysEx(bytes) {
    if (bytes[7] === 0x12) {
      this.writes.push(new Uint8Array(bytes));
      if (bytes[8] === 0x00 && bytes[9] === 0x01 && bytes[10] === 0x00 && bytes[11] === 0x00) {
        this.currentPatch = bytes[12] * 128 + bytes[13] + 1;
        const response = this.wrongFirstReply && this.writes.filter((frame) => frame[8] === 0x00 && frame[9] === 0x01).length === 1
          ? [0x00, 0x00]
          : [bytes[12], bytes[13]];
        const reply = makeGt1WireFrame([0x00, 0x01], 0x00, 0x00, response);
        for (const listener of this.listeners) listener(reply);
      }
      return;
    }

    this.requests.push(new Uint8Array(bytes));
    emitToneStudioReadRange(this.listeners, [0x60, 0x00], bytes[10], this.currentBuffer);
  }

  async sendMidiMessage(bytes) {
    this.midiMessages.push(new Uint8Array(bytes));
  }

  onSysEx(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

class SendCaptureTransport {
  messages = [];

  async sendSysEx(bytes) {
    this.messages.push(new Uint8Array(bytes));
  }

  onSysEx() {
    return () => undefined;
  }
}

class WriteVerifyTransport extends FakeTransport {
  writes = [];
  storedPayload = new Uint8Array(17 * 128);

  constructor({ replyName = 'PATCH TEST' } = {}) {
    super();
    this.replyName = replyName;
  }

  async sendSysEx(bytes) {
    if (bytes[7] === 0x12) {
      this.writes.push(new Uint8Array(bytes));
      if (bytes[8] === 0x60 && bytes[9] === 0x00) {
        this.storedPayload.set(bytes.subarray(12, bytes.length - 2), bytes[10] * 128 + bytes[11]);
      }
      return;
    }
    const payload = makePatchPayload(this.replyName);
    payload.set(this.storedPayload);
    Buffer.from(this.replyName).copy(payload);
    emitToneStudioReadRange(this.listeners, [bytes[8], bytes[9]], bytes[10], payload);
  }
}

class HandshakeTransport {
  listeners = new Set();
  messages = [];

  async sendSysEx(bytes) {
    this.messages.push(new Uint8Array(bytes));
    if (bytes[7] !== 0x11) return;
    const frame = makeGt1WireFrame([0x7f, 0x00], 0x00, 0x00, [0x01]);
    for (const listener of this.listeners) listener(frame);
  }

  onSysEx(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

function makePatchPayload(name) {
  const payload = new Uint8Array(17 * 128);
  Buffer.from(name).copy(payload);
  return payload;
}

function emitToneStudioReadRange(listeners, address, startPage, payload) {
  const group = startPage / 8;
  const start = group * 8;
  const end = Math.min(start + 8, 17);
  for (let page = start; page < end; page += 1) {
    const startOffset = page === 16 ? 0 : 0;
    const endOffset = page === 16 ? 128 : 128;
    const data = payload.subarray(page * 128 + startOffset, page * 128 + endOffset);
    const slices = page === end - 1 && page < 16 ? [data.subarray(0, 68), data.subarray(68)]
      : page === 16 ? [data.subarray(0, 16), data.subarray(16)]
        : [data];
    let offset = 0;
    for (const slice of slices) {
      const frame = makeGt1WireFrame(address, page, offset, slice);
      for (const listener of listeners) listener(frame);
      offset += slice.length;
    }
  }
}

function makeGt1WireFrame(address, page, offset, data) {
  const body = [...address, page, offset, ...data];
  const checksum = (128 - (body.reduce((sum, byte) => sum + byte, 0) % 128)) % 128;
  return Uint8Array.from([0xf0, 0x41, 0x00, 0x00, 0x00, 0x00, 0x30, 0x12, ...body, checksum, 0xf7]);
}

function makeGt1CompactReplyFrames(address, name) {
  const payload = new Uint8Array(17 * 128);
  Buffer.from(name).copy(payload);
  const frames = [];
  for (let index = 0; index < 10; index += 1) {
    const dataLength = index < 9 ? 241 : 7;
    const offset = index * 241;
    const data = payload.subarray(index * 241, index * 241 + dataLength);
    const body = [
      ...address,
      Math.floor(offset / 128), offset % 128,
      ...data,
    ];
    const checksum = (128 - (body.reduce((sum, byte) => sum + byte, 0) % 128)) % 128;
    frames.push(Uint8Array.from([
      0xf0, 0x41, 0x00, 0x00, 0x00, 0x00, 0x30, 0x12,
      ...body, checksum, 0xf7,
    ]));
  }
  return frames;
}
