import {
  clearPendingCheckout,
  confirmCheckoutReturn,
  prepareCheckoutRequest,
  readPendingCheckout,
  recordCheckoutSession,
  requestCheckoutCancellation,
  type CreatedCheckout,
} from './checkoutState';
import {
  cancelCheckoutSession,
  CURRENT_PAID_TERMS_ACKNOWLEDGEMENT,
  createCheckoutSession,
  createPaymentRequestId,
  isFinalPaymentOrder,
  isSafeStripeCheckoutUrl,
  type CheckoutSessionResponse,
  type PaidTermsCheckoutAcknowledgement,
  type PaymentOrderResponse,
} from './payments';

type CheckoutStorage = Pick<
  Storage,
  'getItem' | 'setItem' | 'removeItem'
>;

export interface PaymentCheckoutDependencies {
  storage: CheckoutStorage;
  createRequestId?: () => string;
  createSession?: (
    packId: string,
    requestId: string,
    legalAcknowledgement: PaidTermsCheckoutAcknowledgement,
    signal?: AbortSignal,
  ) => Promise<CheckoutSessionResponse>;
  cancelSession?: (
    orderId: string,
    signal?: AbortSignal,
  ) => Promise<PaymentOrderResponse>;
  now?: () => string;
  signal?: AbortSignal;
  legalAcknowledgement?: PaidTermsCheckoutAcknowledgement;
}

export class PaymentCheckoutProcessingError extends Error {
  constructor() {
    super(
      'Payment is already processing. Waiting for secure ledger confirmation.',
    );
    this.name = 'PaymentCheckoutProcessingError';
  }
}

export class PaymentCheckoutCreditedError extends Error {
  readonly credits: number;

  constructor(credits: number) {
    super(
      'The previous payment was completed and credited. Your balance has been refreshed; select another pack again if you still want it.',
    );
    this.name = 'PaymentCheckoutCreditedError';
    this.credits = credits;
  }
}

export async function createOrResumePaymentCheckout(
  packId: string,
  dependencies: PaymentCheckoutDependencies,
): Promise<CreatedCheckout> {
  return createOrResumePaymentCheckoutAttempt(packId, dependencies, true);
}

function isStaleUnboundCheckoutRelease(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('response' in error)) {
    return false;
  }
  const response = (error as {
    response?: { status?: unknown; data?: { detail?: unknown } };
  }).response;
  return response?.status === 409
    && response.data?.detail === 'stale_unbound_checkout_released';
}

function isStalePaymentOrderLegalEvidence(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('response' in error)) {
    return false;
  }
  const response = (error as {
    response?: { status?: unknown; data?: { detail?: unknown } };
  }).response;
  return response?.status === 409
    && (
      response.data?.detail === 'payment_order_legal_evidence_missing'
      || response.data?.detail === 'payment_order_legal_evidence_conflict'
    );
}

function isCheckoutProcessing(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('response' in error)) {
    return false;
  }
  const response = (error as {
    response?: { status?: unknown; data?: { detail?: unknown } };
  }).response;
  return response?.status === 409
    && response.data?.detail
      === 'Checkout payment is processing; refresh payment status';
}

async function cancelLegacyBoundCheckout(
  checkout: CreatedCheckout,
  dependencies: Pick<
    Required<PaymentCheckoutDependencies>,
    'storage' | 'cancelSession' | 'now'
  > & Pick<PaymentCheckoutDependencies, 'signal'>,
): Promise<void> {
  const cancellation = requestCheckoutCancellation(
    dependencies.storage,
    dependencies.now,
  );
  const order = await dependencies.cancelSession(
    cancellation.orderId,
    dependencies.signal,
  );
  if (
    order.order_id !== checkout.orderId
    || order.request_id !== checkout.requestId
    || order.pack_id !== checkout.packId
  ) {
    throw new Error(
      'Payment cancellation identity does not match the saved checkout.',
    );
  }
  if (order.credited) {
    clearPendingCheckout(dependencies.storage, checkout.requestId);
    throw new PaymentCheckoutCreditedError(Number(order.credits));
  }
  if (!isFinalPaymentOrder(order)) {
    confirmCheckoutReturn(
      dependencies.storage,
      checkout.checkoutSessionId,
      dependencies.now,
    );
    throw new PaymentCheckoutProcessingError();
  }
  if (!clearPendingCheckout(dependencies.storage, checkout.requestId)) {
    throw new Error(
      'Checkout state changed before the legacy payment was cleared.',
    );
  }
}

