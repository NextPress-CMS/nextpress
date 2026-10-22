/**
 * Google reCAPTCHA verification (v2 checkbox / invisible and v3 score-based).
 *
 * The admin configures the site key + secret key in the plugin settings. The
 * public form includes the token; this module verifies it server-side against
 * Google's siteverify endpoint. Secret keys never leave the server.
 */

const SITEVERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";

export interface RecaptchaConfig {
  enabled: boolean;
  version: "v2" | "v3";
  secretKey: string;
  /** Minimum score to accept for v3 (0.0 – 1.0). Ignored for v2. */
  minScore: number;
}

export interface RecaptchaVerifyResult {
  success: boolean;
  /** Present for v3. */
  score?: number;
  action?: string;
  errorCodes?: string[];
  /** Human-readable reason when verification fails. */
  reason?: string;
}

interface GoogleSiteverifyResponse {
  success: boolean;
  score?: number;
  action?: string;
  challenge_ts?: string;
  hostname?: string;
  "error-codes"?: string[];
}

/**
 * Verify a reCAPTCHA token. Returns `{ success: true }` immediately when
 * reCAPTCHA is disabled so callers can treat this as a single gate.
 */
export async function verifyRecaptcha(
  config: RecaptchaConfig,
  token: string | undefined,
  remoteIp?: string,
): Promise<RecaptchaVerifyResult> {
  if (!config.enabled) {
    return { success: true };
  }

  if (!config.secretKey) {
    return {
      success: false,
      reason: "reCAPTCHA is enabled but no secret key is configured.",
    };
  }

  if (!token) {
    return { success: false, reason: "Missing reCAPTCHA token." };
  }

  const params = new URLSearchParams();
  params.set("secret", config.secretKey);
  params.set("response", token);
  if (remoteIp && remoteIp !== "unknown") params.set("remoteip", remoteIp);

  let data: GoogleSiteverifyResponse;
  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
      // Fail fast rather than hanging the request under network issues.
      signal: AbortSignal.timeout(5000),
    });
    data = (await res.json()) as GoogleSiteverifyResponse;
  } catch {
    return {
      success: false,
      reason: "Could not reach the reCAPTCHA verification service.",
    };
  }

  if (!data.success) {
    return {
      success: false,
      errorCodes: data["error-codes"],
      reason: "reCAPTCHA verification failed.",
    };
  }

  // v3: enforce the score threshold.
  if (config.version === "v3") {
    const score = typeof data.score === "number" ? data.score : 0;
    const min =
      Number.isFinite(config.minScore) && config.minScore >= 0
        ? config.minScore
        : 0.5;
    if (score < min) {
      return {
        success: false,
        score,
        action: data.action,
        reason: `reCAPTCHA score ${score.toFixed(2)} is below the required ${min.toFixed(2)}.`,
      };
    }
    return { success: true, score, action: data.action };
  }

  return { success: true };
}
