# Form Generator

A free, customizable form builder for **NextPress** — an open alternative to WordPress's Contact Form 7, with all the good parts and none of the paywalls.

Drop a **Form Generator** block onto any page, build your form visually, and collect submissions in the admin inbox. Every submission runs through a defense-in-depth security pipeline: per-IP rate limiting, a hidden honeypot, a submit time-trap, and optional **Google reCAPTCHA v2 / v3** — all configurable from the admin, no code required.

---

## Features

- **Visual form builder** — add, reorder, and remove fields right in the block editor. 10 field types: text, email, textarea, phone, URL, number, dropdown, checkbox, radio group, and date.
- **Dynamic validation** — a Zod schema is built at submission time from the exact fields you authored, so client and server never drift.
- **Spam protection (free)** — hidden honeypot field + a time-trap that silently drops bots.
- **Flood / basic DDoS protection** — sliding-window per-IP rate limiting with configurable limits.
- **Google reCAPTCHA** — enable v2 (checkbox/invisible) or v3 (score-based) with your own keys. The secret key stays server-side.
- **Submission inbox** — submissions are stored as a `form_submission` content type and appear under Admin → Form Submissions.
- **Notifications hook** — fires on every successful submission so a mail plugin or the host can send email.

## Security pipeline

Every `POST /submit` passes through, in order:

1. **Method / content-type / size guards** — only small JSON POSTs are accepted (64 KB cap).
2. **Per-IP rate limiting** — configurable max per window; returns `429` with `Retry-After` when exceeded.
3. **Honeypot + time-trap** — bots that fill the hidden field or submit too fast are silently accepted (so they can't learn they were caught) but never stored.
4. **Google reCAPTCHA** — verified server-side against Google's `siteverify`; v3 enforces a score threshold.
5. **Dynamic Zod validation** — matches the authored field definitions.
6. **Persist + notify** — stores the submission (if enabled) and fires the success hook.

## Configuration

All settings live under **Admin → Settings → Form Generator** (stored in the `plugin:form-generator` settings group):

| Setting | Default | Purpose |
| --- | --- | --- |
| `recipientEmail` | `""` | Where notifications are sent. |
| `successMessage` | "Thank you!…" | Shown after a successful submit. |
| `enableNotifications` | `true` | Fire the notification hook. |
| `storeSubmissions` | `true` | Save submissions to the inbox. |
| `recaptchaEnabled` | `false` | Turn reCAPTCHA on/off. |
| `recaptchaVersion` | `v2` | `v2` (checkbox) or `v3` (score). |
| `recaptchaSiteKey` | `""` | Public key (sent to the browser). |
| `recaptchaSecretKey` | `""` | Private key (server-only). |
| `recaptchaMinScore` | `0.5` | v3 minimum score to accept. |
| `rateLimitMax` | `5` | Max submissions per window per IP. |
| `rateLimitWindowSeconds` | `60` | Rate-limit window length. |
| `honeypotField` | `np_hp_email` | Hidden field name. |
| `minSubmitSeconds` | `3` | Reject submits faster than this. |

Get reCAPTCHA keys from the [Google reCAPTCHA admin console](https://www.google.com/recaptcha/admin).

## Installation

1. **Place the plugin** in your NextPress `plugins/` directory (this folder) and activate it from **Admin → Plugins**. On activation it registers the block, the `form_submission` content type + fields, the settings group, and the API routes.

2. **Add the plugin API dispatcher (one-time, host-wide).** NextPress core stores plugin routes but does not yet ship a catch-all handler to serve them. Copy the included template to your app:

   ```
   plugins/form-generator/install/plugins-api-dispatcher.route.ts
     →  apps/web/app/api/v1/plugins/[...slug]/route.ts
   ```

   Then wire `getActivePluginContexts()` to your plugin manager's live-context accessor. This serves **all** plugins' routes, so you only add it once.

3. **(Optional) Enable persistence.** Public submissions need a site-scoped service context to be stored. See `install/persist-submission.example.ts` for the recommended wiring using `contentService.create` with a narrow `create_content` principal. Without it, submissions are still validated, spam-filtered, and acknowledged — just not saved to the inbox.

4. **Mount the settings page** at `/admin/settings/form-generator` using the exported `components/form-generator-settings-page.tsx` (the admin nav item is registered automatically).

## Usage

1. Edit any page/post, insert the **Form Generator** block.
2. Set the title/description, add fields, choose types, mark required, add options for dropdowns/radios.
3. Publish. The public form renders with the honeypot, time-trap, and (if enabled) reCAPTCHA wired in automatically.
4. View submissions under **Admin → Form Submissions**.

## Files

```
form-generator/
├── plugin.json                         # Manifest (permissions, settings schema)
├── package.json
├── index.ts                            # PluginDefinition: onActivate wiring
├── lib/
│   ├── form-schema.ts                  # Field types + dynamic Zod validator
│   ├── rate-limiter.ts                 # Sliding-window per-IP limiter
│   ├── recaptcha.ts                    # Google siteverify (v2 + v3)
│   └── spam-guard.ts                   # Honeypot + time-trap heuristics
├── api/
│   └── submit-handler.ts               # Secure submission pipeline (factory)
├── components/
│   ├── form-generator-block-edit.tsx   # Visual form builder (editor)
│   ├── form-generator-block-render.tsx # Public form (honeypot + reCAPTCHA)
│   └── form-generator-settings-page.tsx# Admin settings UI
└── install/
    ├── plugins-api-dispatcher.route.ts # Drop-in catch-all route for the host
    └── persist-submission.example.ts   # Optional persistence wiring
```

## License

MIT — free forever.
