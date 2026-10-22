/**
 * OPTIONAL: wire submission persistence into the host app.
 *
 * The plugin sandbox has no anonymous write context, so persisting a public
 * submission as a `form_submission` content entry must happen in the host app
 * layer, where a site-scoped `AuthContext` and the content service are
 * available. This file shows the recommended wiring.
 *
 * There are two ways to persist:
 *
 *   A) Pass a `persist` callback when constructing the submit handler (if you
 *      fork index.ts to build the handler in the host). See createSubmitHandler.
 *
 *   B) Listen on `content:after_save` — no persistence needed for that, it's
 *      just observation. For actual writes use (A) or the snippet below inside
 *      your dispatcher / a thin host route.
 *
 * SECURITY NOTE
 * -------------
 * Submissions come from anonymous visitors, so you must supply a controlled
 * service AuthContext scoped to the resolved site with only `create_content`
 * for the `form_submission` type. Do NOT reuse an admin session. Resolve the
 * site from request headers, never trust a siteId from the request body.
 */

import { contentService } from "@nextpress/core/content/content-service";
import type { AuthContext } from "@nextpress/core/auth/auth-types";
import type { StoredSubmission } from "../api/submit-handler";

/**
 * Build a minimal service auth context for anonymous form writes.
 * Adjust the user id / role to a dedicated system principal in your install.
 */
export function buildServiceAuth(siteId: string): AuthContext {
  return {
    user: {
      id: "system:form-generator",
      email: "system@nextpress.local",
      name: "Form Generator",
      displayName: "Form Generator",
      image: null,
    },
    siteId,
    role: "author",
    // Narrow permission set — only what persistence needs.
    permissions: new Set(["create_content"]) as AuthContext["permissions"],
  };
}

/** Persist one validated submission as a `form_submission` entry. */
export async function persistSubmission(
  siteId: string,
  submission: StoredSubmission,
): Promise<void> {
  const auth = buildServiceAuth(siteId);
  await contentService.create(auth, {
    contentTypeSlug: "form_submission",
    title: submission.title,
    status: "PUBLISHED",
    fields: {
      payload: submission.values,
      form_source: submission.source,
      submission_ip: submission.ip,
      is_read: false,
    },
  });
}
