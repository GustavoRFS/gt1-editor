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

const {
  decodePatchResponse,
  encodeParameterWrite,
  encodePatchWrite,
  encodePatchNameWrite,
  encodeProgramChange,
  encodePatchSelectionWrite,
  encodeReadRequest,
  encodeUserPatchNameReadRequest,
  encodeUserPatchReadRequest,
  isGt1IdentityReply,
  patchContentsEqual,
} = require('../src/gt1/sysex.ts');

test('selects a GT-1 user patch through Tone Studio current-patch-number setup data', () => {
  const frame = encodePatchSelectionWrite(0, 11);

  assert.deepEqual(Array.from(frame.subarray(0, 8)), [0xf0, 0x41, 0x00, 0x00, 0x00, 0x00, 0x30, 0x12]);
  assert.deepEqual(Array.from(frame.subarray(8, 14)), [0x00, 0x01, 0x00, 0x00, 0x00, 0x0a]);
  assert.equal(frame[frame.length - 2], checksum(frame.subarray(8, frame.length - 2)));
});

test('requests a 16-byte user patch name with Tone Studio slot addressing', () => {
  const request = encodeUserPatchNameReadRequest(0, 99);

  assert.deepEqual(Array.from(request.subarray(0, 8)), [0xf0, 0x41, 0x00, 0x00, 0x00, 0x00, 0x30, 0x11]);
  assert.deepEqual(Array.from(request.subarray(8, 16)), [0x10, 0x62, 0x00, 0x00, 0x00, 0x00, 0x00, 0x10]);
  assert.equal(request[request.length - 2], checksum(request.subarray(8, request.length - 2)));
});

test('reads the current patch through the three address ranges used by Tone Studio', () => {
  const requests = encodeReadRequest(0);

  assert.equal(requests.length, 3);
  assert.deepEqual(requests.map((request) => Array.from(request.subarray(8, 16))), [
    [0x60, 0x00, 0x00, 0x00, 0x00, 0x00, 0x08, 0x00],
    [0x60, 0x00, 0x08, 0x00, 0x00, 0x00, 0x08, 0x00],
    [0x60, 0x00, 0x10, 0x00, 0x00, 0x00, 0x08, 0x00],
  ]);
  assert.deepEqual(Array.from(requests[0].subarray(0, 8)), [0xf0, 0x41, 0x00, 0x00, 0x00, 0x00, 0x30, 0x11]);
  assert.ok(requests.every((request) => request[request.length - 2] === checksum(request.subarray(8, request.length - 2))));
});

test('recognizes the identity reply returned by the connected GT-1', () => {
  assert.equal(isGt1IdentityReply(Uint8Array.from([
    0xf0, 0x7e, 0x00, 0x06, 0x02, 0x41, 0x30, 0x03,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xf7,
  ])), true);
});

test('decodes the ten SysEx frames returned for the current GT-1 buffer', () => {
  const patch = decodePatchResponse(makeGt1CompactReplyFrames());

  assert.equal(patch.complete, true);
  assert.equal(patch.frames.length, 17);
  assert.equal(patch.name, 'PATCH TEST');
});

test('reads a user patch from U99 in three 0x0800 ranges', () => {
  const requests = encodeUserPatchReadRequest(0, 99);

  assert.equal(requests.length, 3);
  assert.deepEqual(requests.map((request) => Array.from(request.subarray(8, 16))), [
    [0x10, 0x62, 0x00, 0x00, 0x00, 0x00, 0x08, 0x00],
    [0x10, 0x62, 0x08, 0x00, 0x00, 0x00, 0x08, 0x00],
    [0x10, 0x62, 0x10, 0x00, 0x00, 0x00, 0x08, 0x00],
  ]);
  assert.ok(requests.every((request) => request[request.length - 1] === 0xf7));
  assert.ok(requests.every((request) => request[request.length - 2] === checksum(request.subarray(8, request.length - 2))));
});

test('rejects user patch slots outside U01-U99', () => {
  assert.throws(() => encodeUserPatchReadRequest(0, 0), { code: 'invalid-address' });
  assert.throws(() => encodeUserPatchReadRequest(0, 100), { code: 'invalid-address' });
});

test('decodes a user patch reply only when its memory address matches the requested slot', () => {
  const patch = decodePatchResponse(makeGt1CompactReplyFrames([0x10, 0x62]), [0x10, 0x62]);

  assert.equal(patch.complete, true);
  assert.equal(patch.name, 'PATCH TEST');
  assert.throws(
    () => decodePatchResponse(makeGt1CompactReplyFrames([0x10, 0x61]), [0x10, 0x62]),
    { code: 'invalid-address' },
  );
});

