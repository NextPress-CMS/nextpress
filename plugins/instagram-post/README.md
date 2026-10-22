# NextPress Instagram Posts

Archive an Instagram account's posts into NextPress, and publish NextPress content to Instagram, with your website holding the durable copy.

---

## 1. Overview

This plugin connects a NextPress site to a single Instagram professional account and moves content in both directions:

```text
Instagram  ──── import / scheduled sync ────▶  NextPress  (durable archive)
NextPress  ──── publish from the editor ────▶  Instagram  (distribution)
```

The important design decision: **your public pages never call Instagram.** Posts are imported into ordinary NextPress content entries and media is downloaded into your Media Library, so pages render from your own database. That keeps the site fast, cacheable, indexable, and unaffected by Instagram outages, expiring CDN URLs, or API quotas.

Instagram is treated as a distribution platform. Your website is the archive.

## 2. Features

- Connect a Business or Creator account through OAuth
- Import historical posts: paginated, resumable, and safe to re-run
- Archive images and video into the NextPress Media Library
- Scheduled synchronisation of new posts, at a configurable interval
- Publish images, video, and carousels from the existing NextPress editor
- A dedicated Instagram caption, separate from your website copy
- Duplicate prevention on both import and publication
- Reconciliation for ambiguous publish responses
- Typed errors with actionable admin messages
- A public block that renders from local content
- Full RBAC, site isolation, and structured logging
- 164 tests, no network required

## 3. Requirements

| Requirement | Version |
| --- | --- |
| NextPress | 1.1.0 or later |
| Node.js | 20 or later |
| Database | PostgreSQL (as required by NextPress) |
| Instagram account | Professional (Business or Creator) |
| Meta app | With Instagram Business Login configured |

Personal Instagram accounts are not supported by the Instagram API and cannot be used.

## 4. Installation

The plugin lives in the workspace under `plugins/instagram-post`. Add it to the web app's dependencies and install:

```jsonc
// apps/web/package.json
"@nextpress/plugin-instagram-post": "workspace:*"
```

```bash
pnpm install
```

Then activate **Instagram Posts** from **Admin → Plugins**.

## 5. Configuration

Three environment variables are required:

```env
INSTAGRAM_APP_ID=
INSTAGRAM_APP_SECRET=
INSTAGRAM_REDIRECT_URI=https://your-site.com/api/v1/plugins/instagram-post/oauth/callback
```

Scheduled synchronisation reuses NextPress's existing cron secret:

```env
CRON_SECRET=
```

Never commit real credentials. `INSTAGRAM_APP_SECRET` is used only server-side, during the OAuth code exchange.

## 6. Meta application setup

1. Go to <https://developers.facebook.com/apps> and create an app.
2. Add the **Instagram** product and choose **Instagram Business Login**.
3. Under **API setup with Instagram login**, note the **Instagram App ID** and **Instagram App Secret**.
4. Add your callback under **Business login settings → Valid OAuth Redirect URIs**:
   `https://your-site.com/api/v1/plugins/instagram-post/oauth/callback`
5. Request Advanced Access for `instagram_business_basic` and `instagram_business_content_publish` through App Review before going live.
6. Switch the app to **Live** mode.

The redirect URI must match `INSTAGRAM_REDIRECT_URI` exactly, including the scheme and any trailing path.

## 7. OAuth

The flow is the current Instagram Business Login sequence:

```text
Admin clicks Connect
   → instagram.com/oauth/authorize      (state: HMAC-signed, site-bound)
   → callback with authorization code
   → api.instagram.com/oauth/access_token   (server-side, 1-hour token)
   → graph.instagram.com/access_token       (60-day long-lived token)
   → account verified, connection saved
```

CSRF protection is twofold: the `state` value carries an HMAC signature bound to your site id, **and** must match an `HttpOnly` cookie set at the start of the flow. A forged or replayed callback fails both checks.

## 8. Required permissions

| Scope | Purpose |
| --- | --- |
| `instagram_business_basic` | Read the account profile and its media |
| `instagram_business_content_publish` | Publish posts to the account |

