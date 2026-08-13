import { AUTH_TOKEN_CHANGED_EVENT, readTokenPair } from '../auth/tokenStorage';
import {
  checkoutReturnUrlWithoutPaymentParams,
  clearPendingCheckout,
  confirmCheckoutReturn,
  readCheckoutReturn,
  readPendingCheckout,
  requestCheckoutCancellation,
  type CreatedCheckout,
} from './checkoutState';
import {
  cancelCheckoutSession,
  fetchPaymentOrder,
  isFinalPaymentOrder,
  type PaymentOrderResponse,
} from './payments';

export const PAYMENT_RECONCILIATION_EVENT =
  'luma:payment-reconciliation';
export const PAYMENT_RECONCILIATION_REQUEST_EVENT =
  'luma:payment-reconciliation-request';
export const CREDITS_CHANGED_EVENT = 'luma:credits-changed';

export type PaymentReconciliationNotice = {
  status: 'reconciling' | 'credited' | 'terminal' | 'delayed' | 'canceled' | 'error';
  message: string;
};

type CheckoutStorage = Pick<
  Storage,
  'getItem' | 'setItem' | 'removeItem'
>;

export interface ConsumeCheckoutReturnOptions {
  storage: CheckoutStorage;
  search: string;
  currentUrl: string;
  replaceUrl: (sameOriginPath: string) => void;
  now?: () => string;
}

export interface ConsumeCheckoutReturnResult {
  pending: CreatedCheckout | null;
  notice: PaymentReconciliationNotice | null;
  cancelRequested: boolean;
}

function cleanReturnUrl(
  currentUrl: string,
  replaceUrl: (sameOriginPath: string) => void,
): void {
  try {
    replaceUrl(checkoutReturnUrlWithoutPaymentParams(currentUrl));
  } catch {
    // URL cleanup is best effort and never changes payment state.
  }
}

export function consumeCheckoutReturn({
  storage,
  search,
  currentUrl,
  replaceUrl,
  now,
}: ConsumeCheckoutReturnOptions): ConsumeCheckoutReturnResult {
  const checkoutReturn = readCheckoutReturn(search);
  if (checkoutReturn.kind === 'none') {
    const pending = readPendingCheckout(storage);
    return {
      pending: pending?.phase === 'return_confirmed'
        || pending?.phase === 'cancel_requested'
        ? pending
        : null,
      notice: null,
      cancelRequested: pending?.phase === 'cancel_requested',
    };
  }

  cleanReturnUrl(currentUrl, replaceUrl);

  if (checkoutReturn.kind === 'cancel') {
    try {
      const pending = requestCheckoutCancellation(storage, now);
      return {
        pending,
        cancelRequested: true,
        notice: {
          status: 'reconciling',
          message: 'Canceling the checkout securely with the payment server…',
        },
      };
    } catch (error) {
      return {
        pending: null,
        cancelRequested: false,
        notice: {
          status: 'error',
          message: error instanceof Error
            ? error.message
            : 'The checkout cancellation could not be matched to this browser.',
        },
      };
    }
  }

  if (!checkoutReturn.sessionId) {
    return {
      pending: null,
      cancelRequested: false,
      notice: {
        status: 'error',
        message: 'The checkout return is missing its Stripe session ID.',
      },
    };
  }

  try {
    const pending = confirmCheckoutReturn(
      storage,
      checkoutReturn.sessionId,
      now,
    );
    return {
      pending,
      cancelRequested: false,
      notice: {
        status: 'reconciling',
        message: 'Payment received. Waiting for secure ledger confirmation…',
      },
    };
  } catch (error) {
    return {
      pending: null,
      cancelRequested: false,
      notice: {
        status: 'error',
        message: error instanceof Error
          ? error.message
          : 'The checkout return could not be matched to this browser.',
      },
    };
  }
}

export type PaymentReconciliationResult =
  | { kind: 'idle' }
  | { kind: 'aborted' }
  | { kind: 'credited'; credits: number }
  | { kind: 'terminal'; status: string }
  | { kind: 'delayed'; lastError: unknown };

