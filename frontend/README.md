# Fussy Panda frontend — Steps 2A, 2B and 3A

Independent import of the existing Fussy Panda landing page from `whatsGood/frontend/app/(fussypanda)/fussypanda/`, connected to account signup/login and a separately routed Photo Studio. The homepage retains the original brand styling and placeholder photography; its trial and pricing links now open the studio.

## Local setup

Use Node.js 22.17 or newer. From `frontend`:

```sh
npm ci
npm run dev
```

Open http://localhost:3001. Production commands are `npm run build` and `npm start`; the latter also defaults to port 3001. Run `npm run lint` and `npm run typecheck` for static checks.

Run `npm run test:studio` for the frontend studio API/download contract checks. In the current automation environment, `npm run build -- --webpack` avoids the previously observed Turbopack port-binding restriction.

Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_API_URL` to the backend origin (local default `http://localhost:4100`). Start the backend separately. Its `FRONTEND_URL` must match the browser's frontend origin exactly, including the port. Use `localhost` consistently rather than mixing it with `127.0.0.1`. No database, JWT, SMTP or provider secrets belong in frontend variables. The inherited Geist font uses `next/font/google`: development/production compilation needs access to Google Fonts; built pages serve the downloaded font themselves.

## Step 2B account flows

| Route | Purpose |
| --- | --- |
| `/auth/signup` | Optional name, email, password confirmation and Google signup |
| `/auth/login` | Password/Google login, reset confirmation and safe local return paths |
| `/auth/forgot-password` | Generic reset-request confirmation without exposing account existence |
| `/auth/password-update?token=…` | New-password form; incomplete, expired and used links have recovery guidance |
| `/account` | Authenticated account details, server-reported credits, guest-claim status/retries and logout |

The frontend uses HTTP-only backend cookies via `credentials: 'include'` and sends `X-Fussy-Panda-CSRF: 1` on API requests. It does not store JWTs in local storage. The shared session provider restores authentication on page load and rechecks on focus, visibility changes and cross-tab account events. Account data comes only from authenticated backend endpoints; the account page redirects anonymous visitors to login. Logout revokes all account sessions. Password reset invalidates previous sessions and returns the visitor to login.

Google's client ID is read at runtime from the backend's public `GET /api/auth/config`; it is not a secret and needs no duplicate frontend setting. Set backend `GOOGLE_CLIENT_ID` to the dedicated Web client and authorize the frontend origin in Google. The frontend uses Google's hosted Identity Services button and passes its credential to the existing backend verification route. Without a client ID or if Google's script fails, email login remains available. Local and Google accounts are not silently linked by email.

The account and studio pages retry an unfinished guest claim up to ten times at three-second intervals, with a manual retry afterwards. Conflicting/unavailable claims are explained without clearing the guest cookie or starting another trial. Account email verification has not been added; the existing immediate-access signup policy remains in effect.

For different-site production frontend/backend deployments, configure the backend's HTTPS cookie policy as documented there. `NEXT_PUBLIC_API_URL` is embedded at build time, so rebuild after changing it.

## Original Step 2A import map

| Destination | Origin / adaptation |
| --- | --- |
| `app/page.tsx` | Existing Fussy Panda homepage, copied unchanged from the source route. Already present when this step began; verified identical. |
| `app/layout.tsx` | Existing Fussy Panda layout and metadata, adapted into a standalone Next.js root with required `html`/`body` elements and the source app's Geist font. |
| `app/global.css` | Existing brand stylesheet with the Tailwind import/font mapping needed outside the source app's root layout. |
| `public/img/fussyPanda/…png` | Original panda image, preserving its filename and import path. |
| `postcss.config.mjs`, `eslint.config.mjs` | Source configuration, unchanged. |
| `tsconfig.json` | Source TypeScript settings and `@/*` alias, with source-only auth paths removed from the include list. |
| `package.json`, `package-lock.json` | Independent package identity, source dependencies trimmed to the homepage's imports, standalone scripts and lockfile. |
| `next.config.ts` | Standalone config; source host rewrites and What’s Good image redirects are unnecessary when the homepage lives at `/`. |

