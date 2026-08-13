export const AUTH_ENDPOINTS = {
  requestEmailCode: '/auth/email/request-code',
  emailOtp: '/api/v1/auth/email-otp',
  sso: '/api/v1/auth/sso',
  validateInvite: '/api/v1/invites/validate',
  verifyAccessCode: '/api/v1/auth/verify-access-code',
  refresh: '/auth/refresh',
  advisorConfig: '/api/v1/advisor/config',
} as const;

export const AUTH_ENDPOINT_PATHS = new Set<string>([
  AUTH_ENDPOINTS.requestEmailCode,
  AUTH_ENDPOINTS.emailOtp,
  AUTH_ENDPOINTS.sso,
  AUTH_ENDPOINTS.validateInvite,
  AUTH_ENDPOINTS.verifyAccessCode,
  AUTH_ENDPOINTS.refresh,
]);
