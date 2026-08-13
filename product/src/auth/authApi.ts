import axios, { type AxiosInstance } from 'axios';
import apiClient, { type LumaRequestConfig } from '../api/apiClient';
import { AUTH_ENDPOINTS } from './endpoints';
import type {
  AdvisorConfigResponse,
  PreAuthResponse,
  ProviderSsoCredential,
  TokenPair,
} from './types';

type AuthHttpClient = Pick<AxiosInstance, 'get' | 'post'>;

const publicRequest: LumaRequestConfig = { skipLumaAuth: true };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parsePreAuthResponse(value: unknown): PreAuthResponse {
  if (
    !isRecord(value)
    || typeof value.pre_auth_token !== 'string'
    || value.token_type !== 'bearer'
    || typeof value.expires_in !== 'number'
    || typeof value.requires_access_code !== 'boolean'
  ) {
    throw new Error('The backend returned an invalid pre-auth response.');
  }

  return value as unknown as PreAuthResponse;
}

function parseTokenPair(value: unknown): TokenPair {
  if (
    !isRecord(value)
    || typeof value.access_token !== 'string'
    || !value.access_token
    || typeof value.refresh_token !== 'string'
    || !value.refresh_token
  ) {
    throw new Error('The backend returned an invalid token response.');
  }

  return value as unknown as TokenPair;
}

function parseAdvisorConfig(value: unknown): AdvisorConfigResponse {
  if (
    !isRecord(value)
    || !isRecord(value.luma_pro)
    || typeof value.luma_pro.available !== 'boolean'
    || (
      value.luma_pro.unavailable_reason !== null
      && typeof value.luma_pro.unavailable_reason !== 'string'
    )
  ) {
    throw new Error('The backend returned an invalid Advisor configuration.');
  }

  return value as unknown as AdvisorConfigResponse;
}

export function createAuthApi(client: AuthHttpClient = apiClient) {
  return {
    async requestEmailCode(email: string): Promise<void> {
      const response = await client.post(
        AUTH_ENDPOINTS.requestEmailCode,
        { email },
        publicRequest,
      );
      if (!isRecord(response.data) || response.data.ok !== true) {
        throw new Error('The backend did not confirm the OTP request.');
      }
    },

    async authenticateEmailOtp(
      email: string,
      code: string,
    ): Promise<PreAuthResponse> {
      const response = await client.post(
        AUTH_ENDPOINTS.emailOtp,
        { email, code },
        publicRequest,
      );
      return parsePreAuthResponse(response.data);
    },

    async authenticateSso(
      credential: ProviderSsoCredential,
    ): Promise<PreAuthResponse> {
      const response = await client.post(
        AUTH_ENDPOINTS.sso,
        credential,
        publicRequest,
      );
      return parsePreAuthResponse(response.data);
    },

    async validateInviteCode(code: string): Promise<boolean> {
      const response = await client.post(
        AUTH_ENDPOINTS.validateInvite,
        { code },
        publicRequest,
      );
      if (!isRecord(response.data) || typeof response.data.valid !== 'boolean') {
        throw new Error('The backend returned an invalid invite response.');
      }
      return response.data.valid;
    },

    async verifyAccessCode(
      preAuthToken: string,
      accessCode?: string,
    ): Promise<TokenPair> {
      const response = await client.post(
        AUTH_ENDPOINTS.verifyAccessCode,
        accessCode ? { access_code: accessCode } : {},
        {
          headers: {
            Authorization: `Bearer ${preAuthToken}`,
          },
        },
      );
      return parseTokenPair(response.data);
    },

    async refresh(refreshToken: string): Promise<TokenPair> {
      const response = await client.post(
        AUTH_ENDPOINTS.refresh,
        { refresh_token: refreshToken },
        publicRequest,
      );
      return parseTokenPair(response.data);
    },

    async getAdvisorConfig(): Promise<AdvisorConfigResponse> {
      const response = await client.get(AUTH_ENDPOINTS.advisorConfig);
      return parseAdvisorConfig(response.data);
    },
  };
}

export const authApi = createAuthApi();

export function getApiErrorMessage(
  error: unknown,
  fallback = 'Authentication failed. Please try again.',
): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (isRecord(detail)) {
      if (typeof detail.message === 'string') return detail.message;
      if (typeof detail.code === 'string') return detail.code;
    }
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
