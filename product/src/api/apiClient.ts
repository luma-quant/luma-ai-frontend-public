import axios, {
  AxiosError,
  AxiosHeaders,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';
import { AUTH_ENDPOINT_PATHS, AUTH_ENDPOINTS } from '../auth/endpoints';
import { accessTokenNeedsRefresh } from '../auth/jwt';
import {
  clearTokenPair,
  persistTokenPair,
  readTokenPair,
} from '../auth/tokenStorage';
import type { TokenPair } from '../auth/types';

const runtimeEnv = (
  import.meta as ImportMeta & { env?: ImportMetaEnv }
).env;

export const API_URL = (
  runtimeEnv?.VITE_API_URL
  || 'https://api.example.invalid'
).replace(/\/+$/, '');

export interface LumaRequestConfig extends AxiosRequestConfig {
  skipLumaAuth?: boolean;
}

interface RetryableRequestConfig extends InternalAxiosRequestConfig {
  _lumaRetry?: boolean;
  skipLumaAuth?: boolean;
}

const refreshClient = axios.create({ baseURL: API_URL });

export const LEGAL_ACCEPTANCE_REQUIRED_EVENT =
  'luma:legal-acceptance-required';

function isAuthEndpoint(url = ''): boolean {
  const path = url.startsWith('http')
    ? new URL(url).pathname
    : url.split('?')[0];
  return AUTH_ENDPOINT_PATHS.has(path);
}

function isLegalEndpoint(url = ''): boolean {
  const path = url.startsWith('http')
    ? new URL(url).pathname
    : url.split('?')[0];
  return path === '/api/v1/legal/status'
    || path === '/api/v1/legal/accept-platform';
}

function requireTokenPair(value: unknown): TokenPair {
  if (
    typeof value !== 'object'
    || value === null
    || typeof (value as TokenPair).access_token !== 'string'
    || typeof (value as TokenPair).refresh_token !== 'string'
    || !(value as TokenPair).access_token
    || !(value as TokenPair).refresh_token
  ) {
    throw new Error('The backend returned an invalid token response.');
  }

  return value as TokenPair;
}

let refreshInFlight: Promise<TokenPair> | null = null;

export function refreshSessionTokens(): Promise<TokenPair> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refreshToken = readTokenPair().refresh_token;
    if (!refreshToken) {
      clearTokenPair();
      throw new Error('No refresh token is available.');
    }

    try {
      const response = await refreshClient.post(
        AUTH_ENDPOINTS.refresh,
        { refresh_token: refreshToken },
      );
      const tokens = requireTokenPair(response.data);
      persistTokenPair(tokens);
      return tokens;
    } catch (error) {
      clearTokenPair();
      throw error;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    Accept: 'application/json',
  },
});

apiClient.interceptors.request.use(async (config) => {
  const lumaConfig = config as RetryableRequestConfig;
  const headers = AxiosHeaders.from(config.headers);
  config.headers = headers;

  if (lumaConfig.skipLumaAuth) {
    headers.delete('Authorization');
    return config;
  }

  if (!headers.has('Authorization')) {
    const stored = readTokenPair();
    let accessToken = stored.access_token;
    if (
      accessToken
      && stored.refresh_token
      && accessTokenNeedsRefresh(accessToken)
      && !isAuthEndpoint(config.url)
    ) {
      const tokens = await refreshSessionTokens();
      accessToken = tokens.access_token;
    }
    if (accessToken) {
      headers.set('Authorization', `Bearer ${accessToken}`);
    }
  }

  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetryableRequestConfig | undefined;

    if (
      error.response?.status === 428
      && originalRequest
      && !isLegalEndpoint(originalRequest.url)
      && typeof window !== 'undefined'
    ) {
      window.dispatchEvent(new Event(LEGAL_ACCEPTANCE_REQUIRED_EVENT));
      throw error;
    }

    if (
      error.response?.status !== 401
      || !originalRequest
      || originalRequest._lumaRetry
      || originalRequest.skipLumaAuth
      || isAuthEndpoint(originalRequest.url)
    ) {
      throw error;
    }

    originalRequest._lumaRetry = true;
    const tokens = await refreshSessionTokens();
    const headers = AxiosHeaders.from(originalRequest.headers);
    headers.set('Authorization', `Bearer ${tokens.access_token}`);
    originalRequest.headers = headers;
    return apiClient(originalRequest);
  },
);

export default apiClient;