If a user deselects a permission on the consent screen, the connection is refused at connect time with a clear message rather than failing later.

## 9. Connecting an account

Go to **Admin → Instagram** and click **Connect Instagram**. Once connected, the dashboard shows the username, account id, account type, token status, connection date, and last sync.

Access tokens are never displayed, never returned by any API response, and never written to a log.

## 10. Importing historical posts

**Admin → Instagram → Import.** Choose a size (latest 10/25/50/100, or all available) and click **Preview** to see how many posts exist, how many are already archived, and how many are new.

The import runs server-side in batches. You can close the browser; it continues, and it is safe to re-run:

- Every post is keyed on its **Instagram media ID**, never on caption, timestamp, or URL
- Re-running creates no duplicates
- Each batch returns a cursor so an interrupted import resumes exactly where it stopped
- Media is never all loaded into memory at once

Imported posts default to **Draft** status so an import cannot silently publish an entire back catalogue to a live site.

## 11. Automatic synchronisation

Instagram provides **no webhook for new media**. The available webhook fields cover comments, mentions, messages, and story insights only. Synchronisation therefore polls, and does so frugally.

Add a cron entry hitting the sync endpoint:

```json
{
  "crons": [
    { "path": "/api/cron/instagram-sync", "schedule": "*/15 * * * *" }
  ]
}
```

Or from any scheduler:

```bash
curl -X POST https://your-site.com/api/cron/instagram-sync \
  -H "Authorization: Bearer $CRON_SECRET"
```

Each site's configured interval is honoured inside the service, so a frequent tick is cheap: sites that are not due are skipped without an API call. A routine sync stops at the first already-archived post, costing **one** API request regardless of archive size.

Available intervals: manual, 15 minutes, 30 minutes, hourly, 6 hours, 12 hours, daily.

## 12. Publishing from NextPress

Open any post or page and use the **Instagram** panel in the editor sidebar:

1. Tick **Publish to Instagram**
2. Write an Instagram caption, deliberately separate from your website copy, since an article and an Instagram post are rarely the same text
3. Attach media (one image, one video, or 2–10 items for a carousel)
4. Publish the entry, then click **Publish to Instagram**

Only entries that are **PUBLISHED in NextPress** can be published to Instagram, so a draft can never reach a live audience.

Media is validated locally first, so you get "Instagram only accepts JPEG images" rather than "Error 400", and no quota is spent on a request that was always going to fail.

## 13. Public archive

The **Instagram Posts** block renders archived posts from local content. Options: post count, layout, columns, captions, dates, Instagram links, pagination.

Because `instagram-post` is a normal public content type with an archive, imported posts get SEO-friendly URLs, sitemap inclusion, metadata, and internal search through NextPress's existing systems. No separate SEO or caching layer is introduced.

## 14. Configuration reference

| Setting | Default | Effect |
| --- | --- | --- |
| Automatic synchronisation | Off | Enables scheduled imports |
| Sync frequency | 6 hours | Polling interval |
| Imported post status | Draft | Status applied to imported posts |
| Archive media locally | On | Downloads media into the Media Library |
| Publish to Instagram by default | Off | Pre-enables publishing on new content |
| Derive caption from excerpt | On | Uses the excerpt when no caption is set |

## 15. Security

- **Tokens** are stored under a `_secret_` prefix and pass through a single public-projection boundary before any response. They are never returned to a browser, and the logger scrubs both secret-named keys and token patterns in free text.
- **OAuth** uses an HMAC-signed, site-bound, expiring `state` plus a matching `HttpOnly` cookie. Codes are exchanged server-side only.
- **Authorisation** is enforced server-side on every route via `can()`. Hidden buttons are never the boundary.
- **Site isolation**: every query is scoped by `siteId`, including the scheduled path.
- **Media downloads** are hardened against SSRF: HTTPS only, suffix-matched CDN allowlist, manual redirect handling re-validated at each hop, request timeout, streaming byte cap, and magic-byte verification that overrides a lying `Content-Type`.
- **External responses** are Zod-validated before reaching the database or UI.
- **Publishing** never blind-retries an ambiguous response.

