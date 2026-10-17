import { QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import type { PersistQueryClientOptions } from '@tanstack/react-query-persist-client';
import { deserializePersistedClient, serializePersistedClient } from './patchFrameCodec';
import storage from './persistStorage';

export const USER_PATCH_QUERY_KEY = ['gt1', 'user-patches'] as const;
export const PERSIST_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;
export const PERSIST_CACHE_BUSTER = 'gt1-saved-user-patch-names-v2';
// A patch snapshot is small and remains useful for the app's lifetime.
// Infinity also avoids browser timer overflow for a one-year timeout.
export const QUERY_GC_TIME_MS = Infinity;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: QUERY_GC_TIME_MS,
    },
  },
});

export const asyncStoragePersister = createAsyncStoragePersister({
  storage,
  serialize: serializePersistedClient,
  deserialize: deserializePersistedClient,
});

export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister: asyncStoragePersister,
  maxAge: PERSIST_MAX_AGE_MS,
  buster: PERSIST_CACHE_BUSTER,
  dehydrateOptions: {
    shouldDehydrateQuery: (query) =>
      query.state.status === 'success' &&
      ((query.queryKey.length === USER_PATCH_QUERY_KEY.length &&
        query.queryKey.every((part, index) => part === USER_PATCH_QUERY_KEY[index])) ||
        query.queryKey[0] === 'tonecentral'),
    shouldDehydrateMutation: () => false,
  },
};
