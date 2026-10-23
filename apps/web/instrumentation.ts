/**
 * Next.js instrumentation hook: runs once when the server starts (not during
 * `next build`). Validates configuration before any request is served.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertEnv } = await import("./lib/env");
    assertEnv();
  }
}
