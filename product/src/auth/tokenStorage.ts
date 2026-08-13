import type { TokenPair } from './types';

export const ACCESS_TOKEN_KEY = 'luma_access_token';
export const REFRESH_TOKEN_KEY = 'luma_refresh_token';
export const AUTH_TOKEN_CHANGED_EVENT = 'luma:auth-token-changed';

const LEGACY_TOKEN_KEYS = [
  'luma_auth_token',
  'access_token',
  'refresh_token',
] as const;

function getStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

function emitTokenChange(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AUTH_TOKEN_CHANGED_EVENT));
  }
}

export function clearLegacyTokenKeys(): void {
  const storage = getStorage();
  if (!storage) return;

  for (const key of LEGACY_TOKEN_KEYS) {
    storage.removeItem(key);
  }
}

export function readTokenPair(): Partial<TokenPair> {
  const storage = getStorage();
  if (!storage) return {};

  return {
    access_token: storage.getItem(ACCESS_TOKEN_KEY) ?? undefined,
    refresh_token: storage.getItem(REFRESH_TOKEN_KEY) ?? undefined,
  };
}

export function persistTokenPair(tokens: TokenPair): void {
  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error('The backend returned an incomplete token pair.');
  }

  const storage = getStorage();
  if (!storage) {
    throw new Error('Browser storage is unavailable.');
  }

  const previousAccess = storage.getItem(ACCESS_TOKEN_KEY);
  const previousRefresh = storage.getItem(REFRESH_TOKEN_KEY);

  try {
    storage.setItem(ACCESS_TOKEN_KEY, tokens.access_token);
    storage.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token);
    clearLegacyTokenKeys();
  } catch (error) {
    if (previousAccess === null) storage.removeItem(ACCESS_TOKEN_KEY);
    else storage.setItem(ACCESS_TOKEN_KEY, previousAccess);

    if (previousRefresh === null) storage.removeItem(REFRESH_TOKEN_KEY);
    else storage.setItem(REFRESH_TOKEN_KEY, previousRefresh);
    throw error;
  }

  emitTokenChange();
}

export function clearTokenPair(): void {
  const storage = getStorage();
  if (!storage) return;

  storage.removeItem(ACCESS_TOKEN_KEY);
  storage.removeItem(REFRESH_TOKEN_KEY);
  clearLegacyTokenKeys();
  emitTokenChange();
}
