import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from 'lucide-react';
import { authApi, getApiErrorMessage } from '../auth/authApi';
import {
  finishPreAuthentication,
  InviteCodeError,
} from '../auth/authFlow';
import type {
  PreAuthResponse,
  ProviderSsoCredential,
  TokenPair,
} from '../auth/types';
import {
  renderGoogleIdentityButton,
} from '../auth/providerIdentity';
import { QuantumLogo } from './CosmicVisuals';
import { LegalFooterLinks } from './LegalFooterLinks';
import type {
  GoogleButtonRenderer,
  ProviderAvailabilityMap,
  ProviderTokenAcquirer,
} from '../auth/providerIdentity';

type Phase = 'choose' | 'email' | 'otp' | 'invite';

interface GatekeeperProps {
  onAuthenticated: (tokens: TokenPair) => Promise<void> | void;
  acquireProviderToken?: ProviderTokenAcquirer;
  providerAvailability?: ProviderAvailabilityMap;
  renderGoogleButton?: GoogleButtonRenderer;
}

declare global {
  interface Window {
    lumaIdentity?: {
      getProviderToken: ProviderTokenAcquirer;
    };
  }
}

export function Gatekeeper({
  onAuthenticated,
  acquireProviderToken,
  providerAvailability,
  renderGoogleButton,
}: GatekeeperProps) {
  const [phase, setPhase] = useState<Phase>('choose');
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [preAuth, setPreAuth] = useState<PreAuthResponse | null>(null);
  const [loadingLabel, setLoadingLabel] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [googleRenderAttempt, setGoogleRenderAttempt] = useState(0);
  const [googleButtonState, setGoogleButtonState] = useState<
    'idle' | 'loading' | 'ready' | 'error'
  >('idle');
  const [googleButtonError, setGoogleButtonError] = useState('');
  const googleButtonContainerRef = useRef<HTMLDivElement | null>(null);
  const providerAuthenticationInFlight = useRef(false);

  const isLoading = loadingLabel !== null;
  const configuredProviderAcquirer = acquireProviderToken
    ?? window.lumaIdentity?.getProviderToken;
  const configuredGoogleButtonRenderer = renderGoogleButton
    ?? renderGoogleIdentityButton;
  const providerStatus: ProviderAvailabilityMap = providerAvailability ?? {
    apple: {
      available: Boolean(configuredProviderAcquirer),
      unavailableMessage: configuredProviderAcquirer
        ? null
        : 'Apple Sign-In is not configured on this frontend.',
    },
    google: {
      available: Boolean(configuredGoogleButtonRenderer),
      unavailableMessage: configuredGoogleButtonRenderer
        ? null
        : 'Google Sign-In is not configured on this frontend.',
    },
  };

  const restart = (message = '') => {
    setPhase('choose');
    setOtpCode('');
    setInviteCode('');
    setPreAuth(null);
    setError(message);
  };

  const continueAfterIdentity = async (result: PreAuthResponse) => {
    if (result.requires_access_code) {
      setPreAuth(result);
      setPhase('invite');
      return;
    }

    const tokens = await finishPreAuthentication(result);
    await onAuthenticated(tokens);
  };

  const requestEmailCode = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      setError('Enter a valid email address.');
      return;
    }

    setLoadingLabel('Sending secure code…');
    setError('');
    try {
      await authApi.requestEmailCode(normalizedEmail);
      setEmail(normalizedEmail);
      setPhase('otp');
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Could not send the email code.'));
    } finally {
      setLoadingLabel(null);
    }
  };

  const verifyEmailCode = async () => {
    if (!/^\d{6}$/.test(otpCode)) {
      setError('Enter the complete 6-digit code.');
      return;
    }

    setLoadingLabel('Verifying identity…');
    setError('');
    let identityVerified = false;
    try {
      const result = await authApi.authenticateEmailOtp(email, otpCode);
      identityVerified = true;
      await continueAfterIdentity(result);
    } catch (verificationError) {
      const message = getApiErrorMessage(
        verificationError,
        'The email code is invalid.',
      );
      if (identityVerified) {
        restart(`${message} Sign in again; the pre-auth token is single-use.`);
      } else {
        setError(message);
      }
    } finally {
      setLoadingLabel(null);
    }
  };

  const authenticateProvider = async (
    credentialFactory: () => Promise<ProviderSsoCredential>,
    provider: ProviderSsoCredential['provider'],
  ) => {
    if (providerAuthenticationInFlight.current) return;
    providerAuthenticationInFlight.current = true;
    setLoadingLabel(`Connecting to ${provider === 'google' ? 'Google' : 'Apple'}…`);
    setError('');
    let identityVerified = false;
    try {
      const providerCredential = await credentialFactory();
      if (providerCredential.provider !== provider) {
        throw new Error('The identity provider returned mismatched credentials.');
      }
      const result = await authApi.authenticateSso(providerCredential);
      identityVerified = true;
      await continueAfterIdentity(result);
    } catch (providerError) {
      const message = getApiErrorMessage(providerError, 'Provider sign-in failed.');
      if (identityVerified) {
        restart(`${message} Sign in again; the pre-auth token is single-use.`);
      } else {
        setError(message);
      }
    } finally {
      providerAuthenticationInFlight.current = false;
      setLoadingLabel(null);
    }
  };

  const signInWithApple = async () => {
    if (
      !configuredProviderAcquirer
      || !providerStatus.apple.available
    ) {
      setError(
        providerStatus.apple.unavailableMessage
          ?? 'Apple Sign-In is unavailable.',
      );
      return;
    }
    await authenticateProvider(
      () => configuredProviderAcquirer('apple'),
      'apple',
    );
  };

  const googleCredentialHandler = useRef(
    (_credential: ProviderSsoCredential) => undefined,
  );
  googleCredentialHandler.current = (credential) => {
    void authenticateProvider(async () => credential, 'google');
  };

  useEffect(() => {
    if (
      !providerStatus.google.available
      || !googleButtonContainerRef.current
    ) {
      return;
    }

    let active = true;
    let removeButton: (() => void) | undefined;
    setGoogleButtonState('loading');
    setGoogleButtonError('');

    void configuredGoogleButtonRenderer(
      googleButtonContainerRef.current,
      {
        onCredential(credential) {
          if (!active) return;
          setGoogleButtonError('');
          setError('');
          googleCredentialHandler.current(credential);
        },
        onError(providerError) {
          if (!active) return;
          setGoogleButtonState('error');
          setGoogleButtonError(
            getApiErrorMessage(
              providerError,
              'Google Sign-In could not return a credential.',
            ),
          );
        },
      },
    ).then((cleanup) => {
      if (!active) {
        cleanup();
        return;
      }
      removeButton = cleanup;
      setGoogleButtonState('ready');
    }).catch((providerError) => {
      if (!active) return;
      setGoogleButtonState('error');
      setGoogleButtonError(
        getApiErrorMessage(
          providerError,
          'Google Sign-In could not be loaded.',
        ),
      );
    });

    return () => {
      active = false;
      removeButton?.();
    };
  }, [
    configuredGoogleButtonRenderer,
    googleRenderAttempt,
    providerStatus.google.available,
  ]);

  const redeemInvite = async () => {
    if (!preAuth) {
      restart('Your sign-in session expired. Please authenticate again.');
      return;
    }

    setLoadingLabel('Authorizing workspace…');
    setError('');
    try {
      const tokens = await finishPreAuthentication(
        preAuth,
        inviteCode,
      );
      await onAuthenticated(tokens);
    } catch (inviteError) {
      if (inviteError instanceof InviteCodeError) {
        setError(inviteError.message);
      } else {
        restart(
          `${getApiErrorMessage(inviteError, 'Authorization failed.')} Sign in again before retrying; the pre-auth token is single-use.`,
        );
      }
    } finally {
      setLoadingLabel(null);
    }
  };

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-between overflow-hidden bg-transparent px-4 font-sans">
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[620px] w-[620px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-900/10 blur-[110px]" />

      <header className="z-10 mt-4 flex h-16 w-full items-center justify-between px-2 sm:px-6">
        <div className="flex items-center gap-3">
          <QuantumLogo className="h-8 w-8" glowing />
          <span className="text-lg font-bold tracking-wide text-white">LUMA Quant</span>
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-emerald-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Secure gateway
        </div>
      </header>

      <main className="z-10 flex w-full flex-1 items-center justify-center">
        <AnimatePresence mode="wait">
          <motion.section
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.25 }}
            className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#0B0F19]/90 p-8 shadow-[0_0_50px_rgba(0,0,0,0.5)] backdrop-blur-xl sm:p-10"
          >
            <div className="mb-8 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-cyan-400/30 bg-cyan-400/10">
                {phase === 'invite'
                  ? <KeyRound className="h-6 w-6 text-fuchsia-400" />
                  : <LockKeyhole className="h-6 w-6 text-cyan-300" />}
              </div>
              <h1 className="mb-2 text-lg font-bold uppercase tracking-[0.2em] text-white">
                {phase === 'choose' && 'Zero Trust Access'}
                {phase === 'email' && 'Email Sign-In'}
                {phase === 'otp' && 'Verify Email'}
                {phase === 'invite' && 'Workspace Invite'}
              </h1>
              <p className="text-xs leading-relaxed text-[#A1A1AA]">
                {phase === 'choose' && 'Authenticate before entering the LUMA workspace.'}
                {phase === 'email' && 'We will send a one-time 6-digit code.'}
                {phase === 'otp' && `Enter the code sent to ${email}.`}
                {phase === 'invite' && 'Identity verified. Enter your LUMA invite code to authorize this account.'}
              </p>
            </div>

            <div
              aria-hidden={phase !== 'choose'}
              className={`flex flex-col gap-3 ${
                phase === 'choose' ? '' : 'hidden'
              }`}
            >
                <div>
                  <button
                    type="button"
                    disabled={isLoading || !providerStatus.apple.available}
                    title={providerStatus.apple.unavailableMessage ?? undefined}
                    onClick={() => void signInWithApple()}
                    className={providerStatus.apple.available
                      ? 'btn-cyber-glass w-full px-4 py-3 text-sm font-medium text-white disabled:cursor-wait disabled:opacity-50'
                      : 'w-full cursor-not-allowed rounded-xl border border-slate-700/70 bg-slate-800/70 px-4 py-3 text-sm font-medium text-slate-400 shadow-none transition-none hover:border-slate-700/70 hover:bg-slate-800/70 hover:text-slate-400'}
                  >
                    Continue with Apple
                  </button>
                  {!providerStatus.apple.available && providerStatus.apple.unavailableMessage && (
                    <p className="mt-2 text-center text-[10px] leading-relaxed text-slate-500">
                      {providerStatus.apple.unavailableMessage}
                    </p>
                  )}
                </div>
                {providerStatus.google.available ? (
                  <div>
                    <div className="relative min-h-11">
                      <div
                        ref={googleButtonContainerRef}
                        aria-label="Continue with Google"
                        className={`flex min-h-11 w-full items-center justify-center overflow-hidden rounded ${
                          isLoading ? 'pointer-events-none opacity-50' : ''
                        }`}
                      />
                      {googleButtonState === 'loading' && (
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded border border-white/10 bg-[#070A10] text-xs text-[#A1A1AA]">
                          Loading Google Sign-In…
                        </div>
                      )}
                    </div>
                    {googleButtonState === 'error' && (
                      <div className="mt-2 text-center text-[10px] leading-relaxed text-red-400">
                        <p>{googleButtonError}</p>
                        <button
                          type="button"
                          disabled={isLoading}
                          onClick={() => {
                            setError('');
                            setGoogleButtonError('');
                            setGoogleRenderAttempt((attempt) => attempt + 1);
                          }}
                          className="mt-1 text-cyan-300 underline-offset-2 hover:underline disabled:opacity-50"
                        >
                          Retry Google Sign-In
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled
                    title={providerStatus.google.unavailableMessage ?? undefined}
                    className="btn-cyber-glass w-full px-4 py-3 text-sm font-medium text-white opacity-50"
                  >
                    Continue with Google
                  </button>
                )}
                {providerStatus.google.unavailableMessage && (
                  <div className="text-center text-[10px] leading-relaxed text-[#71717A]">
                    <p>{providerStatus.google.unavailableMessage}</p>
                  </div>
                )}
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() => {
                    setError('');
                    setPhase('email');
                  }}
                  className="btn-cyber-glass flex w-full items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
                >
                  <Mail className="h-4 w-4" />
                  Continue with Email
                </button>
            </div>

            {phase === 'email' && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void requestEmailCode();
                }}
                className="space-y-4"
              >
                <input
                  type="email"
                  autoComplete="email"
                  autoFocus
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setError('');
                  }}
                  placeholder="you@example.com"
                  disabled={isLoading}
                  className="w-full rounded-xl border border-white/10 bg-[#070A10] px-4 py-4 text-white outline-none transition focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/20 disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={isLoading}
                  className="btn-cyber-gradient w-full py-4 text-sm font-bold uppercase tracking-widest text-white disabled:opacity-50"
                >
                  Send one-time code
                </button>
              </form>
            )}

            {phase === 'otp' && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void verifyEmailCode();
                }}
                className="space-y-4"
              >
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  maxLength={6}
                  value={otpCode}
                  onChange={(event) => {
                    setOtpCode(event.target.value.replace(/\D/g, ''));
                    setError('');
                  }}
                  placeholder="000000"
                  disabled={isLoading}
                  className="w-full rounded-xl border border-white/10 bg-[#070A10] px-4 py-4 text-center font-mono text-3xl tracking-[0.45em] text-cyan-300 outline-none transition focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/20 disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={isLoading || otpCode.length !== 6}
                  className="btn-cyber-gradient w-full py-4 text-sm font-bold uppercase tracking-widest text-white disabled:opacity-50"
                >
                  Verify identity
                </button>
              </form>
            )}

            {phase === 'invite' && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void redeemInvite();
                }}
                className="space-y-4"
              >
                <input
                  type="text"
                  autoComplete="off"
                  autoFocus
                  minLength={8}
                  maxLength={128}
                  value={inviteCode}
                  onChange={(event) => {
                    setInviteCode(event.target.value);
                    setError('');
                  }}
                  placeholder="LUMA-XXXX-XXXX-XXXX-XXXXX"
                  disabled={isLoading}
                  className="w-full rounded-xl border border-white/10 bg-[#070A10] px-4 py-4 text-center font-mono text-sm tracking-wider text-fuchsia-300 outline-none transition focus:border-fuchsia-400/60 focus:ring-2 focus:ring-fuchsia-400/20 disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={isLoading || inviteCode.trim().length < 8}
                  className="btn-cyber-gradient flex w-full items-center justify-center gap-2 py-4 text-sm font-bold uppercase tracking-widest text-white disabled:opacity-50"
                >
                  <ShieldCheck className="h-4 w-4" />
                  Authorize workspace
                </button>
              </form>
            )}

            {error && (
              <p role="alert" className="mt-5 text-center text-xs leading-relaxed text-red-400">
                {error}
              </p>
            )}

            {isLoading && (
              <div className="mt-5 flex items-center justify-center gap-2 text-xs text-cyan-300">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                {loadingLabel}
              </div>
            )}

            {phase !== 'choose' && (
              <button
                type="button"
                disabled={isLoading}
                onClick={() => restart()}
                className="mx-auto mt-6 flex items-center gap-1.5 text-xs text-[#A1A1AA] transition hover:text-white disabled:opacity-50"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Start over
              </button>
            )}
          </motion.section>
        </AnimatePresence>
      </main>

      <footer className="z-10 flex w-full flex-col items-center justify-center gap-2 border-t border-white/5 p-4 font-mono text-[10px] uppercase tracking-widest text-[#71717A] sm:flex-row sm:gap-5 sm:p-6">
        <span>Access and refresh tokens are issued only after server authorization</span>
        <LegalFooterLinks className="normal-case tracking-normal" />
      </footer>
    </div>
  );
}