export interface ReconcileConfirmedPaymentOptions {
  storage: CheckoutStorage;
  fetchOrder?: (
    orderId: string,
    signal?: AbortSignal,
  ) => Promise<PaymentOrderResponse>;
  signal?: AbortSignal;
  attempts?: number;
  wait?: (signal?: AbortSignal) => Promise<void>;
}

export type PaymentCancellationResult =
  | { kind: 'idle' }
  | { kind: 'aborted' }
  | { kind: 'credited'; credits: number }
  | { kind: 'terminal'; status: string }
  | { kind: 'processing' }
  | { kind: 'delayed'; lastError: unknown };

export interface CancelPendingCheckoutOptions {
  storage: CheckoutStorage;
  cancelOrder?: (
    orderId: string,
    signal?: AbortSignal,
  ) => Promise<PaymentOrderResponse>;
  signal?: AbortSignal;
}

export async function cancelPendingCheckout({
  storage,
  cancelOrder = cancelCheckoutSession,
  signal,
}: CancelPendingCheckoutOptions): Promise<PaymentCancellationResult> {
  const pending = readPendingCheckout(storage);
  if (!pending || pending.phase !== 'cancel_requested') {
    return { kind: 'idle' };
  }
  try {
    const order = await cancelOrder(pending.orderId, signal);
    if (
      order.request_id !== pending.requestId
      || order.pack_id !== pending.packId
    ) {
      throw new Error(
        'Payment cancellation identity does not match the saved checkout.',
      );
    }
    if (order.credited) {
      clearPendingCheckout(storage, pending.requestId);
      return { kind: 'credited', credits: Number(order.credits) };
    }
    if (isFinalPaymentOrder(order)) {
      clearPendingCheckout(storage, pending.requestId);
      return { kind: 'terminal', status: order.status };
    }
    confirmCheckoutReturn(storage, pending.checkoutSessionId);
    return { kind: 'processing' };
  } catch (error) {
    if (signal?.aborted) return { kind: 'aborted' };
    return { kind: 'delayed', lastError: error };
  }
}

function waitForNextPoll(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timeoutId = window.setTimeout(resolve, 2_000);
    signal?.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timeoutId);
        resolve();
      },
      { once: true },
    );
  });
}

export async function reconcileConfirmedPayment({
  storage,
  fetchOrder = fetchPaymentOrder,
  signal,
  attempts = 60,
  wait = waitForNextPoll,
}: ReconcileConfirmedPaymentOptions): Promise<PaymentReconciliationResult> {
  const pending = readPendingCheckout(storage);
  if (!pending || pending.phase !== 'return_confirmed') {
    return { kind: 'idle' };
  }

  let lastError: unknown = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (signal?.aborted) return { kind: 'aborted' };
    try {
      const order = await fetchOrder(pending.orderId, signal);
      if (
        order.request_id !== pending.requestId
        || order.pack_id !== pending.packId
      ) {
        throw new Error(
          'Payment order identity does not match the saved checkout.',
        );
      }
      lastError = null;

      if (order.credited) {
        clearPendingCheckout(storage, pending.requestId);
        return { kind: 'credited', credits: Number(order.credits) };
      }
      if (isFinalPaymentOrder(order)) {
        clearPendingCheckout(storage, pending.requestId);
        return { kind: 'terminal', status: order.status };
      }
    } catch (error) {
      if (signal?.aborted) return { kind: 'aborted' };
      lastError = error;
    }

    if (attempt + 1 < attempts) await wait(signal);
  }
  return { kind: 'delayed', lastError };
}

function dispatchNotice(notice: PaymentReconciliationNotice): void {
  window.dispatchEvent(new CustomEvent(PAYMENT_RECONCILIATION_EVENT, {
    detail: notice,
  }));
}

let browserReconciliationInFlight:
  | Promise<PaymentReconciliationResult>
  | null = null;