test('writes mapped chunks to the temporary buffer, then selects U01 or U99 with patch_write', () => {
  const patch = decodePatchResponse(makeGt1CompactReplyFrames());
  const firstSlot = encodePatchWrite(patch, 0, { userPatch: 1 });
  const lastSlot = encodePatchWrite(patch, 0, { userPatch: 99 });

  assert.equal(firstSlot.length, 24);
  assert.deepEqual(Array.from(firstSlot[0].subarray(0, 8)), [0xf0, 0x41, 0x00, 0x00, 0x00, 0x00, 0x30, 0x12]);
  assert.deepEqual(Array.from(firstSlot[0].subarray(8, 12)), [0x60, 0x00, 0x00, 0x00]);
  assert.equal(firstSlot[0].length, 64 + 14);
  assert.deepEqual(Array.from(firstSlot[0].subarray(12, 76)), Array.from(patch.frames[0].subarray(11, 75)));
  assert.deepEqual(Array.from(firstSlot[1].subarray(8, 12)), [0x60, 0x00, 0x00, 0x50]);
  assert.equal(firstSlot[1].length, 48 + 14);
  assert.deepEqual(Array.from(firstSlot[1].subarray(12, 60)), Array.from(patch.frames[0].subarray(11 + 0x50, 11 + 0x50 + 48)));
  assert.deepEqual(Array.from(firstSlot[23].subarray(8, 12)), [0x7f, 0x00, 0x01, 0x04]);
  assert.deepEqual(Array.from(firstSlot[23].subarray(12, 14)), [0x00, 0x00]);
  assert.deepEqual(Array.from(lastSlot[23].subarray(12, 14)), [0x00, 0x62]);
  assert.equal(lastSlot.some((frame) => frame[8] === 0x60 && frame[10] === 0x11), false);
  assert.ok(lastSlot.every((frame) => checksum(frame.subarray(8, frame.length - 2)) === frame[frame.length - 2]));
});

test('compares only fields that the Tone Studio save protocol transfers', () => {
  const original = decodePatchResponse(makeGt1CompactReplyFrames());
  const reservedChange = { ...original, frames: original.frames.map((frame) => new Uint8Array(frame)) };
  reservedChange.frames[0][11 + 64] = 0x01;
  assert.equal(patchContentsEqual(original, reservedChange), true);

  const mappedChange = { ...original, frames: original.frames.map((frame) => new Uint8Array(frame)) };
  mappedChange.frames[0][11 + 1] = 0x01;
  assert.equal(patchContentsEqual(original, mappedChange), false);
});

test('encodes individual parameter changes with the GT-1 wire model ID and checksum range', () => {
  const frame = encodeParameterWrite(0, 'fx1-type', 1);

  assert.deepEqual(Array.from(frame.subarray(0, 8)), [0xf0, 0x41, 0x00, 0x00, 0x00, 0x00, 0x30, 0x12]);
  assert.deepEqual(Array.from(frame.subarray(8, 12)), [0x60, 0x00, 0x01, 0x41]);
  assert.equal(frame[12], 1);
  assert.equal(frame[frame.length - 2], checksum(frame.subarray(8, frame.length - 2)));
});

test('rejects persistent-write destinations outside U01-U99', () => {
  const patch = decodePatchResponse(makeGt1CompactReplyFrames());

  assert.throws(() => encodePatchWrite(patch, 0, { userPatch: 0 }), { code: 'invalid-address' });
  assert.throws(() => encodePatchWrite(patch, 0, { userPatch: 100 }), { code: 'invalid-address' });
});

test('encodes U01 and U99 as channel-one program change messages', () => {
  assert.deepEqual(Array.from(encodeProgramChange(1)), [0xc0, 0]);
  assert.deepEqual(Array.from(encodeProgramChange(99)), [0xc0, 98]);
  assert.deepEqual(Array.from(encodeProgramChange(3, 16)), [0xcf, 2]);
  assert.throws(() => encodeProgramChange(0), { code: 'invalid-address' });
  assert.throws(() => encodeProgramChange(100), { code: 'invalid-address' });
  assert.throws(() => encodeProgramChange(1, 0), { code: 'invalid-address' });
  assert.throws(() => encodeProgramChange(1, 17), { code: 'invalid-address' });
});

test('encodes a sanitized 16-byte patch name at the edit-buffer base with a valid checksum', () => {
  const frame = encodePatchNameWrite(0, 'Clean Ω');

  assert.deepEqual(Array.from(frame.subarray(8, 12)), [0x60, 0x00, 0x00, 0x00]);
  assert.deepEqual(Array.from(frame.subarray(12, 28)), Array.from(Buffer.from('Clean           ', 'ascii')));
  assert.equal(frame[frame.length - 2], checksum(frame.subarray(8, frame.length - 2)));
});

function makeGt1CompactReplyFrames(address = [0x60, 0x00]) {
  const payload = new Uint8Array(17 * 128);
  Buffer.from('PATCH TEST').copy(payload);

  const frames = [];
  let payloadOffset = 0;
  for (let index = 0; index < 10; index += 1) {
    const dataLength = index < 9 ? 241 : 7;
    const offset = index * 241;
    const data = payload.subarray(payloadOffset, payloadOffset + dataLength);
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
    payloadOffset += dataLength;
  }

  assert.equal(payloadOffset, 17 * 128);
  assert.deepEqual(frames.map((frame) => frame.length), [
    255, 255, 255, 255, 255, 255, 255, 255, 255, 21,
  ]);
  return frames;
}

function checksum(bytes) {
  return (128 - (Array.from(bytes).reduce((sum, byte) => sum + byte, 0) % 128)) % 128;
}
