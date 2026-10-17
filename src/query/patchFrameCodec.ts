import type { PersistedClient } from '@tanstack/react-query-persist-client';

const UINT8_ARRAY_TAG = '__gt1_uint8_array__';

export function serializePersistedClient(client: PersistedClient): string {
  return JSON.stringify(client, (_key, value) => {
    if (value instanceof Uint8Array) {
      return { [UINT8_ARRAY_TAG]: Array.from(value) };
    }
    return value;
  });
}

export function deserializePersistedClient(serialized: string): PersistedClient {
  return JSON.parse(serialized, (_key, value) => {
    if (
      value &&
      typeof value === 'object' &&
      Object.keys(value).length === 1 &&
      Array.isArray(value[UINT8_ARRAY_TAG])
    ) {
      return Uint8Array.from(value[UINT8_ARRAY_TAG]);
    }
    return value;
  }) as PersistedClient;
}
