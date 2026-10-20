# Fussy Panda backend — Steps 1A and 1B

Independent account and Photo Studio backend adapted from `whatsGood/backend`. This application uses its own code, database, secrets, Stripe customers, and storage paths. It does not register restaurant, menu, or restaurant billing routes. No existing accounts, projects, uploads, or live credentials have been migrated.

## Local setup

1. Use Node.js 22.17 or newer and run `npm ci` in this directory.
2. Copy `.env.example` to `.env`. Provision a dedicated MySQL database and user; set `DB_DATABASE`, `DB_USERNAME`, and the connection settings. Database provisioning is separate from migrations. Names containing “whatsgood” are rejected; verify the actual credentials are independent too.
3. Generate a new `JWT_SECRET` of at least 32 characters. Set `FRONTEND_URL` to the frontend origin (development default `http://localhost:3001`). Backend default port is `4100`.
4. Run `npm run db:create:dev` if the configured database does not exist, then `npm run db:migrate:dev` and `npm run dev`. Database creation requires a MySQL user with permission to create databases. Startup authenticates the database; it never synchronizes schemas or seeds users.
5. Configure the independent storage, OpenAI, and Stripe services below to use those features. Account routes and the health endpoint can start without them; unavailable service routes return configuration errors.

### Database commands

Run these commands from `backend`:

| Action | Production | Development |
| --- | --- | --- |
| Create database | `npm run db:create` | `npm run db:create:dev` |
| Drop database and all its data | `npm run db:drop` | `npm run db:drop:dev` |
| Apply pending migrations | `npm run db:migrate` | `npm run db:migrate:dev` |
| Roll back all migrations | `npm run db:migrate:undo` | `npm run db:migrate:undo:dev` |

`npm run db:reset` drops the configured development database, recreates it and applies migrations. It deletes all data. The current development and production configurations both read the same `DB_*` environment variables; the `:dev` suffix does not select a separate database. Verify the configured database before drop, rollback or reset commands. Trial migration rollback can refuse to proceed when records require reconciliation; see the anonymous trial section below.

No seed commands are included because the seeders directory is empty. npm scripts use the locally installed `sequelize-cli` without needing an `npx` prefix.

## Account API

| Endpoint                         | Behavior                                                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `GET /health`                    | Product health response                                                                                            |
| `POST /api/user/register`        | Email/password signup; optional ownerName, phone, avatar; creates account and 25 signup credits in one transaction |
| `POST /api/user/login`           | Email/password login                                                                                               |
| `POST /api/user/logout`          | Authenticated logout; revokes all account sessions and clears cookie                                               |
| `GET /api/user`                  | Current user; bearer token or session cookie required                                                              |
| `PATCH /api/user`                | Update ownerName, phone, avatar                                                                                    |
| `POST /api/user/oauth/google`    | Verify Google credential; new accounts receive the same signup allowance                                           |
| `POST /api/auth/forgot-password` | Generic response; send one-hour reset link when an account exists                                                  |
| `POST /api/auth/reset-password`  | Single-use reset token; changes password and revokes sessions                                                      |

Sessions use the HTTP-only `fp_session` cookie and JWTs with the Fussy Panda issuer/audience, independent secret, and current token version. Frontend fetches should use `credentials: 'include'`. Production cookies require HTTPS. `SESSION_SAME_SITE=none` is available for different-site frontend/backend deployments. CORS permits only `FRONTEND_URL`. `TRUST_PROXY=true` assumes one trusted reverse proxy.

Google requires a dedicated `GOOGLE_CLIENT_ID` and a verified email. It does not silently link local accounts. Local signup does not require email verification; the source had no verification flow.

Password reset emails use `FRONTEND_URL` and `PASSWORD_RESET_PATH` (default `/auth/password-update`). Development without SMTP prints emails to the console. Production requires SMTP configuration and `EMAIL_FROM`. Actual Google sign-in and SMTP delivery require live configuration and separate verification.

