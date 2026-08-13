import type { LegalDocumentId } from '../legal/legalPolicies';

export type PublicRoute =
  | { kind: 'application' }
  | {
      kind: 'legal';
      documentId: LegalDocumentId | null;
      canonicalPath: string;
    };

const LEGAL_ROUTES: Readonly<Record<
  string,
  { documentId: LegalDocumentId | null; canonicalPath: string }
>> = {
  '/legal': { documentId: null, canonicalPath: '/legal' },
  '/legal/imprint': { documentId: 'imprint', canonicalPath: '/legal/imprint' },
  '/legal/terms': { documentId: 'terms', canonicalPath: '/legal/terms' },
  '/legal/privacy': { documentId: 'privacy', canonicalPath: '/legal/privacy' },
  '/legal/cookies': { documentId: 'cookies', canonicalPath: '/legal/cookies' },
  '/legal/paid-services': {
    documentId: 'paid-services',
    canonicalPath: '/legal/paid-services',
  },
  '/legal/acceptable-use': {
    documentId: 'acceptable-use',
    canonicalPath: '/legal/acceptable-use',
  },
  '/legal/copyright': {
    documentId: 'copyright',
    canonicalPath: '/legal/copyright',
  },
  '/terms': { documentId: 'terms', canonicalPath: '/legal/terms' },
  '/privacy': { documentId: 'privacy', canonicalPath: '/legal/privacy' },
  '/cookie-policy': {
    documentId: 'cookies',
    canonicalPath: '/legal/cookies',
  },
  '/imprint': { documentId: 'imprint', canonicalPath: '/legal/imprint' },
};

function normalizePathname(pathname: string): string {
  const withoutQueryOrHash = pathname.split(/[?#]/, 1)[0] || '/';
  const withLeadingSlash = withoutQueryOrHash.startsWith('/')
    ? withoutQueryOrHash
    : `/${withoutQueryOrHash}`;
  if (withLeadingSlash === '/') return '/';
  return withLeadingSlash.replace(/\/+$/, '') || '/';
}

export function resolvePublicRoute(pathname: string): PublicRoute {
  const normalizedPath = normalizePathname(pathname);
  const route = LEGAL_ROUTES[normalizedPath];
  return route ? { kind: 'legal', ...route } : { kind: 'application' };
}

export const PUBLIC_LEGAL_PATHS = Object.freeze(Object.keys(LEGAL_ROUTES));
