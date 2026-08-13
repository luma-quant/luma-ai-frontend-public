import { useEffect, useRef, useState } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { motion } from 'motion/react';
import {
  AlertCircle,
  CheckCircle2,
  History,
  Loader2,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import { readPendingCheckout } from '../api/checkoutState';
import {
  createOrResumePaymentCheckout,
  PaymentCheckoutCreditedError,
  PaymentCheckoutProcessingError,
} from '../api/paymentCheckout';
import {
  PAYMENT_RECONCILIATION_EVENT,
  PAYMENT_RECONCILIATION_REQUEST_EVENT,
  type PaymentReconciliationNotice,
} from '../api/paymentReconciliation';
import {
  createPaidTermsCheckoutAcknowledgement,
  fetchPaymentConfig,
  type PaidTermsCheckoutAcknowledgement,
  type PaymentConfigResponse,
  type PaymentCreditPack,
} from '../api/payments';

interface CreditStoreProps {
  credits: number | null;
  standardAnalysisCredits?: number;
  onNavigateToHistory: () => void;
  onCreditsChanged?: (balance?: number) => void | Promise<void>;
}

type Notice = {
  tone: 'success' | 'warning' | 'error';
  message: string;
};

const STORAGE_PROBE_KEY = 'luma.checkout-storage-probe';
const DEFAULT_STANDARD_ANALYSIS_CREDITS = 175;

const PAYMENT_MESSAGE_BY_CODE: Record<string, string> = {
  payment_order_legal_evidence_missing:
    'A previous checkout used outdated legal evidence and could not be resumed. No payment was initiated. Please start checkout again.',
};

function paymentMessage(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  if (PAYMENT_MESSAGE_BY_CODE[value]) return PAYMENT_MESSAGE_BY_CODE[value];
  return /^[a-z0-9_]+$/u.test(value) ? fallback : value;
}

function errorMessage(error: unknown, fallback: string): string {
  if (
    typeof error === 'object'
    && error !== null
    && 'response' in error
    && typeof (error as { response?: { data?: { detail?: unknown } } }).response
      ?.data?.detail === 'string'
  ) {
    const detail = (error as { response: { data: { detail: string } } }).response.data.detail;
    return paymentMessage(detail, fallback);
  }
  if (error instanceof Error && error.message) {
    return paymentMessage(error.message, fallback);
  }
  return fallback;
}

function creditValue(pack: PaymentCreditPack): number {
  const value = Number(pack.credits);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function formatCredits(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatMoney(pack: PaymentCreditPack): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: pack.currency.toUpperCase(),
    }).format(pack.amount_minor / 100);
  } catch {
    return `${(pack.amount_minor / 100).toFixed(2)} ${pack.currency.toUpperCase()}`;
  }
}

function displayPackLabel(pack: PaymentCreditPack): string {
  if (pack.pack_id === 'big' || pack.label.trim().toUpperCase() === 'BIG') {
    return 'B.I.G';
  }
  if (pack.kind === 'calendar_month_pass') return 'Monthly Pass';
  return pack.label;
}

function packChipClass(packId: string): string {
  switch (packId) {
    case 'starter':
      return 'border-violet-400/35 bg-gradient-to-r from-violet-500/20 to-fuchsia-500/15 text-white';
    case 'core':
      return 'border-sky-400/30 bg-gradient-to-r from-sky-500/20 to-blue-500/15 text-white';
    case 'pro':
      return 'border-cyan-400/40 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-white';
    case 'studio':
      return 'border-indigo-400/35 bg-gradient-to-r from-indigo-500/20 to-violet-500/15 text-white';
    case 'big':
      return 'border-teal-300/35 bg-gradient-to-r from-teal-500/20 to-cyan-500/15 text-white';
    default:
      return 'border-white/15 bg-gradient-to-r from-slate-500/20 to-slate-700/20 text-white';
  }
}