### Step 2B account integration and email

`GET /api/auth/config` exposes only `{ googleClientId }` (null when unset), with no caching, so the frontend can render Google's hosted sign-in button using the backend's dedicated Web client. Set `GOOGLE_CLIENT_ID` and authorize the frontend origin in Google's client settings. No Google client secret is used by the ID-token verification flow. Current-user and authentication responses also disable caching.

New email/password and Google accounts receive a welcome email. Optional `SIGNUP_NOTIFICATION_EMAIL` configures a separate owner notification containing email, supplied name, signup method and timestamp. Notifications run only after a new account transaction commits; returning logins, failed/duplicate signups and guest-claim retries do not generate signup emails. Both deliveries are attempted independently and failures are logged without exposing credentials or preventing authentication. SMTP connection/greeting/socket timeouts bound delivery attempts; there is no persistent email queue or automatic retry.

Configure `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_SECURE`, `EMAIL_USER`, `EMAIL_PASSWORD` and an authorized `EMAIL_FROM` sender. Port 587 normally uses `EMAIL_SECURE=false` with STARTTLS; port 465 uses `true`, subject to the provider's settings. Password-reset links point to the configured frontend. Signup continues to grant immediate access without an email-verification requirement.

On 2026-10-20, all 51 backend checks passed against separately initialized/migrated MySQL, including new email-recipient, sensitive-field exclusion, delivery-failure and Google-new-account-only notification checks. Live SMTP connection and authentication succeeded without sending an email. Real inbox delivery, Google sign-in and frontend browser flows still require verification; Google client ID was empty and browser automation unavailable. The configured application database already had all 13 migrations; Step 2B introduced no schema changes.

## Photo Studio API

Studio endpoints accept either an authenticated account or an explicitly created guest session. Library saves and original downloads require an authenticated account that owns the work. Chats and previews remain readable when credits are exhausted; generation requires a credit. Records and storage operations are scoped to their account or guest owner.

| Endpoint                                                         | Behavior                                                                                         |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `GET /api/photoStudio/environment`                               | Current environment                                                                              |
| `PUT /api/photoStudio/environment`                               | Upload `environmentPhotoDataUrl`                                                                 |
| `POST /api/photoStudio/generations`                              | Upload `sourcePhotoDataUrl` and generate a composite                                             |
| `POST /api/photoStudio/generations/:id/redo`                     | Retry an unsaved generation with a new credit reservation                                        |
| `DELETE /api/photoStudio/generations/:id`                        | Delete a temporary, idle generation                                                              |
| `POST /api/photoStudio/generations/:id/library`                  | Save a generated photo once                                                                      |
| `GET /api/photoStudio/library`                                   | Account library                                                                                  |
| `DELETE /api/photoStudio/library/:id`                            | Delete an owned library photo                                                                    |
| `GET /api/photoStudioChats`                                      | List up to five active chats                                                                     |
| `POST /api/photoStudioChats`                                     | Create a chat using `sourcePhotoDataUrl` and optional `title`; snapshots the current environment |
| `GET /api/photoStudioChats/:chatId`                              | Chat with ordered messages and library links                                                     |
| `POST /api/photoStudioChats/:chatId/source`                      | Add a new source image                                                                           |
| `POST /api/photoStudioChats/:chatId/messages`                    | Generate a response using optional `instruction`; follow-ups need instructions                   |
| `POST /api/photoStudioChats/:chatId/messages/:messageId/library` | Save an agent image once                                                                         |
| `DELETE /api/photoStudioChats/:chatId`                           | Delete an idle chat; preserve its separate library copies                                        |
| `GET /api/photoStudioCredits`                                    | Permanent, monthly, and available credit balances plus entitlements                              |

