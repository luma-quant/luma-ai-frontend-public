import { useState } from 'react';
import { AlertCircle, Loader2, LogOut, ShieldCheck } from 'lucide-react';
import { acceptPlatformLegalBundle } from '../api/legal';
import { LEGAL_POLICY_VERSION } from '../legal/legalPolicies';

interface LegalAcceptanceGateProps {
  onAccepted: () => void;
  onLogout: () => void;
}

export function canSubmitPlatformLegalAcceptance(
  termsAgreed: boolean,
  privacyAcknowledged: boolean,
  isSaving: boolean,
): boolean {
  return termsAgreed && privacyAcknowledged && !isSaving;
}

function legalErrorMessage(): string {
  return 'Your acknowledgement could not be saved. Please try again.';
}

export function LegalAcceptanceGate({
  onAccepted,
  onLogout,
}: LegalAcceptanceGateProps) {
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [privacyAcknowledged, setPrivacyAcknowledged] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canContinue = canSubmitPlatformLegalAcceptance(
    termsAgreed,
    privacyAcknowledged,
    isSaving,
  );

  const submit = async () => {
    if (!canContinue) return;
    setIsSaving(true);
    setError(null);
    try {
      await acceptPlatformLegalBundle();
      onAccepted();
    } catch {
      console.warn('The legal acknowledgement could not be saved.');
      setError(legalErrorMessage());
      setIsSaving(false);
    }
  };

  return (
    <main className="relative z-10 flex h-full w-full items-center justify-center overflow-y-auto px-4 py-10">
      <section className="w-full max-w-2xl rounded-3xl border border-cyan-400/20 bg-[#0a1220]/95 p-6 shadow-2xl shadow-cyan-950/40 backdrop-blur-xl sm:p-9">
        <div className="mb-7 flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-cyan-400/30 bg-cyan-400/10">
            <ShieldCheck className="h-6 w-6 text-cyan-300" aria-hidden="true" />
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-cyan-300">
              Policy version {LEGAL_POLICY_VERSION}
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">
              Before you enter LUMA Quant
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              Please review the platform terms and privacy information. Neither
              acknowledgement is selected in advance.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.025] p-4 transition-colors hover:border-cyan-400/30">
            <input
              type="checkbox"
              checked={termsAgreed}
              onChange={(event) => setTermsAgreed(event.target.checked)}
              disabled={isSaving}
              className="mt-1 h-4 w-4 shrink-0 accent-cyan-400"
            />
            <span className="text-sm leading-6 text-slate-300">
              I have read and agree to the{' '}
              <a
                href="/legal/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-300 underline decoration-cyan-400/40 underline-offset-2 hover:text-cyan-200"
              >
                Terms of Service
              </a>
              .
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.025] p-4 transition-colors hover:border-cyan-400/30">
            <input
              type="checkbox"
              checked={privacyAcknowledged}
              onChange={(event) => setPrivacyAcknowledged(event.target.checked)}
              disabled={isSaving}
              className="mt-1 h-4 w-4 shrink-0 accent-cyan-400"
            />
            <span className="text-sm leading-6 text-slate-300">
              I have read and acknowledge the{' '}
              <a
                href="/legal/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-300 underline decoration-cyan-400/40 underline-offset-2 hover:text-cyan-200"
              >
                Privacy Policy
              </a>
              . This acknowledgement is not consent to optional marketing or
              tracking.
            </span>
          </label>
        </div>

        {error && (
          <div className="mt-5 flex items-start gap-3 rounded-xl border border-red-400/30 bg-red-400/5 px-4 py-3 text-sm text-red-200" role="alert">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={onLogout}
            disabled={isSaving}
            className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-white/10 px-4 text-sm text-slate-400 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-50"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign out
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canContinue}
            className="btn-cyber-glass flex min-h-[46px] items-center justify-center gap-2 rounded-xl px-7 text-sm font-semibold text-cyan-200 transition-all disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSaving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {isSaving ? 'Saving acknowledgement…' : 'Enter LUMA Quant'}
          </button>
        </div>
      </section>
    </main>
  );
}