function packCardClass(packId: string): string {
  switch (packId) {
    case 'starter':
      return 'border-violet-400/35 shadow-[inset_0_1px_0_rgba(167,139,250,0.08)]';
    case 'core':
      return 'border-sky-400/30 shadow-[inset_0_1px_0_rgba(56,189,248,0.08)]';
    case 'pro':
      return 'border-cyan-400/50 shadow-md shadow-cyan-900/10';
    case 'studio':
      return 'border-indigo-400/35 shadow-[inset_0_1px_0_rgba(129,140,248,0.08)]';
    case 'big':
      return 'border-teal-300/35 shadow-[inset_0_1px_0_rgba(94,234,212,0.08)]';
    default:
      return 'border-white/10';
  }
}

type CreditStoreActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

function CreditStoreActionButton({
  className = '',
  children,
  ...props
}: CreditStoreActionButtonProps) {
  return (
    <button
      className={`btn-cyber-gradient flex h-11 min-h-[44px] items-center justify-center gap-2 rounded-xl px-5 font-sans text-sm font-bold text-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#080c14] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

function formatDateTime(value: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Europe/Vienna',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatDate(value: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'long',
      timeZone: 'Europe/Vienna',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function ensureCheckoutStorageAvailable(): void {
  window.localStorage.setItem(STORAGE_PROBE_KEY, '1');
  window.localStorage.removeItem(STORAGE_PROBE_KEY);
}

function noticeTone(
  status: PaymentReconciliationNotice['status'],
): Notice['tone'] {
  if (status === 'credited') return 'success';
  if (
    status === 'reconciling'
    || status === 'delayed'
    || status === 'canceled'
  ) {
    return 'warning';
  }
  return 'error';
}

interface PaidCheckoutConfirmationProps {
  pack: PaymentCreditPack;
  paidTermsAccepted: boolean;
  immediatePerformanceAccepted: boolean;
  onPaidTermsAcceptedChange: (accepted: boolean) => void;
  onImmediatePerformanceAcceptedChange: (accepted: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export function PaidCheckoutConfirmation({
  pack,
  paidTermsAccepted,
  immediatePerformanceAccepted,
  onPaidTermsAcceptedChange,
  onImmediatePerformanceAcceptedChange,
  onCancel,
  onConfirm,
}: PaidCheckoutConfirmationProps) {
  const canContinue = paidTermsAccepted && immediatePerformanceAccepted;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#020713]/85 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="checkout-confirmation-title"
    >
      <div className="relative w-full max-w-xl rounded-2xl border border-cyan-400/25 bg-[#0b1322] p-6 shadow-2xl shadow-cyan-950/50 md:p-7">
        <button
          type="button"
          onClick={onCancel}
          className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 text-slate-400 transition-colors hover:border-cyan-400/30 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-400/50"
          aria-label="Close purchase confirmation"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>

        <div className="mb-5 flex items-center gap-3 pr-12">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-400/10">
            <ShieldCheck className="h-5 w-5 text-cyan-300" aria-hidden="true" />
          </div>
          <div>
            <h3
              id="checkout-confirmation-title"
              className="text-xl font-semibold text-white"
            >
              Confirm your purchase
            </h3>
            <p className="mt-1 text-sm text-slate-400">
              Review the terms before continuing to Stripe.
            </p>
          </div>
        </div>

        <div className="mb-5 grid grid-cols-3 gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm">
          <div>
            <p className="text-xs uppercase tracking-wider text-slate-500">Offer</p>
            <p className="mt-1 truncate text-white">{displayPackLabel(pack)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-slate-500">Credits</p>
            <p className="mt-1 text-white">{formatCredits(creditValue(pack))}</p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wider text-slate-500">Total</p>
            <p className="mt-1 font-semibold text-cyan-300">{formatMoney(pack)}</p>
          </div>
        </div>

        <p className="mb-4 text-xs leading-relaxed text-slate-400">
          {pack.kind === 'calendar_month_pass'
            ? 'This is a one-time purchase. It does not auto-renew, can be purchased once per calendar month, and its credits expire at the end of that month.'
            : 'This is a one-time credit purchase. Purchased credit-pack credits have no platform expiration date.'}
        </p>

        <div className="space-y-3">
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/[0.025] p-4 transition-colors hover:border-cyan-400/25">
            <input
              type="checkbox"
              aria-label="Agree to Paid Services and Credits Terms"
              checked={paidTermsAccepted}
              onChange={(event) => onPaidTermsAcceptedChange(event.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-cyan-400"
            />
            <span className="text-sm leading-relaxed text-slate-300">
              I agree to the{' '}
              <a
                href="/legal/paid-services"
                target="_blank"
                rel="noreferrer"
                className="text-cyan-300 underline decoration-cyan-400/40 underline-offset-2 hover:text-cyan-200"
              >
                Paid Services &amp; Credits Terms
              </a>
              .
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/[0.025] p-4 transition-colors hover:border-cyan-400/25">
            <input
              type="checkbox"
              aria-label="Request immediate performance and acknowledge withdrawal effects"
              checked={immediatePerformanceAccepted}
              onChange={(event) => onImmediatePerformanceAcceptedChange(event.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-cyan-400"
            />
            <span className="text-sm leading-relaxed text-slate-300">
              I expressly request immediate delivery and performance before
              the 14-day withdrawal period ends. I acknowledge that, where
              the legal conditions are met, my withdrawal right may end once
              the service is fully performed or digital delivery begins.
            </span>
          </label>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-slate-500">
          Your statutory consumer rights remain unaffected. Stripe will show
          the payment methods available for your country, device and purchase.
        </p>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[44px] rounded-xl border border-white/10 px-5 text-sm text-slate-300 transition-colors hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
          >
            Cancel
          </button>
          <CreditStoreActionButton
            type="button"
            onClick={onConfirm}
            disabled={!canContinue}
            className="px-6 sm:w-auto"
          >
            Continue to Stripe
          </CreditStoreActionButton>
        </div>
      </div>
    </div>
  );
}

export const CreditStore = ({
  credits,
  standardAnalysisCredits = DEFAULT_STANDARD_ANALYSIS_CREDITS,
  onNavigateToHistory,
  onCreditsChanged,
}: CreditStoreProps) => {
  const [config, setConfig] = useState<PaymentConfigResponse | null>(null);
  const [isConfigLoading, setIsConfigLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  const [configReload, setConfigReload] = useState(0);
  const [busyPackId, setBusyPackId] = useState<string | null>(null);
  const [isReconciling, setIsReconciling] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pendingCheckoutPack, setPendingCheckoutPack] =
    useState<PaymentCreditPack | null>(null);
  const [paidTermsAccepted, setPaidTermsAccepted] = useState(false);
  const [immediatePerformanceAccepted, setImmediatePerformanceAccepted] =
    useState(false);
  const checkoutActionInFlightRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    setIsConfigLoading(true);
    setConfigError(null);
    fetchPaymentConfig(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setConfig(value);
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setConfig(null);
          setConfigError(errorMessage(
            error,
            'Credit packages are currently unavailable.',
          ));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsConfigLoading(false);
      });
    return () => controller.abort();
  }, [configReload]);

  useEffect(() => {
    const handleReconciliation = (event: Event) => {
      const detail = (event as CustomEvent<PaymentReconciliationNotice>).detail;
      if (!detail) return;
      setIsReconciling(detail.status === 'reconciling');
      setNotice({
        tone: noticeTone(detail.status),
        message: detail.message,
      });
      if (
        detail.status === 'credited'
        || detail.status === 'terminal'
        || detail.status === 'canceled'
      ) {
        setConfigReload((value) => value + 1);
        if (onCreditsChanged) void onCreditsChanged();
      }
    };

    window.addEventListener(
      PAYMENT_RECONCILIATION_EVENT,
      handleReconciliation,
    );

    try {
      const pending = readPendingCheckout(window.localStorage);
      if (pending?.phase === 'return_confirmed') {
        setIsReconciling(true);
        setNotice({
          tone: 'warning',
          message: 'Payment received. Waiting for secure ledger confirmation…',
        });
      }
    } catch {
      setNotice({
        tone: 'error',
        message: 'Browser storage is unavailable, so checkout cannot be verified.',
      });
    }

    return () => {
      window.removeEventListener(
        PAYMENT_RECONCILIATION_EVENT,
        handleReconciliation,
      );
    };
  }, [onCreditsChanged]);

  const handleCheckout = async (
    pack: PaymentCreditPack,
    legalAcknowledgement: PaidTermsCheckoutAcknowledgement,
  ) => {
    if (checkoutActionInFlightRef.current) return;
    let resumableOwnCheckout = false;
    try {
      const pending = readPendingCheckout(window.localStorage);
      resumableOwnCheckout = Boolean(
        pending
        && pending.packId === pack.pack_id
        && (
          pending.phase === 'request_prepared'
          || pending.phase === 'checkout_created'
        ),
      );
    } catch {
      // The storage availability probe below provides the user-facing error.
    }
    if (!pack.can_purchase && !resumableOwnCheckout) {
      setNotice({
        tone: 'warning',
        message: paymentMessage(
          pack.unavailable_reason,
          'This offer is not currently available for your account.',
        ),
      });
      return;
    }
    checkoutActionInFlightRef.current = true;
    setNotice(null);
    setBusyPackId(pack.pack_id);
    try {
      ensureCheckoutStorageAvailable();
      const checkout = await createOrResumePaymentCheckout(pack.pack_id, {
        storage: window.localStorage,
        legalAcknowledgement,
      });
      if (!checkout.checkoutUrl) {
        throw new Error('Checkout did not provide a secure redirect URL.');
      }
      window.location.assign(checkout.checkoutUrl);
    } catch (error) {
      const processing = error instanceof PaymentCheckoutProcessingError;
      const credited = error instanceof PaymentCheckoutCreditedError;
      if (processing) {
        setIsReconciling(true);
        window.dispatchEvent(
          new Event(PAYMENT_RECONCILIATION_REQUEST_EVENT),
        );
      }
      if (credited) {
        setConfigReload((value) => value + 1);
        if (onCreditsChanged) void onCreditsChanged();
      }
      setNotice({
        tone: processing ? 'warning' : credited ? 'success' : 'error',
        message: errorMessage(error, 'Checkout could not be started.'),
      });
      setBusyPackId(null);
    } finally {
      checkoutActionInFlightRef.current = false;
    }
  };

  const openCheckoutConfirmation = (pack: PaymentCreditPack) => {
    if (!pack.can_purchase || busyPackId !== null || isReconciling) return;
    setPaidTermsAccepted(false);
    setImmediatePerformanceAccepted(false);
    setPendingCheckoutPack(pack);
  };

  const closeCheckoutConfirmation = () => {
    if (busyPackId !== null) return;
    setPendingCheckoutPack(null);
    setPaidTermsAccepted(false);
    setImmediatePerformanceAccepted(false);
  };

  const confirmCheckout = () => {
    if (
      !pendingCheckoutPack
      || !paidTermsAccepted
      || !immediatePerformanceAccepted
    ) {
      return;
    }
    const pack = pendingCheckoutPack;
    const legalAcknowledgement = createPaidTermsCheckoutAcknowledgement(
      paidTermsAccepted,
      immediatePerformanceAccepted,
    );
    setPendingCheckoutPack(null);
    void handleCheckout(pack, legalAcknowledgement);
  };

  const packOrder = new Map([
    ['starter', 0],
    ['core', 1],
    ['pro', 2],
    ['studio', 3],
    ['big', 4],
    ['monthly_pass', 5],
  ]);
  const packs = [...(config?.packs ?? [])].sort((left, right) => {
    const leftOrder = packOrder.get(left.pack_id) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = packOrder.get(right.pack_id) ?? Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder;
  });
  const standardPacks = packs.filter(
    (pack) => pack.kind !== 'calendar_month_pass',
  );
  const monthlyPasses = packs.filter(
    (pack) => pack.kind === 'calendar_month_pass',
  );

  return (
    <div className="w-full flex justify-center py-12 px-4 md:px-8 overflow-y-auto">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-[1200px] w-full">
        <div className="flex flex-col md:flex-row md:justify-between md:items-end mb-10 gap-6">
          <div>
            <h2 className="text-white text-3xl font-display font-medium mb-2">Credits</h2>
            <p className="text-slate-500 font-sans text-sm">Purchase credits for LUMA analyses and additional data modules.</p>
            <p className="text-slate-400 font-sans text-sm mt-1">Standard analysis starts at {standardAnalysisCredits} credits.</p>
            <p className="mt-2 max-w-2xl font-sans text-xs leading-relaxed text-slate-500">
              Stripe may show Link first. Choose <span className="text-slate-300">Pay without Link</span> in Checkout to view the other payment methods available for your country, device, currency and purchase.
            </p>
          </div>
          <div className="text-left md:text-right">
            <p className="text-slate-500 font-sans text-xs uppercase tracking-widest mb-1">Current balance</p>
            <p className="text-cyan-400 font-sans text-2xl font-bold">
              {credits !== null ? `${credits.toLocaleString()} credits` : '---'}
            </p>
            {credits !== null && credits < standardAnalysisCredits && (
              <p className="text-cyan-400/90 font-sans text-xs mt-1">
                You need {standardAnalysisCredits - credits} more credits to run a standard analysis.
              </p>
            )}
          </div>
        </div>


        {notice && (
          <div className={`mb-8 flex items-center gap-3 rounded-xl border px-4 py-3 text-sm ${
            notice.tone === 'success'
              ? 'border-emerald-400/30 bg-emerald-400/5 text-emerald-200'
              : notice.tone === 'error'
                ? 'border-red-400/30 bg-red-400/5 text-red-200'
                : 'border-amber-400/30 bg-amber-400/5 text-amber-200'
          }`}>
            {notice.tone === 'success'
              ? <CheckCircle2 className="h-4 w-4 shrink-0" />
              : isReconciling
                ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                : <AlertCircle className="h-4 w-4 shrink-0" />}
            <span>{notice.message}</span>
          </div>
        )}

        {config && !config.livemode && (
          <div className="mb-8 flex items-center gap-3 rounded-xl border border-amber-400/30 bg-amber-400/5 px-4 py-3 text-sm text-amber-200">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>Stripe test mode is active. No real payment will be charged.</span>
          </div>
        )}

        {configError && (
          <div className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-400/30 bg-red-400/5 px-4 py-3 text-sm text-red-200">
            <span className="flex items-center gap-3">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {configError}
            </span>
            <button
              type="button"
              onClick={() => setConfigReload((value) => value + 1)}
              className="flex min-h-[36px] items-center gap-2 rounded-lg border border-red-300/30 px-3 text-xs hover:bg-red-300/10"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </button>
          </div>
        )}

        {isConfigLoading ? (
          <>
            <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {[1, 2, 3, 4, 5].map((item) => (
                <div key={item} className="h-[300px] animate-pulse rounded-2xl border border-white/5 bg-white/[0.03]" />
              ))}
            </div>
            <div className="mb-12 h-[230px] animate-pulse rounded-2xl border border-white/5 bg-white/[0.03]" />
          </>
        ) : packs.length > 0 ? (
          <div className="mb-12 space-y-6">
            {standardPacks.length > 0 && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                {standardPacks.map((pack) => {
                  const packCredits = creditValue(pack);
                  const standardAnalysisCount = Math.floor(packCredits / standardAnalysisCredits);
                  const remainingCredits = packCredits % standardAnalysisCredits;
                  const isRecommended =
                    pack.pack_id === 'pro'
                    || pack.label.toLowerCase().includes('recommended');
                  const isBusy = busyPackId === pack.pack_id;
                  const checkoutDisabled =
                    !pack.can_purchase
                    || busyPackId !== null
                    || isReconciling
                    || packCredits <= 0;

                  return (
                    <div
                      key={pack.pack_id}
                      className={`relative flex min-h-[300px] flex-col overflow-hidden rounded-2xl border bg-surface-secondary/50 p-5 backdrop-blur-xl ${packCardClass(pack.pack_id)} ${isRecommended ? 'ring-1 ring-cyan-400/10' : ''}`}
                    >
                      <div
                        className={`absolute right-4 top-4 max-w-[calc(100%-2rem)] truncate rounded-full border px-3 py-1 text-[10px] font-medium uppercase tracking-widest ${packChipClass(pack.pack_id)}`}
                        title={displayPackLabel(pack)}
                      >
                        {displayPackLabel(pack)}
                      </div>

                      <h3 className="mb-1 mt-10 font-sans text-3xl font-bold text-white">
                        {formatCredits(packCredits)}
                      </h3>
                      <p className="mb-6 font-sans text-sm text-slate-400">credits</p>

                      <div className="mb-8 flex flex-col gap-1">
                        <p className="font-sans text-sm font-medium text-slate-300">
                          {standardAnalysisCount} standard {standardAnalysisCount === 1 ? 'analysis' : 'analyses'}
                        </p>
                        <p className="font-sans text-xs text-slate-500">
                          {formatCredits(remainingCredits)} credits remaining
                        </p>
                      </div>

                      <div className="mt-auto">
                        <p className="mb-4 font-sans text-xl text-white">{formatMoney(pack)}</p>
                        {!pack.can_purchase && (
                          <div className="mb-3 rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-xs text-amber-100">
                            <p>{paymentMessage(pack.unavailable_reason, 'Currently unavailable.')}</p>
                            {pack.next_purchase_at && (
                              <p className="mt-1 text-amber-200/80">
                                Available again {formatDateTime(pack.next_purchase_at)}
                              </p>
                            )}
                          </div>
                        )}
                        <CreditStoreActionButton
                          type="button"
                          disabled={checkoutDisabled}
                          onClick={() => openCheckoutConfirmation(pack)}
                          className="w-full px-4"
                        >
                          {isBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                          {isBusy
                            ? 'Opening checkout…'
                            : !pack.can_purchase
                              ? 'Not available'
                              : 'Buy credits'}
                        </CreditStoreActionButton>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {monthlyPasses.map((pack) => {
              const packCredits = creditValue(pack);
              const standardAnalysisCount = Math.floor(packCredits / standardAnalysisCredits);
              const remainingCredits = packCredits % standardAnalysisCredits;
              const isBusy = busyPackId === pack.pack_id;
              const checkoutDisabled =
                !pack.can_purchase
                || busyPackId !== null
                || isReconciling
                || packCredits <= 0;

              return (
                <div
                  key={pack.pack_id}
                  className="relative flex flex-col items-stretch justify-between gap-8 overflow-hidden rounded-2xl border border-cyan-400/30 bg-gradient-to-r from-[#0f172a] to-[#1e1b4b] p-6 md:flex-row md:items-center md:p-8"
                >
                  <div className="pointer-events-none absolute right-0 top-0 h-64 w-64 rounded-full bg-cyan-400/10 blur-[80px]" />

                  <div className="relative z-10 flex min-w-0 flex-1 flex-col">
                    <div className="mb-3 flex flex-wrap items-center gap-3">
                      <h3 className="font-sans text-2xl font-bold text-white">{displayPackLabel(pack)}</h3>
                    </div>
                    <p className="mb-4 font-sans text-lg font-medium text-cyan-200">
                      {formatCredits(packCredits)} credits
                    </p>
                    <div className="flex flex-col gap-1">
                      <p className="font-sans text-sm font-medium text-white">
                        {standardAnalysisCount} standard {standardAnalysisCount === 1 ? 'analysis' : 'analyses'}
                      </p>
                      <p className="font-sans text-xs text-slate-400">
                        {formatCredits(remainingCredits)} credits remaining
                      </p>
                      <p className="mt-2 font-sans text-xs text-slate-300">
                        Valid until the end of the calendar month
                      </p>
                      {pack.valid_until && (
                        <p className="font-sans text-xs text-slate-400">
                          Valid through {formatDate(pack.valid_until)}
                        </p>
                      )}
                      {pack.active_remaining_credits !== null && (
                        <p className="font-sans text-xs text-cyan-200">
                          {formatCredits(Number(pack.active_remaining_credits))} active pass credits remaining
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="relative z-10 flex w-full shrink-0 flex-col gap-4 md:w-56 md:items-end">
                    <div className="text-left md:text-right">
                      <p className="font-sans text-3xl font-bold text-white">{formatMoney(pack)}</p>
                      <p className="mt-1 font-sans text-xs uppercase tracking-widest text-slate-400">valid this calendar month</p>
                    </div>
                    {!pack.can_purchase && (
                      <div className="w-full rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-xs text-amber-100">
                        <p>{paymentMessage(pack.unavailable_reason, 'Currently unavailable.')}</p>
                        {pack.next_purchase_at && (
                          <p className="mt-1 text-amber-200/80">
                            Available again {formatDateTime(pack.next_purchase_at)}
                          </p>
                        )}
                      </div>
                    )}
                    <CreditStoreActionButton
                      type="button"
                      disabled={checkoutDisabled}
                      onClick={() => openCheckoutConfirmation(pack)}
                      className="w-full"
                    >
                      {isBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                      {isBusy
                        ? 'Opening checkout…'
                        : !pack.can_purchase
                          ? 'Not available this month'
                          : 'Buy Monthly Pass'}
                    </CreditStoreActionButton>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        <div className="bg-surface-secondary/30 rounded-2xl p-6 border border-white/5 mb-8">
          <h3 className="text-white font-sans text-sm font-medium mb-4">How credits work</h3>
          <ul className="flex flex-col gap-3">
            <li className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-slate-500 mt-2 shrink-0" />
              <span className="text-slate-300 font-sans text-sm">Standard analyses start at {standardAnalysisCredits} credits.</span>
            </li>
            <li className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-slate-500 mt-2 shrink-0" />
              <span className="text-slate-300 font-sans text-sm">Prices and credit amounts are loaded directly from the secure backend catalog.</span>
            </li>
            <li className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-slate-500 mt-2 shrink-0" />
              <span className="text-slate-300 font-sans text-sm">Credits appear only after the signed payment webhook confirms settlement.</span>
            </li>
            <li className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-slate-500 mt-2 shrink-0" />
              <span className="text-slate-300 font-sans text-sm">Monthly Pass credits expire at the end of the purchase month and the pass can be bought once per calendar month.</span>
            </li>
          </ul>
        </div>

        <div className="flex justify-center md:justify-start">
          <button
            onClick={onNavigateToHistory}
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm font-sans min-h-[44px]"
          >
            <History className="w-4 h-4" />
            <span>Transaction history</span>
          </button>
        </div>
      </motion.div>

      {pendingCheckoutPack && (
        <PaidCheckoutConfirmation
          pack={pendingCheckoutPack}
          paidTermsAccepted={paidTermsAccepted}
          immediatePerformanceAccepted={immediatePerformanceAccepted}
          onPaidTermsAcceptedChange={setPaidTermsAccepted}
          onImmediatePerformanceAcceptedChange={setImmediatePerformanceAccepted}
          onCancel={closeCheckoutConfirmation}
          onConfirm={confirmCheckout}
        />
      )}
    </div>
  );
};