async function createOrResumePaymentCheckoutAttempt(
  packId: string,
  dependencies: PaymentCheckoutDependencies,
  allowStaleRetry: boolean,
): Promise<CreatedCheckout> {
  const {
    storage,
    createRequestId = createPaymentRequestId,
    createSession = createCheckoutSession,
    cancelSession = cancelCheckoutSession,
    now = () => new Date().toISOString(),
    signal,
    legalAcknowledgement = CURRENT_PAID_TERMS_ACKNOWLEDGEMENT,
  } = dependencies;

  const stored = readPendingCheckout(storage);
  if (stored && stored.packId !== packId) {
    if (stored.phase === 'return_confirmed') {
      throw new PaymentCheckoutProcessingError();
    }

    let previous: CreatedCheckout;
    if (
      stored.phase === 'request_prepared'
      || stored.phase === 'checkout_created'
    ) {
      let bound: CheckoutSessionResponse;
      try {
        bound = await createSession(
          stored.packId,
          stored.requestId,
          legalAcknowledgement,
          signal,
        );
      } catch (error) {
        if (
          allowStaleRetry
          && stored.phase === 'request_prepared'
          && isStalePaymentOrderLegalEvidence(error)
        ) {
          if (!clearPendingCheckout(storage, stored.requestId)) {
            throw new Error(
              'Checkout state changed before the legacy payment was cleared.',
            );
          }
          return createOrResumePaymentCheckoutAttempt(
            packId,
            dependencies,
            false,
          );
        }
        if (
          allowStaleRetry
          && stored.phase === 'checkout_created'
          && isStalePaymentOrderLegalEvidence(error)
        ) {
          await cancelLegacyBoundCheckout(stored, {
            storage,
            cancelSession,
            now,
            signal,
          });
          return createOrResumePaymentCheckoutAttempt(
            packId,
            dependencies,
            false,
          );
        }
        if (allowStaleRetry && isStaleUnboundCheckoutRelease(error)) {
          if (!clearPendingCheckout(storage, stored.requestId)) {
            throw new Error(
              'Checkout state changed before the stale payment was cleared.',
            );
          }
          return createOrResumePaymentCheckoutAttempt(
            packId,
            dependencies,
            false,
          );
        }
        if (
          stored.phase === 'checkout_created'
          && isCheckoutProcessing(error)
        ) {
          confirmCheckoutReturn(
            storage,
            stored.checkoutSessionId,
            now,
          );
          throw new PaymentCheckoutProcessingError();
        }
        throw error;
      }
      if (!isSafeStripeCheckoutUrl(bound.checkout_url)) {
        throw new Error(
          'Checkout did not provide a secure Stripe redirect URL.',
        );
      }
      previous = recordCheckoutSession(
        storage,
        {
          orderId: bound.order_id,
          requestId: bound.request_id,
          packId: bound.pack_id,
          checkoutSessionId: bound.checkout_session_id,
          checkoutUrl: bound.checkout_url,
        },
        now,
      );
    } else {
      previous = stored;
    }

    const cancellation = requestCheckoutCancellation(storage, now);
    let order: PaymentOrderResponse;
    try {
      order = await cancelSession(cancellation.orderId, signal);
    } catch (error) {
      // Keep cancel_requested durable so a retry cannot silently create a
      // second payable checkout while Stripe's state is unknown.
      throw error;
    }
    if (
      order.order_id !== previous.orderId
      || order.request_id !== previous.requestId
      || order.pack_id !== previous.packId
    ) {
      throw new Error(
        'Payment cancellation identity does not match the saved checkout.',
      );
    }
    if (order.credited) {
      clearPendingCheckout(storage, previous.requestId);
      throw new PaymentCheckoutCreditedError(Number(order.credits));
    }
    if (!isFinalPaymentOrder(order)) {
      confirmCheckoutReturn(storage, previous.checkoutSessionId, now);
      throw new PaymentCheckoutProcessingError();
    }
    if (!clearPendingCheckout(storage, previous.requestId)) {
      throw new Error(
        'Checkout state changed before the canceled payment was cleared.',
      );
    }
    return createOrResumePaymentCheckoutAttempt(
      packId,
      dependencies,
      allowStaleRetry,
    );
  }

  const pending = stored?.phase === 'checkout_created'
    ? stored
    : prepareCheckoutRequest(
      storage,
      packId,
      createRequestId,
      now,
    );

  let checkout: CheckoutSessionResponse;
  try {
    // Replaying the same request ID is intentional. The backend retrieves the
    // exact bound Stripe Session and refreshes its provider status; it cannot
    // create a second payable Session for this order.
    checkout = await createSession(
      pending.packId,
      pending.requestId,
      legalAcknowledgement,
      signal,
    );
  } catch (error) {
    if (
      allowStaleRetry
      && pending.phase === 'request_prepared'
      && isStalePaymentOrderLegalEvidence(error)
    ) {
      if (!clearPendingCheckout(storage, pending.requestId)) {
        throw new Error(
          'Checkout state changed before the legacy payment was cleared.',
        );
      }
      return createOrResumePaymentCheckoutAttempt(
        packId,
        dependencies,
        false,
      );
    }
    if (
      allowStaleRetry
      && pending.phase === 'checkout_created'
      && isStalePaymentOrderLegalEvidence(error)
    ) {
      await cancelLegacyBoundCheckout(pending, {
        storage,
        cancelSession,
        now,
        signal,
      });
      return createOrResumePaymentCheckoutAttempt(
        packId,
        dependencies,
        false,
      );
    }
    if (allowStaleRetry && isStaleUnboundCheckoutRelease(error)) {
      if (!clearPendingCheckout(storage, pending.requestId)) {
        throw new Error(
          'Checkout state changed before the stale payment was cleared.',
        );
      }
      return createOrResumePaymentCheckoutAttempt(packId, dependencies, false);
    }
    if (
      isCheckoutProcessing(error)
      && pending.phase === 'checkout_created'
    ) {
      confirmCheckoutReturn(
        storage,
        pending.checkoutSessionId,
        now,
      );
      throw new PaymentCheckoutProcessingError();
    }
    throw error;
  }
  if (!isSafeStripeCheckoutUrl(checkout.checkout_url)) {
    throw new Error('Checkout did not provide a secure Stripe redirect URL.');
  }
  const created = recordCheckoutSession(
    storage,
    {
      orderId: checkout.order_id,
      requestId: checkout.request_id,
      packId: checkout.pack_id,
      checkoutSessionId: checkout.checkout_session_id,
      checkoutUrl: checkout.checkout_url,
    },
    now,
  );
  if (created.packId !== packId) {
    throw new Error(
      `A checkout for ${created.packId} is already pending. Retry or cancel that checkout before choosing another pack.`,
    );
  }
  return created;
}
