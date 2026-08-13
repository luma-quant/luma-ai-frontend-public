import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACCESS_TOKEN_KEY,
  clearTokenPair,
  persistTokenPair,
  readTokenPair,
  REFRESH_TOKEN_KEY,
} from './tokenStorage';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, String(value));
  }
}

test('token pairs are stored under one canonical localStorage keyset', () => {
  const storage = new MemoryStorage();
  storage.setItem('luma_auth_token', 'legacy');
  const eventTarget = new EventTarget();
  const fakeWindow = {
    localStorage: storage,
    dispatchEvent: eventTarget.dispatchEvent.bind(eventTarget),
  };
  Object.defineProperty(globalThis, 'window', {
    value: fakeWindow,
    configurable: true,
  });

  try {
    persistTokenPair({
      access_token: 'access.jwt',
      refresh_token: 'refresh.jwt',
    });

    assert.deepEqual(readTokenPair(), {
      access_token: 'access.jwt',
      refresh_token: 'refresh.jwt',
    });
    assert.equal(storage.getItem('luma_auth_token'), null);
    assert.equal(storage.getItem(ACCESS_TOKEN_KEY), 'access.jwt');
    assert.equal(storage.getItem(REFRESH_TOKEN_KEY), 'refresh.jwt');

    clearTokenPair();
    assert.deepEqual(readTokenPair(), {
      access_token: undefined,
      refresh_token: undefined,
    });
  } finally {
    Reflect.deleteProperty(globalThis, 'window');
  }
});
