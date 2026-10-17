import type { AsyncStorage } from '@tanstack/query-async-storage-persister';

const memory = new Map<string, string>();

const memoryStorage: AsyncStorage = {
  async getItem(key) {
    return memory.get(key) ?? null;
  },
  async setItem(key, value) {
    memory.set(key, value);
  },
  async removeItem(key) {
    memory.delete(key);
  },
};

export default memoryStorage;
