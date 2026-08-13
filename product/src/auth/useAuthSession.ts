import { useCallback, useEffect, useState } from 'react';
import { refreshSessionTokens } from '../api/apiClient';
import { clearAdvisorBrowserState } from '../api/advisorRunRecovery';
import { authApi, getApiErrorMessage } from './authApi';
import { decodeAccessToken } from './jwt';
import {
  AUTH_TOKEN_CHANGED_EVENT,
  clearLegacyTokenKeys,
  clearTokenPair,
  persistTokenPair,
  readTokenPair,
} from './tokenStorage';
import type { AccessTokenClaims, TokenPair } from './types';

export type AuthSessionStatus = 'restoring' | 'anonymous' | 'authenticated';

export interface AuthSessionState {
  status: AuthSessionStatus;
  claims: AccessTokenClaims | null;
  lumaProAvailable: boolean;
  lumaProUnavailableReason: string | null;
  capabilityError: string | null;
}

const anonymousState: AuthSessionState = {
  status: 'anonymous',
  claims: null,
  lumaProAvailable: false,
  lumaProUnavailableReason: null,
  capabilityError: null,
};

export function useAuthSession() {
  const [session, setSession] = useState<AuthSessionState>({
    ...anonymousState,
    status: 'restoring',
  });

  const loadCapabilities = useCallback(async () => {
    try {
      const config = await authApi.getAdvisorConfig();
      setSession((current) => {
        if (current.status !== 'authenticated') return current;
        return {
          ...current,
          lumaProAvailable: config.luma_pro.available,
          lumaProUnavailableReason: config.luma_pro.unavailable_reason,
          capabilityError: null,
        };
      });
    } catch (error) {
      if (!readTokenPair().access_token) {
        setSession(anonymousState);
        return;
      }
      setSession((current) => {
        if (current.status !== 'authenticated') return current;
        return {
          ...current,
          lumaProAvailable: false,
          lumaProUnavailableReason: null,
          capabilityError: getApiErrorMessage(
            error,
            'Could not load Advisor capabilities.',
          ),
        };
      });
    }
  }, []);

  const establishSession = useCallback(async (tokens: TokenPair) => {
    const claims = decodeAccessToken(tokens.access_token);
    persistTokenPair(tokens);
    setSession({
      status: 'authenticated',
      claims,
      lumaProAvailable: false,
      lumaProUnavailableReason: null,
      capabilityError: null,
    });
    await loadCapabilities();
  }, [loadCapabilities]);

  const logout = useCallback(() => {
    clearTokenPair();
    clearAdvisorBrowserState(window.localStorage);
    setSession(anonymousState);
  }, []);

  useEffect(() => {
    let active = true;

    const restore = async () => {
      clearLegacyTokenKeys();
      const stored = readTokenPair();

      try {
        if (!stored.access_token) {
          if (!stored.refresh_token) throw new Error('No saved session.');
          const refreshed = await refreshSessionTokens();
          if (!active) return;
          const claims = decodeAccessToken(refreshed.access_token);
          setSession({
            status: 'authenticated',
            claims,
            lumaProAvailable: false,
            lumaProUnavailableReason: null,
            capabilityError: null,
          });
          await loadCapabilities();
          return;
        }

        let claims: AccessTokenClaims;
        try {
          claims = decodeAccessToken(stored.access_token);
        } catch {
          if (!stored.refresh_token) throw new Error('The saved session expired.');
          const refreshed = await refreshSessionTokens();
          claims = decodeAccessToken(refreshed.access_token);
        }

        if (!active) return;
        setSession({
          status: 'authenticated',
          claims,
          lumaProAvailable: false,
          lumaProUnavailableReason: null,
          capabilityError: null,
        });
        await loadCapabilities();
      } catch {
        if (!active) return;
        clearTokenPair();
        clearAdvisorBrowserState(window.localStorage);
        setSession(anonymousState);
      }
    };

    void restore();
    return () => {
      active = false;
    };
  }, [loadCapabilities]);

  useEffect(() => {
    const syncAccessToken = () => {
      const accessToken = readTokenPair().access_token;
      if (!accessToken) {
        clearAdvisorBrowserState(window.localStorage);
        setSession(anonymousState);
        return;
      }
      try {
        const claims = decodeAccessToken(accessToken);
        setSession((current) => (
          current.status === 'authenticated'
            ? { ...current, claims }
            : current
        ));
      } catch {
        // The interceptor or restore path will attempt refresh when appropriate.
      }
    };

    window.addEventListener(AUTH_TOKEN_CHANGED_EVENT, syncAccessToken);
    window.addEventListener('storage', syncAccessToken);
    return () => {
      window.removeEventListener(AUTH_TOKEN_CHANGED_EVENT, syncAccessToken);
      window.removeEventListener('storage', syncAccessToken);
    };
  }, []);

  return {
    ...session,
    establishSession,
    logout,
    reloadCapabilities: loadCapabilities,
  };
}
