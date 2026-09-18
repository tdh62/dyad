/**
 * Classified application errors for IPC/main-process code.
 * Use {@link DyadError} with a {@link DyadErrorKind} so failures are classified
 * consistently for the renderer and for local logs.
 */

export enum DyadErrorKind {
  Validation = "validation",
  NotFound = "not_found",
  Auth = "auth",
  Precondition = "precondition",
  Conflict = "conflict",
  UserCancelled = "user_cancelled",
  RateLimited = "rate_limited",
  /** Upstream failures coming from a service Dyad talks to. */
  External = "external",
  /** Bugs, invariant violations, unexpected failures. */
  Internal = "internal",
  /** Unclassified. */
  Unknown = "unknown",
}

export class DyadError extends Error {
  readonly kind: DyadErrorKind;
  readonly cause?: unknown;

  constructor(
    message: string,
    kind: DyadErrorKind,
    options?: { cause?: unknown },
  ) {
    super(message);
    this.name = "DyadError";
    this.kind = kind;
    this.cause = options?.cause;
  }
}

export function isDyadError(error: unknown): error is DyadError {
  return error instanceof DyadError;
}
