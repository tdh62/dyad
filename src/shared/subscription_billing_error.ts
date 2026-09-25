import { DyadError, DyadErrorKind } from "../errors/dyad_error";

const SUBSCRIPTION_BILLING_ERROR_MESSAGES = {
  OUT_OF_CREDITS:
    "You're out of Dyad credits. Add credits to continue using your subscription.",
  KEY_REJECTED: "Your Dyad Pro key was rejected. Get your current Pro key.",
} as const;

type SubscriptionBillingErrorCode =
  keyof typeof SUBSCRIPTION_BILLING_ERROR_MESSAGES;

export class SubscriptionBillingError extends DyadError {
  constructor(readonly code: SubscriptionBillingErrorCode) {
    super(
      SUBSCRIPTION_BILLING_ERROR_MESSAGES[code],
      code === "KEY_REJECTED" ? DyadErrorKind.Auth : DyadErrorKind.Precondition,
    );
  }

  // Chat error state uses strings, like the existing quota error envelopes.
  serialize(): string {
    return JSON.stringify({
      type: "SUBSCRIPTION_BILLING_ERROR",
      code: this.code,
    });
  }
}
