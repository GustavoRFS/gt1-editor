import type { AsyncStorage } from '@tanstack/query-async-storage-persister';

let reportedUnavailable = false;

function getStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function reportUnavailable() {
  if (reportedUnavailable) return;
  reportedUnavailable = true;
  console.warn('Patch cache persistence is unavailable in this browser context.');
}

const localStorageAdapter: AsyncStorage = {
  async getItem(key) {
    const storage = getStorage();
    if (!storage) {
      reportUnavailable();
      return null;
    }
    try {
      return storage.getItem(key);
    } catch {
      reportUnavailable();
      return null;
    }
  },
  async setItem(key, value) {
    const storage = getStorage();
    if (!storage) {
      reportUnavailable();
      return;
    }
    try {
      storage.setItem(key, value);
    } catch {
      reportUnavailable();
    }
  },
  async removeItem(key) {
    const storage = getStorage();
    if (!storage) {
      reportUnavailable();
      return;
    }
    try {
      storage.removeItem(key);
    } catch {
      reportUnavailable();
    }
  },
};

export default localStorageAdapter;
