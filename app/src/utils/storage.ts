import AsyncStorage from '@react-native-async-storage/async-storage';
import { MMKV } from 'react-native-mmkv';

/**
 * Game-style local persistence: MMKV for fast, reliable key-value storage,
 * with a one-time migration from AsyncStorage if data exists there.
 */

const supportsJSI = typeof global !== 'undefined' && !!(global as any).nativeCallSyncHook;
let kv: MMKV | null = null;
try {
  if (supportsJSI) {
    kv = new MMKV({ id: 'app-storage', encryptionKey: undefined });
  } else {
    console.warn('MMKV unavailable: JS remote debugger / no JSI; falling back to AsyncStorage');
  }
} catch (err) {
  console.warn('MMKV init failed; falling back to AsyncStorage', err);
  kv = null;
}

const readMMKV = (key: string): string | null => {
  if (!kv) return null;
  try {
    const value = kv.getString(key);
    if (value != null) return value;
  } catch (err) {
    console.warn('MMKV read failed', key, err);
  }
  return null;
};

const writeMMKV = (key: string, value: string | null) => {
  if (!kv) return;
  try {
    if (value == null) {
      kv.delete(key);
    } else {
      kv.set(key, value);
    }
  } catch (err) {
    console.warn('MMKV write failed', key, err);
  }
};

const migrateFromAsync = async (key: string): Promise<string | null> => {
  try {
    const legacy = await AsyncStorage.getItem(key);
    if (legacy != null) {
      writeMMKV(key, legacy);
      await AsyncStorage.removeItem(key);
      return legacy;
    }
  } catch (err) {
    console.warn('AsyncStorage migration failed', key, err);
  }
  return null;
};

export const storage = {
  getItem: async (key: string): Promise<string | null> => {
    const existing = readMMKV(key);
    if (existing != null) return existing;
    return migrateFromAsync(key);
  },
  multiGet: async (keys: string[]): Promise<[string, string | null][]> => {
    return Promise.all(
      keys.map(async (key): Promise<[string, string | null]> => {
        const val = readMMKV(key);
        if (val != null) return [key, val];
        return [key, await migrateFromAsync(key)];
      })
    );
  },
  setItem: async (key: string, value: string | null): Promise<void> => {
    writeMMKV(key, value);
    // keep AsyncStorage in sync for now to avoid surprises if MMKV is unavailable
    try {
      if (value == null) {
        await AsyncStorage.removeItem(key);
      } else {
        await AsyncStorage.setItem(key, value);
      }
    } catch (err) {
      console.warn('AsyncStorage shadow write failed', key, err);
    }
  },
  removeItem: async (key: string): Promise<void> => {
    writeMMKV(key, null);
    try {
      await AsyncStorage.removeItem(key);
    } catch (err) {
      console.warn('AsyncStorage remove failed', key, err);
    }
  },
};

export type Storage = typeof storage;

