import { describe, expect, it } from "vitest";
import {
  createOAuthState,
  validateGrantedScopes,
  verifyOAuthState,
  REQUIRED_SCOPES,
} from "../src/api/instagram-auth";
import {
  SECRET_KEY_PREFIX,
  deriveTokenStatus,
  parseConnection,
  redactSecrets,
  toPublicConnection,
} from "../src/schemas/settings";
import { scrub, scrubString } from "../src/services/logger";
import { isAllowedMediaUrl, sniffMimeType } from "../src/services/media-service";
import { validatePublicUrl } from "../src/services/media-validation";

const APP_SECRET = "test-app-secret";
const SITE_A = "site-aaa";
const SITE_B = "site-bbb";

describe("OAuth state (CSRF)", () => {
  it("round-trips a valid state", () => {
    const state = createOAuthState(SITE_A, APP_SECRET);
    expect(verifyOAuthState(state, APP_SECRET, SITE_A)?.siteId).toBe(SITE_A);
  });

  it("rejects a tampered payload", () => {
    const state = createOAuthState(SITE_A, APP_SECRET);
    const [, signature] = state.split(".");
    const forged = `${Buffer.from(JSON.stringify({ siteId: SITE_B, nonce: "x", issuedAt: Date.now() })).toString("base64url")}.${signature}`;
    expect(verifyOAuthState(forged, APP_SECRET, SITE_B)).toBeNull();
  });

  it("rejects a state signed with a different secret", () => {
    const state = createOAuthState(SITE_A, "attacker-secret");
    expect(verifyOAuthState(state, APP_SECRET, SITE_A)).toBeNull();
  });

  it("rejects a state issued for another site", () => {
    // Cross-tenant replay: Site A's state must not connect Site B.
    const state = createOAuthState(SITE_A, APP_SECRET);
    expect(verifyOAuthState(state, APP_SECRET, SITE_B)).toBeNull();
  });

  it("rejects an expired state", () => {
    const stale = Buffer.from(
      JSON.stringify({ siteId: SITE_A, nonce: "x", issuedAt: Date.now() - 20 * 60 * 1000 }),
    ).toString("base64url");
    const { createHmac } = require("node:crypto") as typeof import("node:crypto");
    const signature = createHmac("sha256", APP_SECRET).update(stale).digest("base64url");
    expect(verifyOAuthState(`${stale}.${signature}`, APP_SECRET, SITE_A)).toBeNull();
  });

  it("rejects malformed input without throwing", () => {
    for (const bad of ["", "no-dot", "a.b.c", "!!!.???"]) {
      expect(verifyOAuthState(bad, APP_SECRET, SITE_A)).toBeNull();
    }
  });

  it("produces a different state on every call", () => {
    expect(createOAuthState(SITE_A, APP_SECRET)).not.toBe(createOAuthState(SITE_A, APP_SECRET));
  });
});

describe("granted scope validation", () => {
  it("accepts the full required set", () => {
    expect(validateGrantedScopes([...REQUIRED_SCOPES]).valid).toBe(true);
  });

  it("reports the missing publishing scope", () => {
    const result = validateGrantedScopes(["instagram_business_basic"]);
    expect(result.valid).toBe(false);
    expect(result.missing).toContain("instagram_business_content_publish");
  });

  it("accepts an empty list — Meta not reporting scopes is not a refusal", () => {
    expect(validateGrantedScopes([]).valid).toBe(true);
  });
});

