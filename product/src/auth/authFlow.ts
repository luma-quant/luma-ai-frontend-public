import { authApi } from './authApi';
import type { PreAuthResponse, TokenPair } from './types';

interface AuthFlowApi {
  validateInviteCode: (code: string) => Promise<boolean>;
  verifyAccessCode: (
    preAuthToken: string,
    accessCode?: string,
  ) => Promise<TokenPair>;
}

export class InviteCodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InviteCodeError';
  }
}

export async function finishPreAuthentication(
  preAuth: PreAuthResponse,
  accessCode?: string,
  api: AuthFlowApi = authApi,
): Promise<TokenPair> {
  if (!preAuth.requires_access_code) {
    return api.verifyAccessCode(preAuth.pre_auth_token);
  }

  const normalizedCode = accessCode?.trim() ?? '';
  if (normalizedCode.length < 8 || normalizedCode.length > 128) {
    throw new InviteCodeError('The invite code must contain 8 to 128 characters.');
  }

  const valid = await api.validateInviteCode(normalizedCode);
  if (!valid) {
    throw new InviteCodeError('This invite code is invalid, expired, or already used.');
  }

  return api.verifyAccessCode(preAuth.pre_auth_token, normalizedCode);
}