Uploads accept JPG, PNG, or WebP, at most 5 MiB decoded. Images are decoded, constrained to 40 million pixels, resized, and normalized. Studio request bodies allow 8 MiB for base64 uploads; account bodies remain limited to 100 KiB. Generated images are limited to 25 MiB. Generation endpoints have rate limits. Failed generation returns its reserved credit; quality retries within one chat response consume at most one credit.

### Storage and generation

Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in a dedicated Fussy Panda project. Manually provision **two distinct buckets** before enabling studio uploads:

- `SUPABASE_PRIVATE_STORAGE_BUCKET`: private, holding every new source, environment, and generated original. The backend checks that this bucket is private and refuses uploads if it is public. Keep browser access policies restricted; service-role credentials stay on the backend.
- `SUPABASE_PREVIEW_STORAGE_BUCKET`: public, holding only reduced, watermarked previews (maximum 640 pixels on either edge and at most half the original longest edge). Do not put originals in this bucket.

New paths start with `private/fussy-panda/accounts/<user-id>/photo-studio/` or `private/fussy-panda/guests/<guest-id>/photo-studio/`. The `private/` prefix is a namespace, not a privacy control; bucket privacy is essential. File ownership is tracked in `photoStudioFiles`. Claimed guest paths stay in place and their database ownership transfers to the account. Provider/QA reference images use short-lived signed URLs, never exposed in normal API responses. Responses whitelist fields and return preview URLs for new images to both guests and accounts. Original download endpoints return ownership-checked signed URLs, expiring after 60 seconds by default (maximum 120 seconds).

`SUPABASE_STORAGE_BUCKET` is optional legacy configuration for account images uploaded before the guest trial. Existing public originals do **not** become private through a code migration. Before exposing existing data, inventory those objects, copy them into private storage with tracking rows, replace stored image URLs with generated previews, verify ownership/downloads/provider references, then remove the old public copies and review caching. Alternatively, explicitly retire the old data. A signed download endpoint cannot revoke an already public URL. This repository has not changed live buckets, policies, objects, or existing public data.

Set `OPENAI_API_KEY`, `OPENAI_IMAGE_MODEL`, and `OPENAI_QA_MODEL` for the dedicated provider account. The model defaults mirror the existing source generation flow; verify model access when configuring the account. Chat generation runs image quality checks and one retry by default (`PHOTO_GENERATION_MAX_RETRIES=1`). Provider request and reference download timeouts are configurable in `.env.example`.

### Credits and subscriptions

Each account receives 25 permanent signup credits once. Existing Step 1A accounts receive that same idempotent grant when credits are first accessed. Basic, Pro, and Enterprise provide 25, 75, and 150 credits per subscription period. Monthly credits are used before signup credits and expire at the period end. No restaurant or menu allowance is included.

Account-row locks serialize credit operations. Each generation reserves one credit before work, consumes it on success, or releases it on failure. Ledger keys make repeated completion/release and grants idempotent. A plan upgrade within the same period grants only the difference from the highest allowance already granted. Downgrades retain already granted credits until expiration; switching plans repeatedly cannot refill spent credits. Inactive or delinquent subscriptions cannot spend monthly credits. Cancellation scheduled for period end retains access until then.

| Endpoint                                        | Behavior                                                                                         |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `GET /api/photoStudioSubscription/plans`         | Public Basic/Pro/Enterprise catalogue with configured Stripe price amounts and monthly allowances |
| `POST /api/photoStudioCheckout/session`         | Create or reuse an open checkout for `plan`; different-plan checkout conflicts while one is open |
| `POST /api/photoStudioCheckout/portal`          | Open the account's Stripe billing portal                                                         |
| `GET /api/photoStudioSubscription/me`           | Current plan, subscription status, and credits                                                   |
| `POST /api/photoStudioSubscription/change-plan` | Change recurring price with immediate proration; failed payment leaves the change unapplied      |
| `POST /api/photoStudioSubscription/cancel`      | Schedule cancellation at period end                                                              |
| `POST /api/photoStudioSubscription/resume`      | Remove scheduled cancellation                                                                    |
| `POST /api/stripeWebhook`                       | Raw-body, signature-verified webhook; no account session required                                |

