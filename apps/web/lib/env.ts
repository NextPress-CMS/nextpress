/**
 * Startup environment validation.
 *
 * Called once from instrumentation.ts when the Node server boots. In
 * production a missing required variable throws, so a misconfigured deploy
 * fails before serving traffic instead of on the first login or upload.
 * In development it only warns.
 */

type Env = Record<string, string | undefined>;

export interface EnvReport {
  errors: string[];
  warnings: string[];
}

const set = (env: Env, key: string) => !!env[key]?.trim();

export function checkEnv(env: Env = process.env): EnvReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const isProd = env.NODE_ENV === "production";

  if (!set(env, "DATABASE_URL")) errors.push("DATABASE_URL is required.");

  const secret = env.AUTH_SECRET ?? env.NEXTAUTH_SECRET;
  if (!secret) {
    errors.push("AUTH_SECRET (or NEXTAUTH_SECRET) is required to sign sessions.");
  } else if (isProd && secret.length < 32) {
    errors.push("AUTH_SECRET must be at least 32 characters in production.");
  }

  if (isProd && !set(env, "AUTH_URL") && !set(env, "NEXTAUTH_URL") && env.AUTH_TRUST_HOST !== "true" && !set(env, "VERCEL")) {
    warnings.push("Set AUTH_URL (or AUTH_TRUST_HOST=true behind a trusted proxy); otherwise Auth.js rejects requests with UntrustedHost.");
  }

  for (const p of ["GOOGLE", "GITHUB"]) {
    if (set(env, `${p}_CLIENT_ID`) !== set(env, `${p}_CLIENT_SECRET`)) {
      warnings.push(`${p}_CLIENT_ID and ${p}_CLIENT_SECRET must both be set; ${p} sign-in is disabled.`);
    }
  }

  if (env.STORAGE_PROVIDER === "s3") {
    for (const k of ["S3_BUCKET", "S3_REGION", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"]) {
      if (!set(env, k)) errors.push(`${k} is required when STORAGE_PROVIDER=s3.`);
    }
  } else if (isProd) {
    warnings.push("STORAGE_PROVIDER is local: uploads go to the server disk, which is lost on serverless or container redeploys.");
  }

  if (!set(env, "CRON_SECRET")) warnings.push("CRON_SECRET is unset: scheduled publishing and Instagram sync endpoints refuse all calls.");
  if (!set(env, "REVALIDATION_SECRET")) warnings.push("REVALIDATION_SECRET is unset: on-demand revalidation is disabled.");
  if (isProd && !set(env, "NEXT_PUBLIC_SITE_URL")) warnings.push("NEXT_PUBLIC_SITE_URL is unset: absolute URLs (feeds, sitemap, Instagram media) may be wrong.");

  return { errors, warnings };
}

export function assertEnv(env: Env = process.env): void {
  const { errors, warnings } = checkEnv(env);
  for (const w of warnings) console.warn(`[env] ${w}`);
  if (errors.length === 0) return;
  const message = `Invalid environment:\n  - ${errors.join("\n  - ")}`;
  if (env.NODE_ENV === "production") throw new Error(message);
  console.warn(`[env] ${message}`);
}
