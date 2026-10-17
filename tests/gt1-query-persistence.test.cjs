const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const ts = require('typescript');
const { dehydrate, hydrate, QueryClient } = require('@tanstack/react-query');

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

const { deserializePersistedClient, serializePersistedClient } = require('../src/query/patchFrameCodec.ts');
const {
  PERSIST_MAX_AGE_MS,
  PERSIST_CACHE_BUSTER,
  persistOptions,
  queryClient,
  QUERY_GC_TIME_MS,
  USER_PATCH_QUERY_KEY,
} = require('../src/query/queryClient.ts');

test('persistedQueryCodecRestoresEveryPatchFrameAsUint8Array', () => {
  const frames = Array.from({ length: 17 }, (_, frameIndex) =>
    Uint8Array.from({ length: 128 }, (_, byteIndex) => (frameIndex * 13 + byteIndex) % 256));
  const persistedClient = {
    timestamp: 123456789,
    buster: 'test-buster',
    clientState: {
      queries: [{
        queryKey: ['gt1', 'user-patches'],
        queryHash: '["gt1","user-patches"]',
        state: {
          data: [{ id: 'gt1-user-01', userPatch: 1, name: 'Codec patch', frames, complete: true }],
          dataUpdatedAt: 123456789,
          status: 'success',
        },
      }],
      mutations: [],
    },
  };

  const restored = deserializePersistedClient(serializePersistedClient(persistedClient));
  const patch = restored.clientState.queries[0].state.data[0];

  assert.equal(patch.name, 'Codec patch');
  assert.equal(patch.userPatch, 1);
  assert.equal(patch.frames.length, 17);
  for (let frameIndex = 0; frameIndex < 17; frameIndex += 1) {
    assert.ok(patch.frames[frameIndex] instanceof Uint8Array);
    assert.deepEqual(patch.frames[frameIndex], frames[frameIndex]);
  }
});

test('layout imports the restoration hook from react-query', () => {
  const layout = fs.readFileSync(require.resolve('../app/_layout.tsx'), 'utf8');
  assert.match(layout, /import\s*\{[^}]*useIsRestoring[^}]*\}\s*from\s*['"]@tanstack\/react-query['"]/);
});

test('restores the last user-patch snapshot into query cache before a USB scan', () => {
  const persistedClient = {
    timestamp: Date.now(),
    buster: '',
    clientState: (() => {
      const sourceClient = new QueryClient();
      sourceClient.setQueryData(USER_PATCH_QUERY_KEY, [
        { id: 'gt1-user-99', userPatch: 99, name: 'Restored U99', frames: [Uint8Array.of(1, 2)], complete: true },
      ]);
      return dehydrate(sourceClient);
    })(),
  };
  const restoredClient = new QueryClient();

  hydrate(restoredClient, deserializePersistedClient(serializePersistedClient(persistedClient)).clientState);

  assert.equal(restoredClient.getQueryData(USER_PATCH_QUERY_KEY)[0].name, 'Restored U99');
  assert.ok(restoredClient.getQueryData(USER_PATCH_QUERY_KEY)[0].frames[0] instanceof Uint8Array);
});

test('persists only the successful hardware patch snapshot and retains it for the cache age', () => {
  const patch = { id: 'gt1-user-01', userPatch: 1, name: 'Persisted', frames: [], complete: true };
  queryClient.setQueryData(USER_PATCH_QUERY_KEY, [patch]);
  queryClient.setQueryData(['other', 'session'], ['temporary']);
  const shouldPersist = persistOptions.dehydrateOptions.shouldDehydrateQuery;
  const userQuery = queryClient.getQueryCache().find({ queryKey: USER_PATCH_QUERY_KEY });
  const sessionQuery = queryClient.getQueryCache().find({ queryKey: ['other', 'session'] });

  assert.equal(shouldPersist(userQuery), true);
  assert.equal(shouldPersist(sessionQuery), false);
  assert.ok(QUERY_GC_TIME_MS >= PERSIST_MAX_AGE_MS);
});

test('invalidates the earlier cache snapshot that could contain temporary-buffer data', () => {
  assert.equal(typeof PERSIST_CACHE_BUSTER, 'string');
  assert.notEqual(PERSIST_CACHE_BUSTER, '');
  assert.equal(persistOptions.buster, PERSIST_CACHE_BUSTER);
});

test('patch activation does not overwrite the saved-patch cache with the temporary edit buffer', () => {
  const editor = fs.readFileSync(require.resolve('../app/index.tsx'), 'utf8');
  const activation = editor.match(/const activatePatchOnPedal = async[\s\S]*?\n  };/);

  assert.ok(activation);
  assert.doesNotMatch(activation[0], /setQueryData|USER_PATCH_QUERY_KEY/);
  assert.match(editor, /client\.readUserPatchNames\(DEFAULT_GT1_UNIT_ID/);
});
