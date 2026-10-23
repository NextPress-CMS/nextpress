import { describe, expect, it } from "vitest";
import {
  InstagramAuthError,
  InstagramMediaError,
  InstagramNetworkError,
  InstagramRateLimitError,
  classifyGraphError,
  isInstagramError,
} from "../src/api/instagram-errors";
import {
  MAX_RETRIES,
  assertPublishTransition,
  canTransitionImport,
  canTransitionPublish,
  decideRetry,
  InvalidStateTransitionError,
} from "../src/services/sync-state";
import {
  expiredTokenError,
  invalidMediaError,
  permissionError,
  rateLimitError,
} from "../src/api/fixtures";

describe("classifyGraphError", () => {
  it("classifies an expired token as a non-retryable auth error", () => {
    const error = classifyGraphError(expiredTokenError.error, "GET /me");
    expect(error.category).toBe("auth");
    expect(error.retryable).toBe(false);
    expect(error.externalErrorCode).toBe(190);
    expect(error.externalErrorSubcode).toBe(463);
  });

  it("classifies a rate limit as retryable", () => {
    const error = classifyGraphError(rateLimitError.error, "GET /me/media");
    expect(error.category).toBe("rate_limit");
    expect(error.retryable).toBe(true);
  });

  it("classifies a permission failure as non-retryable", () => {
    const error = classifyGraphError(permissionError.error, "POST /media");
    expect(error.category).toBe("permission");
    expect(error.retryable).toBe(false);
  });

  it("prefers Meta's own user-safe message when supplied", () => {
    const error = classifyGraphError(invalidMediaError.error, "POST /media");
    expect(error.userMessage).toBe("The media you selected is not in a supported format.");
  });

  it("defaults an unrecognised code to a NON-retryable unknown error", () => {
    // Failing closed matters: retrying an error we cannot interpret risks
    // hammering Meta or duplicating a publish.
    const error = classifyGraphError({ message: "Something new", code: 99999 }, "GET /me");
    expect(error.category).toBe("unknown");
    expect(error.retryable).toBe(false);
  });

  it("treats an OAuthException without a known code as auth", () => {
    const error = classifyGraphError({ message: "Bad", type: "OAuthException" }, "GET /me");
    expect(error.category).toBe("auth");
  });

  it("never exposes the raw Graph message as the user-facing message", () => {
    const error = classifyGraphError(expiredTokenError.error, "GET /me");
    expect(error.message).toContain("Session has expired");
    expect(error.userMessage).not.toContain("Session has expired");
  });
});

describe("error serialisation", () => {
  it("exposes only safe fields", () => {
    const json = InstagramMediaError({ message: "internal detail" }).toJSON();
    expect(json.message).not.toBe("internal detail");
    expect(Object.keys(json)).toEqual(
      expect.arrayContaining(["category", "message", "retryable"]),
    );
  });

  it("identifies plugin errors via the type guard", () => {
    expect(isInstagramError(InstagramAuthError({ message: "x" }))).toBe(true);
    expect(isInstagramError(new Error("x"))).toBe(false);
  });
});

describe("import state machine", () => {
  it("allows the happy path", () => {
    expect(canTransitionImport("NOT_IMPORTED", "IMPORTING")).toBe(true);
    expect(canTransitionImport("IMPORTING", "IMPORTED")).toBe(true);
  });

  it("allows re-import of an imported post to refresh it", () => {
    expect(canTransitionImport("IMPORTED", "IMPORTING")).toBe(true);
  });

  it("rejects illegal transitions", () => {
    expect(canTransitionImport("NOT_IMPORTED", "IMPORTED")).toBe(false);
    expect(canTransitionImport("IMPORTED", "NOT_IMPORTED")).toBe(false);
  });
});

describe("publish state machine", () => {
  it("allows the happy path", () => {
    expect(canTransitionPublish("NOT_PUBLISHED", "PUBLISHING")).toBe(true);
    expect(canTransitionPublish("PUBLISHING", "PUBLISHED")).toBe(true);
  });

  it("makes PUBLISHED terminal — nothing may re-open it", () => {
    // The single most important rule: no path back to a publishable state.
    for (const state of ["NOT_PUBLISHED", "PUBLISHING", "PUBLISH_PENDING", "RETRY_PENDING"] as const) {
      expect(canTransitionPublish("PUBLISHED", state)).toBe(false);
    }
  });

  it("allows recovery from a failure", () => {
    expect(canTransitionPublish("PUBLISH_FAILED", "RETRY_PENDING")).toBe(true);
    expect(canTransitionPublish("RETRY_PENDING", "PUBLISHING")).toBe(true);
  });

  it("throws on an illegal assertion", () => {
    expect(() => assertPublishTransition("PUBLISHED", "PUBLISHING")).toThrow(
      InvalidStateTransitionError,
    );
  });
});

describe("decideRetry", () => {
  it("never retries a permanent failure", () => {
    const decision = decideRetry(InstagramAuthError({ message: "expired" }), 0);
    expect(decision.shouldRetry).toBe(false);
  });

  it("retries a transient failure", () => {
    expect(decideRetry(InstagramNetworkError({ message: "timeout" }), 0).shouldRetry).toBe(true);
  });

  it("stops at the retry ceiling", () => {
    const decision = decideRetry(InstagramNetworkError({ message: "timeout" }), MAX_RETRIES);
    expect(decision.shouldRetry).toBe(false);
    expect(decision.reason).toContain("Retry limit");
  });

  it("honours Instagram's wait hint over its own backoff", () => {
    const decision = decideRetry(
      InstagramRateLimitError({ message: "limit", retryAfterSeconds: 600 }),
      0,
    );
    expect(decision.shouldRetry).toBe(true);
    expect(decision.delayMs).toBe(600_000);
  });

  it("backs off exponentially", () => {
    const first = decideRetry(InstagramNetworkError({ message: "t" }), 0).delayMs;
    const third = decideRetry(InstagramNetworkError({ message: "t" }), 2).delayMs;
    expect(third).toBeGreaterThan(first);
  });

  it("caps the delay at one hour", () => {
    const decision = decideRetry(InstagramNetworkError({ message: "t" }), 4);
    expect(decision.delayMs).toBeLessThanOrEqual(60 * 60 * 1000 * 1.2);
  });
});