describe("token secrecy", () => {
  const connection = parseConnection({
    status: "connected",
    accountId: "17841400000000000",
    username: "example_account",
    tokenExpiresAt: new Date(Date.now() + 40 * 86_400_000).toISOString(),
    [`${SECRET_KEY_PREFIX}accessToken`]: "IGQVJXsecrettokenvalue1234567890",
  });

  it("omits the token from the public projection", () => {
    const serialised = JSON.stringify(toPublicConnection(connection));
    expect(serialised).not.toContain("IGQVJXsecrettokenvalue1234567890");
    expect(serialised).not.toContain(SECRET_KEY_PREFIX);
  });

  it("still exposes the useful non-secret fields", () => {
    const publicView = toPublicConnection(connection);
    expect(publicView.username).toBe("example_account");
    expect(publicView.tokenStatus).toBe("valid");
  });

  it("reports an expired token as needing re-auth even if stored as connected", () => {
    const expired = parseConnection({
      ...connection,
      tokenExpiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    const publicView = toPublicConnection(expired);
    expect(publicView.status).toBe("needs_reauth");
    expect(publicView.tokenStatus).toBe("expired");
  });

  it("warns before expiry rather than at it", () => {
    const soon = new Date(Date.now() + 3 * 86_400_000).toISOString();
    expect(deriveTokenStatus(soon)).toBe("expiring_soon");
  });

  it("redacts every _secret_ key generically", () => {
    const redacted = redactSecrets({
      safe: "keep",
      [`${SECRET_KEY_PREFIX}anything`]: "hide",
      [`${SECRET_KEY_PREFIX}future`]: "hide",
    });
    expect(redacted.safe).toBe("keep");
    expect(JSON.stringify(redacted)).not.toContain("hide");
  });
});

describe("log scrubbing", () => {
  it("redacts a token embedded in a URL", () => {
    const scrubbed = scrubString(
      "GET https://graph.instagram.com/me?access_token=IGQVJXabcdefghijklmnop123456 failed",
    );
    expect(scrubbed).not.toContain("IGQVJXabcdefghijklmnop123456");
    expect(scrubbed).toContain("[REDACTED]");
  });

  it("redacts a bare long-lived token in free text", () => {
    expect(scrubString("token is IGQVJXabcdefghijklmnopqrstuv123")).not.toContain("IGQVJX");
  });

  it("redacts secret-named keys in nested objects", () => {
    const scrubbed = scrub({
      siteId: "site-1",
      nested: { accessToken: "secret-value", client_secret: "another" },
    }) as Record<string, unknown>;

    const serialised = JSON.stringify(scrubbed);
    expect(serialised).not.toContain("secret-value");
    expect(serialised).not.toContain("another");
    expect(serialised).toContain("site-1");
  });

  it("scrubs error messages without losing the error name", () => {
    const scrubbed = scrub(
      new Error("failed: access_token=IGQVJXabcdefghijklmnop123456"),
    ) as { name: string; message: string };
    expect(scrubbed.name).toBe("Error");
    expect(scrubbed.message).not.toContain("IGQVJX");
  });

  it("terminates on a deeply nested structure", () => {
    let deep: Record<string, unknown> = { value: "leaf" };
    for (let i = 0; i < 20; i++) deep = { nested: deep };
    expect(() => scrub(deep)).not.toThrow();
  });
});

describe("SSRF protection on media download", () => {
  it("allows genuine Instagram CDN hosts", () => {
    expect(isAllowedMediaUrl("https://scontent.cdninstagram.com/v/file.jpg")).toBe(true);
    expect(isAllowedMediaUrl("https://scontent-lhr8-1.xx.fbcdn.net/v/file.mp4")).toBe(true);
  });

  it("rejects plain HTTP", () => {
    expect(isAllowedMediaUrl("http://scontent.cdninstagram.com/v/file.jpg")).toBe(false);
  });

  it("rejects localhost and private ranges", () => {
    for (const url of [
      "https://localhost/file.jpg",
      "https://127.0.0.1/file.jpg",
      "https://10.0.0.5/file.jpg",
      "https://192.168.1.1/file.jpg",
      "https://169.254.169.254/latest/meta-data/",
    ]) {
      expect(isAllowedMediaUrl(url)).toBe(false);
    }
  });

  it("rejects a lookalike domain that merely CONTAINS an allowed host", () => {
    // Suffix matching, not substring matching — this is the classic bypass.
    expect(isAllowedMediaUrl("https://cdninstagram.com.attacker.net/x.jpg")).toBe(false);
    expect(isAllowedMediaUrl("https://evil-cdninstagram.com.example.org/x.jpg")).toBe(false);
  });

  it("rejects non-HTTP schemes and malformed URLs", () => {
    for (const url of ["file:///etc/passwd", "gopher://x", "not a url", ""]) {
      expect(isAllowedMediaUrl(url)).toBe(false);
    }
  });
});

describe("magic-byte sniffing", () => {
  it("detects JPEG", () => {
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(12)]);
    expect(sniffMimeType(jpeg)).toBe("image/jpeg");
  });

  it("detects PNG", () => {
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(8),
    ]);
    expect(sniffMimeType(png)).toBe("image/png");
  });

  it("detects MP4 via the ftyp box", () => {
    const mp4 = Buffer.concat([
      Buffer.from([0x00, 0x00, 0x00, 0x20]),
      Buffer.from("ftypisom", "ascii"),
      Buffer.alloc(8),
    ]);
    expect(sniffMimeType(mp4)).toBe("video/mp4");
  });

  it("rejects a disguised script file", () => {
    // A lying Content-Type must not decide what gets stored.
    expect(sniffMimeType(Buffer.from("<?php system($_GET[0]); ?>".padEnd(32)))).toBeNull();
  });

  it("rejects a buffer too short to identify", () => {
    expect(sniffMimeType(Buffer.from([0xff, 0xd8]))).toBeNull();
  });
});

describe("publish URL reachability", () => {
  it("accepts a public HTTPS URL", () => {
    expect(validatePublicUrl("https://example.com/image.jpg").valid).toBe(true);
  });

  it("rejects a localhost URL Instagram could never fetch", () => {
    const result = validatePublicUrl("https://localhost:3000/image.jpg");
    expect(result.valid).toBe(false);
    expect(result.issues[0]?.code).toBe("url_not_public");
  });

  it("rejects HTTP with an explanation", () => {
    expect(validatePublicUrl("http://example.com/i.jpg").issues[0]?.code).toBe("url_not_https");
  });
});
