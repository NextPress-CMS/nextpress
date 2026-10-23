/**
 * Layered spam / bot heuristics that run before any expensive work.
 *
 * These are cheap, stateless checks that catch the overwhelming majority of
 * automated spam without inconveniencing real users:
 *
 *   1. Honeypot field  — a hidden input real users never fill. Any value = bot.
 *   2. Time trap       — forms submitted implausibly fast are scripted.
 *
 * reCAPTCHA and rate limiting are handled separately so each layer stays
 * independently testable and configurable.
 */

export interface SpamGuardConfig {
  /** Name of the hidden honeypot field the client renders. */
  honeypotField: string;
  /** Minimum seconds between form render and submit. 0 disables the trap. */
  minSubmitSeconds: number;
}

export interface SpamCheckResult {
  spam: boolean;
  /** Machine reason for logging; never shown to the visitor verbatim. */
  reason?: "honeypot" | "too_fast" | "bad_timestamp";
}

/**
 * Run the honeypot + time-trap heuristics against a submission payload.
 *
 * @param body       Parsed request body.
 * @param renderedAt The `_np_ts` timestamp (ms) the client stamped when the
 *                   form was rendered.
 */
export function checkSpamHeuristics(
  body: Record<string, unknown>,
  config: SpamGuardConfig,
  now: number = Date.now(),
): SpamCheckResult {
  // 1. Honeypot — a bot that fills every field trips this.
  const honeypotValue = body[config.honeypotField];
  if (typeof honeypotValue === "string" && honeypotValue.trim().length > 0) {
    return { spam: true, reason: "honeypot" };
  }

  // 2. Time trap — only enforced when a threshold is configured.
  if (config.minSubmitSeconds > 0) {
    const raw = body["_np_ts"];
    const renderedAt =
      typeof raw === "number"
        ? raw
        : typeof raw === "string"
          ? Number.parseInt(raw, 10)
          : NaN;

    if (!Number.isFinite(renderedAt)) {
      return { spam: true, reason: "bad_timestamp" };
    }
    const elapsedSeconds = (now - renderedAt) / 1000;
    if (elapsedSeconds < config.minSubmitSeconds) {
      return { spam: true, reason: "too_fast" };
    }
  }

  return { spam: false };
}
