export type IdentityProvider = 'apple' | 'google';

export interface GoogleSsoCredential {
  provider: 'google';
  token: string;
}

export interface AppleWebSsoCredential {
  provider: 'apple';
  id_token: string;
  code: string;
  nonce: string;
}

export type ProviderSsoCredential =
  | GoogleSsoCredential
  | AppleWebSsoCredential;

export interface PreAuthResponse {
  pre_auth_token: string;
  token_type: 'bearer';
  expires_in: number;
  requires_access_code: boolean;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
}

export interface AccessTokenClaims {
  sub: string;
  iss?: string;
  aud?: string | string[];
  iat?: number;
  exp: number;
  typ: 'access';
}

export interface LumaProCapability {
  id: 'luma_pro';
  label: string;
  description: string;
  price_multiplier: '2.00';
  available: boolean;
  unavailable_reason: string | null;
}

export interface AdvisorConfigResponse {
  contract_version: 'luma.advisor.v8.1';
  pricing_version: 'advisor-pricing-v4';
  enabled: boolean;
  luma_pro: LumaProCapability;
  [key: string]: unknown;
}