Use a dedicated Stripe account or isolated test environment. Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and all three `STRIPE_PHOTO_STUDIO_*_PRICE_ID` variables to monthly recurring prices. Configure the billing portal in Stripe. Price amounts are supplied by Stripe, not hardcoded in this backend.

The Step 3A public catalogue returns only plan key/name/allowance, Stripe amount in currency minor units, currency and availability. Missing configuration, provider errors, inactive prices and non-monthly/non-fixed prices produce an unavailable plan with no amount; they never fall back to What’s Good prices. Account subscription endpoints remain authenticated. The standalone frontend uses this catalogue for pricing, existing hosted Checkout/portal endpoints and signed webhook-driven balances.

Register webhook events for `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, and `invoice.payment_failed`. Only subscriptions with both `application=fussy-panda` and `product=photo_studio` metadata are accepted. Webhooks retrieve current Stripe state, serialize account updates, record successful processing transactionally, and ignore duplicates. Failed transactions remain retryable. Both legacy and nested invoice subscription references are supported. The raw parser is mounted before JSON parsing.

Plan changes use Stripe's `error_if_incomplete` payment behavior, so payment failures do not apply the requested change. See [Stripe's update subscription reference](https://docs.stripe.com/api/subscriptions/update).

Checkout and portal redirects target `/photo-studio`; password resets target `/auth/password-update`. Those frontend routes are now implemented in Steps 2B and 3A.

### Cleanup

Normal server startup schedules cleanup every five minutes. Temporary direct generations expire after one hour; abandoned chat generation reservations are recovered after twenty minutes. Saved direct generations keep their library copy while temporary source/output files are removed. Failed storage deletions retain records for retry. Cleanup intervals and age thresholds are configurable. The timer is stopped when the server closes.

## Anonymous five-token trial and frontend integration

Migration `012-anonymous-photo-studio-trial.cjs` adds guest sessions, exclusive guest/account ownership, private file tracking, and optional environments. Migration rollback deliberately refuses to discard trial balances, tracked private files, or multiple transferred environments; reconcile those records first. Run migrations during a maintenance window: MySQL DDL is not transactional. A clean empty-schema apply/rollback/reapply is supported.

Guests receive exactly five database-backed tokens once per session. A successful generation or refinement spends one, failed provider/quality work refunds its reservation, and internal quality retries spend no extra tokens. Direct generation, redo, and chat refinements share the same locked credit bucket. Uploading sources/environments, creating chats and reading previews are free. An environment is optional; the source image is used as the provider reference when none is supplied. Guests can create up to five active chats.

| Endpoint | Contract |
| --- | --- |
| `POST /api/photoStudio/session` | Explicitly start a trial or reuse the current active session. Sets `fp_guest`; returns `{ studio }`. A valid account session retains its account flow. Never call this automatically to replace an expired/claimed credential. |
| `GET /api/photoStudio/session` | Read current account/guest status without creating a trial. |
| `POST /api/photoStudio/session/claim` | Authenticated, idempotent retry of the current cookie's ownership transfer. Returns `{ guestClaim, studio }`. |
| `GET /api/photoStudio/generations/:id/download` | Owned generated original, account only. |
| `GET /api/photoStudio/library/:id/download` | Owned library original, account only. |
| `GET /api/photoStudioChats/:chatId/messages/:messageId/download` | Owned completed agent-image original, account only. |

Download responses are `{ download: { url, expiresIn }, studio }` with `Cache-Control: no-store`. The frontend should use that URL for the actual download and request a fresh one after expiry. Normal image fields contain previews, not download authorization. Guests cannot save to the account library or obtain original URLs. Previews can still be saved or screenshotted.

Studio responses include:

```json
{
  "studio": {
    "status": "guest",
    "authenticated": false,
    "availableTokens": 5,
    "remainingTrialTokens": 5,
    "trialExhausted": false,
    "downloadEligible": false
  }
}
```

`remainingTrialTokens` becomes the transferred trial balance after authentication; `availableTokens` includes usable subscription, trial and signup balances. Render the server's balance, never a client-supplied count. At exhaustion leave chats/previews available and prompt for authentication. Download eligibility describes authentication; individual downloads still check ownership and successful claim.

**Cookie and claim flow:** use `credentials: 'include'` on frontend requests. Every mutating request that creates or carries a guest session (including signup/login/logout while `fp_guest` exists) must send the configured `Origin` and `X-Fussy-Panda-CSRF: 1`. CORS permits only `FRONTEND_URL`. `fp_guest` is a cryptographically random 256-bit opaque secret; only its SHA-256 hash is stored. It is HTTP-only, uses the configured session SameSite policy, and is Secure in production. Active trials expire after seven days by default; their cookie lasts 90 days to avoid silently reissuing a spent, expired or claimed trial.

Successful email signup, password login, Google signup and returning Google login automatically attempt a claim. Auth responses include `guestClaim` and `studio`. Transfer is transactional and preserves chats/messages, environments, generated files and the actual remaining trial balance, including zero. Account signup still grants its independent 25 credits exactly once; subscription allowances are unchanged. Transferred trial credits form a separate `claimed_trial` bucket, spent after monthly credits and before signup credits. Multiple environments are retained; studio operations select the most recently updated one. A claim can belong to only one account and never resets spent credits.

When generation is in progress, authentication can succeed with `guestClaim.status = "pending"` and `code = "GUEST_GENERATION_IN_PROGRESS"`. Wait for the generation request to settle, then retry `POST /api/photoStudio/session/claim` with both cookies. The explicit claim endpoint returns 409 for pending/conflicting claims, 410 for unavailable sessions, and 200 for successful/already completed claims. Other statuses are `none`, `claimed`, `already_claimed`, `conflict`, and `unavailable`. Do not discard the guest cookie while a claim is pending. Once claimed, account authentication takes precedence over the retained guest cookie; the guest credential alone returns 410.

| Error code | HTTP | Frontend handling |
| --- | --- | --- |
| `GUEST_TRIAL_EXHAUSTED` | 402 | Keep previews, prompt for signup/login. |
| `AUTHENTICATION_REQUIRED` | 401 | Authenticate and complete the claim before download/library save. |
| `GUEST_SESSION_REQUIRED` | 401 | Offer explicit trial creation or login. |
| `GUEST_SESSION_INVALID`, `GUEST_SESSION_EXPIRED`, `GUEST_SESSION_CLAIMED`, `GUEST_SESSION_UNAVAILABLE` | 410 | Explain session state; offer login. |
| `OWNERSHIP_VIOLATION`, `PHOTO_STUDIO_CHAT_NOT_FOUND` | 404 | Do not expose another owner's work. |
| `CSRF_REJECTED` | 403 | Correct Origin/custom-header configuration. |
| `GUEST_CREATION_RATE_LIMITED`, `GUEST_GENERATION_RATE_LIMITED` | 429 | Respect rate-limit headers and ask the visitor to wait. |

Guest creation and generation have configurable IP limits. `TRUST_PROXY=true` assumes exactly one trusted reverse proxy; keep that assumption correct for the deployment. IP hashes are abuse signals, not identity. Clearing cookies, using another browser, or switching networks can bypass an anonymous allowance; this does not provide perfect prevention. A deployment with multiple backend instances should use a shared limiter store for strict cluster-wide request-rate limits; the database continues to enforce each session's five-token spending cap.

Cleanup runs with the existing five-minute scheduler. Guest work has a renewable heartbeat lease; active provider work is preserved across guest expiry. Stale reservations are refunded, expired guest files are deleted, and deletion failures retain records for retry. Claimed work is excluded. Hashed credential tombstones are retained to stop an old cookie granting another trial. Requests started before expiry may finish successfully; later guest requests return 410. See `.env.example` for guest lifetime, lease, creation/generation limits, and signing TTLs.

## Deployment

`render.yaml` is an inactive deployment template. Provision the dedicated database and external services, review the domains and environment values, then import it explicitly. It runs `npm ci`, migrations, and server startup. Configure HTTPS, SMTP, Google credentials, Stripe prices/webhooks, storage, and model access before live feature verification. No deployment has been performed.

## Verification

`npm test` requires `NODE_ENV=test`, `DB_DATABASE=fussy_panda_1a_test`, and an isolated Unix socket under `/tmp/fussy-panda-mysql-1a-`. Migrate that test database first; use a separate test JWT secret and frontend origin. Leave Google/SMTP/provider credentials unset. Tests use real MySQL, local HTTP servers, real image decoding, fake storage/provider responses, and signed fixture Stripe events. They create test accounts without touching live services. Node's experimental module-mocking flag is used only by the test command.

Step 1A was verified on 2026-10-01. Step 1B verification covers all twelve migration apply/rollback/reapply operations, account regression checks, studio ownership and image validation, signup grants, generation success/failure, quality retries, simultaneous credit operations and chat creation, library preservation, abandoned-work recovery, checkout customer/session reuse, signed duplicate webhooks, failed-webhook retry, plan changes, cancellation/resume, renewal, expiration, and delayed events. Final Step 1B verification on 2026-10-01: all 66 JavaScript/CommonJS files passed syntax checks; all 29 Node test checks passed (26 functional scenarios plus three parent suites); all twelve migrations applied, rolled back, and reapplied on isolated MySQL 9.6. Normal server startup and `/health` also passed. No live provider calls or deployment were performed.

Step 1B including the anonymous trial was completed and locally verified on **2026-10-19**: all **45 Node test checks** passed (41 functional scenarios plus four parent suites); all **77 JavaScript/CommonJS files** passed syntax checks; all **13 migrations** applied, rolled back and reapplied on fresh isolated MySQL 9.6; normal startup and `/health` passed. The added guest suite covers hashed cookies, CSRF/tampering, exclusive database ownership, public-original-bucket rejection, free uploads, optional environments, preview reduction/watermarking and response redaction, private provider references, download/library restrictions, quality retries/refunds, direct/redo/shared trial spending, concurrent reservations, exhaustion, email signup/password login/Google signup/Google login claims, repeated/conflicting/concurrent claims, preserved environments and balances, active-work expiry, stale reservation recovery, storage deletion retry and claimed-work preservation.

Finishing this work corrected account-library queries that referenced a nonexistent guest column, expiry handling for successful in-flight generation responses, cleanup transaction propagation, and foreign-key index order during trial migration rollback. Setup and deployment examples now distinguish private originals from public previews. The frontend and What's Good project were not edited. Changes remain uncommitted; no live services were called or deployment performed.

The mail dependency was updated to its patched release. npm still reports two related moderate advisories for Sequelize's transitive UUID dependency. This application uses generated UUIDv4 values, not the affected caller-supplied-buffer API; a Sequelize major downgrade was not applied.

Live OpenAI output, Supabase uploads, Stripe test-mode checkout, Google sign-in, SMTP delivery, frontend/browser integration, and deployment still require their external configuration and separate verification. Local Step 1B tests do not establish live service readiness.

Step 3A local verification on 2026-10-20 passed all **52 backend checks**, including a new public Stripe catalogue scenario for configured prices, inactive/annual prices and provider failures. The six frontend API/download checks also passed. No schema migration or production data modification was needed. OpenAI, Supabase and Stripe credentials remain unconfigured, so generation/storage/Stripe live verification is outstanding. See `frontend/README.md` for the transfer map and browser-verification limitations.