async function runBrowserPaymentReconciliation(
  signal: AbortSignal,
): Promise<PaymentReconciliationResult> {
  let consumed: ConsumeCheckoutReturnResult;
  try {
    consumed = consumeCheckoutReturn({
      storage: window.localStorage,
      search: window.location.search,
      currentUrl: window.location.href,
      replaceUrl: (path) => {
        window.history.replaceState(window.history.state, '', path);
      },
    });
  } catch {
    dispatchNotice({
      status: 'error',
      message: 'Browser storage is unavailable, so checkout cannot be verified.',
    });
    return { kind: 'idle' };
  }

  if (consumed.notice) dispatchNotice(consumed.notice);
  if (!consumed.pending) return { kind: 'idle' };

  const tokens = readTokenPair();
  if (!tokens.access_token && !tokens.refresh_token) {
    // The confirmed intent remains durable. Login emits AUTH_TOKEN_CHANGED_EVENT
    // and resumes this exact order without trusting query parameters again.
    return { kind: 'idle' };
  }

  if (consumed.cancelRequested) {
    const cancellation = await cancelPendingCheckout({
      storage: window.localStorage,
      signal,
    });
    if (signal.aborted) return { kind: 'aborted' };
    if (cancellation.kind === 'credited') {
      dispatchNotice({
        status: 'credited',
        message: `${cancellation.credits.toLocaleString()} credits were added to your ledger.`,
      });
      window.dispatchEvent(new Event(CREDITS_CHANGED_EVENT));
      return cancellation;
    }
    if (cancellation.kind === 'terminal') {
      dispatchNotice({
        status: 'canceled',
        message: 'Checkout was canceled. No credits were added.',
      });
      window.dispatchEvent(new Event(CREDITS_CHANGED_EVENT));
      return cancellation;
    }
    if (cancellation.kind === 'delayed') {
      dispatchNotice({
        status: 'delayed',
        message: 'Checkout cancellation could not be confirmed. The order remains saved and will be retried.',
      });
      return cancellation;
    }
    if (cancellation.kind !== 'processing') return cancellation;
  }

  const result = await reconcileConfirmedPayment({
    storage: window.localStorage,
    signal,
  });
  if (signal.aborted) return { kind: 'aborted' };

  switch (result.kind) {
    case 'credited':
      dispatchNotice({
        status: 'credited',
        message: `${result.credits.toLocaleString()} credits were added to your ledger.`,
      });
      window.dispatchEvent(new Event(CREDITS_CHANGED_EVENT));
      break;
    case 'terminal':
      dispatchNotice({
        status: 'terminal',
        message: `Payment was not completed (${result.status}). No credits were added.`,
      });
      break;
    case 'delayed':
      dispatchNotice({
        status: 'delayed',
        message: result.lastError
          ? 'Payment confirmation is delayed. The order remains saved and will be checked again.'
          : 'Payment is still processing. The order remains saved and will be checked again.',
      });
      break;
    default:
      break;
  }
  return result;
}

function reconcileBrowserCheckout(signal: AbortSignal): Promise<PaymentReconciliationResult> {
  if (browserReconciliationInFlight) return browserReconciliationInFlight;
  browserReconciliationInFlight = runBrowserPaymentReconciliation(signal)
    .finally(() => {
      browserReconciliationInFlight = null;
    });
  return browserReconciliationInFlight;
}

export function installPaymentReconciliation(): () => void {
  if (typeof window === 'undefined') return () => undefined;

  const controller = new AbortController();
  const reconcile = () => {
    if (!controller.signal.aborted) {
      void reconcileBrowserCheckout(controller.signal);
    }
  };

  // Run independently of the currently visible route/component.
  reconcile();
  window.addEventListener(AUTH_TOKEN_CHANGED_EVENT, reconcile);
  window.addEventListener('online', reconcile);
  window.addEventListener(PAYMENT_RECONCILIATION_REQUEST_EVENT, reconcile);

  return () => {
    controller.abort();
    window.removeEventListener(AUTH_TOKEN_CHANGED_EVENT, reconcile);
    window.removeEventListener('online', reconcile);
    window.removeEventListener(
      PAYMENT_RECONCILIATION_REQUEST_EVENT,
      reconcile,
    );
  };
}
