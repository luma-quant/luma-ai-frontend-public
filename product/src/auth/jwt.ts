import { jwtDecode } from 'jwt-decode';
import type { AccessTokenClaims } from './types';

export class InvalidAccessTokenError extends Error {
  constructor(message = 'The access token is invalid or expired.') {
    super(message);
    this.name = 'InvalidAccessTokenError';
  }
}

export function decodeAccessToken(
  token: string,
  nowInSeconds = Math.floor(Date.now() / 1000),
): AccessTokenClaims {
  let claims: Partial<AccessTokenClaims>;

  try {
    claims = jwtDecode<Partial<AccessTokenClaims>>(token);
  } catch {
    throw new InvalidAccessTokenError('The access token is not a valid JWT.');
  }

  if (claims.typ !== 'access') {
    throw new InvalidAccessTokenError('The token is not an access token.');
  }
  if (typeof claims.sub !== 'string' || claims.sub.length === 0) {
    throw new InvalidAccessTokenError('The access token has no subject.');
  }
  if (typeof claims.exp !== 'number' || !Number.isFinite(claims.exp)) {
    throw new InvalidAccessTokenError('The access token has no valid expiry.');
  }
  if (claims.exp <= nowInSeconds) {
    throw new InvalidAccessTokenError('The access token has expired.');
  }

  return claims as AccessTokenClaims;
}

export function accessTokenNeedsRefresh(
  token: string,
  leewaySeconds = 45,
  nowInSeconds = Math.floor(Date.now() / 1000),
): boolean {
  try {
    const claims = decodeAccessToken(token, 0);
    return claims.exp <= nowInSeconds + leewaySeconds;
  } catch {
    return true;
  }
}