`components`, `data`, `lib` and `src` remain available for later imports. This homepage has no local component/service imports beyond its panda image, so no restaurant, menu, account or studio dependencies are needed to run it. What’s Good analytics and product configuration are not carried into this independent application. The source project has not been edited. Next.js and its matching ESLint configuration use 16.4.2 rather than the source's 16.2.6 to address framework advisories reported during installation; the page itself is unchanged.

## Stage boundaries

- **2A:** import and verify the existing landing page and the files it needs to run independently.
- **2B:** working signup, login/logout, session handling, configurable Google authentication and password recovery, plus customer welcome emails and owner signup alerts.
- **3A:** studio transfer and frontend/API integration implemented; live provider/storage/billing verification requires external configuration. The studio stays separate from the homepage for development.
- **3B:** separately review the agreed What’s Good cleanup, preserving its self-serve studio.

Next.js generates `.next/`, `next-env.d.ts` and TypeScript cache files locally; they are ignored by Git.

## Historical Step 2A verification — 2026-10-19

- Production build, ESLint and TypeScript checks passed.
- Homepage, compiled stylesheet and optimized panda image each returned HTTP 200 on port 3001.
- Served HTML contains the original homepage copy, metadata, required root markup and asset references. Homepage, panda image and imported lint/PostCSS files match their source bytes.
- Production dependency audit reports no known vulnerabilities. Full audit reports five high findings along the development-only ESLint plugin → fast-glob → micromatch → braces chain. npm proposes an incompatible framework-lint downgrade; no forced downgrade was applied.
- Visual browser verification could not be completed because the browser integration was unavailable and the native browser connection failed. Desktop/mobile visual checks remain to be performed in a working browser.

Authentication and product flows remain scheduled for 2B and 3A. No backend changes or deployment were performed in this step.

## Step 2B verification — 2026-10-20

ESLint and TypeScript checks passed. Production compilation passed with `npm run build -- --webpack`; default Turbopack compilation was blocked by an operating-system port-binding restriction even outside the sandbox. The default build script remains unchanged. Homepage, all five account routes, and a repeated return-path query returned HTTP 200 with expected initial content. Runtime checks covered safe return paths (including array/external/auth-loop inputs), credentialed API calls, CSRF headers, unauthorized responses and network error redaction. Normal backend startup, `/health`, allowed frontend CORS and unauthenticated account denial passed.

Backend regression and email tests passed all 51 checks on isolated MySQL, with live provider/email credentials disabled. All 78 backend JavaScript/CommonJS files passed syntax checks. The configured SMTP server accepted connection and authentication; no real email was sent, so inbox delivery remains unverified. Google client ID was still empty at implementation time; real Google sign-in remains unverified. Browser inventory was empty, native Chrome automation timed out, and the in-app browser was unavailable, so desktop/mobile visual checks and browser-driven form submission remain outstanding.

## Step 3A studio transfer