## 16. API limitations

Honest constraints of the current Instagram API:

- **No webhook for new media.** Polling is the only option.
- **`media_url` is sometimes absent**. Meta omits it for posts with copyrighted audio or when downloads are disabled. Those posts are archived with caption, timestamp, and permalink, but without a media file.
- **Instagram URLs expire.** This is why local archiving matters.
- **Publishing requires a public HTTPS URL** that Meta can fetch. A site behind authentication or on localhost cannot publish.
- **Images must be JPEG**, ≤8MB, 320–1440px wide, aspect ratio 4:5 to 1.91:1.
- **Video** must be MP4/MOV, ≤300MB, 3s–15min.
- **Reconciliation is imperfect.** A container's status confirms whether it published, but returns no media id, and reports `EXPIRED` after 24 hours regardless of history. Genuinely unknowable cases are surfaced for a human decision rather than guessed at.
- **The publishing quota is read at runtime** from `/content_publishing_limit`; the documentation contradicts itself (50 vs 100 per 24h), so no number is hardcoded.
- **No scheduled publishing** at Meta's end; scheduling is NextPress's job.
- **10,000 most recent media** is the maximum retrievable.
- **Personal accounts are inaccessible**, as is other users' media.
- **Bidirectional editing is not implemented.** Editing an archived post locally does not modify Instagram; the API does not support it safely.

## 17. Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| "Instagram connection requires attention" | The token expired or was revoked. Click **Reconnect Instagram**. Tokens last 60 days and are auto-refreshed around day 45, so a site offline for 60+ days needs a fresh authorisation. |
| Connection fails with "missing permissions" | A permission was deselected on the consent screen. Reconnect and accept both. |
| Sync never runs | Check that auto-sync is on, the interval is not "manual", and the cron endpoint is being called with a valid `CRON_SECRET`. |
| Posts import without images | Meta withheld `media_url` (copyrighted audio or downloads disabled). Expected; captions and permalinks are still archived. |
| Publishing fails on media | Read the validation message; it names the exact requirement. Convert PNG to JPEG, resize outside 320–1440px, or crop an out-of-range aspect ratio. |
| Publication stuck on "Publishing" | An ambiguous response. Reconciliation resolves it on the next attempt. Do not retry manually, as that risks a duplicate post. |
| Rate limited | The plugin backs off automatically using Meta's usage headers. Increase the sync interval if it recurs. |

## 18. Development

```text
plugins/instagram-post/
├── index.ts                     plugin definition and lifecycle
├── plugin.json                  manifest, permissions
├── src/
│   ├── api/                     Instagram client, types, errors, OAuth, fakes
│   ├── services/                connection, import, sync, publish, media, state
│   ├── content/                 content type, fields, caption mapping
│   ├── admin/                   dashboard, import, settings, posts, editor panel
│   ├── blocks/                  public archive block
│   ├── permissions/             RBAC definitions
│   └── schemas/                 settings and the secret boundary
└── __tests__/                   164 tests
```

The Instagram API layer is deliberately isolated from the CMS layer behind the `InstagramClient` interface, so an API change is contained to `src/api/`.

**Multi-instance note:** duplicate suppression during import uses a check-then-create guarded by a per-process lock. A deployment running several Node instances against one database should additionally add a unique index on the `instagram_media_id` field value for defence in depth.

## 19. Testing

```bash
pnpm --filter @nextpress/plugin-instagram-post test
pnpm --filter @nextpress/plugin-instagram-post typecheck
```

No test touches the real Instagram API. `FakeInstagramClient` implements the same interface, including cursor pagination, asynchronous video container processing, and quota exhaustion, with per-method failure injection for expired tokens, rate limits, and lost responses.

## 20. Contributing

Issues and pull requests are welcome at <https://github.com/NextPress-CMS/instagram-post>. Please include tests, keep the API layer separate from CMS logic, and verify claims against current official Meta documentation rather than tutorials.

## 21. License

MIT, consistent with the NextPress repository.