| Fussy Panda destination | What's Good source / adaptation |
| --- | --- |
| `components/photo-studio/PhotoStudioWorkspace.tsx` | Transferred existing upload, conversation, preview, refinement and message-action UI. Environment upload is optional; environment snapshots stay specific to each chat. Source file validation retains JPG/PNG/WebP and 5 MiB limits. Downloads now use owned original endpoints; guest actions prompt authentication. |
| `PhotoStudioSideNav.tsx`, `PhotoStudioTopNav.tsx` | Transferred chat history, five-chat limit, deletion controls and navigation. Replaced product assets, routes and profile dependencies with Fussy Panda links. |
| `PhotoStudioGenerationProgress.tsx`, `.module.css` | Transferred existing progress display with brand colours. No invented percentage/completion guarantee. |
| `components/shared/ResponsiveSideDrawer.tsx` | Existing responsive drawer transferred. |
| `PhotoStudioApp.tsx` | Adapted source controller's create/generate/reload, sidebar and polling flows to cookie authentication, explicit guest sessions, ownership transfer and the independent API paths. No session-storage bearer tokens. |
| `PhotoStudioLibraryPanel.tsx` | Adapted source library loading/gallery into a native dialog, adding owned original downloads and deletion. |
| `PhotoStudioPricingModal.tsx` | Adapted source plan-card/select-plan flow into a native dialog. Removed Menu allowances and hardcoded What’s Good prices; amounts come from the backend's Stripe catalogue. Added subscription status, portal/invoices and cancellation/resume. |
| `lib/studio-api.ts`, `lib/studio-types.ts` | Replaced source Axios/product API dependencies with Fussy Panda's credentialed API helper and whitelisted response types. |

No source What’s Good files were edited. No Ant Design, source analytics, restaurant profiles or shared billing configuration were carried over. `PhotoStudioApp` is separate from its route and accepts `initialChatId`, `embedded` and `routeBase` props so it can later be mounted within a homepage; the homepage does not embed it in this step. Chat-based generation is the transferred user flow; the backend's older direct-generation endpoints remain available but have no additional frontend workflow here.

### Routes and behavior

- `/photo-studio`: reads an existing account/guest session; a visitor must explicitly click **Start my five-credit trial** to create a guest session. Expired/claimed/invalid credentials never silently create a new trial.
- `/photo-studio/[chatId]`: loads the owned chat and ordered messages. New dish uploads create a chat and start its first response; additional source uploads are free and can be followed by generation. Each generation/refinement uses the backend's authoritative balance.
- `/pricing`: redirects to `/photo-studio?billing=1`. Guests can browse plans; checkout requires an account. Only configured, active monthly Stripe prices have selectable billing controls.
- `/account`: links to the studio and plans/billing.

At trial exhaustion, chats and previews remain accessible and authentication is offered. Account-only saves/downloads use the existing claim flow and retain the guest cookie. Server-side generation state is polled after reload or a failed long-running request, without automatic resubmission. The generation request timeout is longer than the provider's individual request timeout to allow internal quality retries. Navigation and mutations are blocked while the active generation is in progress. Account changes remount the controller to discard the previous owner's data.

Download buttons request a fresh signed original URL for every click, then fetch the original without session cookies or referrer information. A rejected/expired download never falls back to a public preview. Library deletion is distinct from chat deletion; saved copies survive deletion of their chat.

Stripe checkout success redirects do not grant credits in the browser. The studio polls subscription/credit status briefly while signed webhook processing completes and offers manual refresh. Plan changes show a confirmation about immediate proration; the billing portal is available for reviewing payment details. Cancellation is scheduled at period end and can be resumed.

### External configuration and verification

Configure the backend's dedicated `OPENAI_API_KEY`, Supabase project/service role plus distinct private-original/public-preview bucket names, and Stripe secret, webhook secret and all three monthly price IDs. Provision bucket privacy and configure the Stripe webhook/portal as described in `backend/README.md`; keep every secret on the backend. Restart the backend after environment changes. No frontend provider key or Stripe publishable key is needed for the hosted checkout flow.

Local verification on 2026-10-20: frontend ESLint, TypeScript and Webpack production build passed; all six frontend API/download contract tests and all 52 backend checks passed. Backend tests used isolated MySQL, fake image/storage/provider results and signed fixture Stripe events. No live image generation, upload or payment was performed. OpenAI, Supabase and Stripe settings were empty during this step, so real image generation, private/public bucket behavior, signed download delivery and Stripe test checkout/webhook/portal still need live verification after configuration. Browser inventory was empty and native Chrome automation timed out, so desktop/mobile visual checks and browser-driven interaction remain outstanding.
