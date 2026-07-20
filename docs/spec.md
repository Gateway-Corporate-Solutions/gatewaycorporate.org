# GatewayCorporate.org Specification

## 1. System Overview

This repository is a Deno + Oak production website that combines:

- Static marketing pages and product pages.
- Markdown-driven blog and careers content.
- Contact and job application submission workflows.
- First-party experimentation telemetry and guardrail evaluation.
- Real-time device/fingerprint telemetry ingestion over WebSocket.

The current architecture is server-rendered HTML plus a shared frontend runtime script.

## 2. Runtime and Dependencies

- Runtime: Deno.
- HTTP framework: Oak.
- Data storage: SQLite adapters.
- Markdown rendering: marked.
- HTML sanitization: sanitize-html.
- Email provider: Resend API.
- Optional SMS notifications: Twilio.
- Fingerprint intelligence: devicer-suite and plugin managers.

Task entrypoint:

- deno task start

Key runtime permissions are scoped in deno.json, including explicit network domains and env-file loading.

## 3. Public Routes and Behaviors

### Core pages

- GET /
- GET /index.html
- GET /services
- GET /products
- GET /faq

### Product pages

- GET /products/:view
- Valid views are derived from static/products/*.html.
- Unknown views return 404.

### Blog

- GET /blog
- GET /blog/:slug

### Careers

- GET /careers
- GET /careers/success?job=slug
- GET /careers/:slug
- POST /careers/:slug/apply

### Contact and assets

- POST /contact
	- On success redirects to /?contact=success#contact.
	- On error redirects to /?contact=error#contact.
- GET /papers/:paper.pdf
- GET /mesh.obj
- GET /api/devicer/snippet
	- Proxies upstream Nash snippet using backend env key.

### Search/discovery

- GET /sitemap.xml
	- Includes static pages, product pages, papers, blog posts, and open jobs.

## 4. Experimentation and Analytics Routes

- POST /events/experiment
	- Ingests browser telemetry events.
- GET /experiments/guardrails?days=N
	- Returns per-variant guardrail metrics.
- GET /experiments/dashboard?days=N
	- Renders an internal dashboard.
- POST /experiments/guardrails/evaluate
	- Evaluates treatment vs control and optionally auto-disables experiments.
- GET /experiments/fingerprint-analytics
	- Returns fingerprint ingestion and clustering metrics.
- GET /experiments/debug-origin
	- Returns resolved origin/debug metadata.

Admin/guardrail routes are protected by x-experiment-admin-key or key query param when EXPERIMENT_ADMIN_KEY is configured.

## 5. WebSocket Fingerprint Pipeline

- Endpoint: GET /wss?token=...
- Preconditions:
	- Upgrade-capable request.
	- Origin policy check.
	- Session token validation.
	- Rate limit acceptance.
- Ingest flow:
	- Browser sends type=data payloads.
	- Server builds/uses TLS profile when possible.
	- Server identifies device via devicer DeviceManager.
	- Server returns fingerprint analytics payloads to client.
- Alerts emitted back to browser include blacklistAlert and botAlert under configured conditions.

Rate limiting defaults:

- Max concurrent connections per IP: 5.
- Max messages per minute per IP: 180.

## 6. Content System Specifications

### Blog content

- Source: content/blog/*.md.
- Frontmatter fields: title, slug, date, excerpt, author, tags.
- Markdown is rendered with marked and sanitized.
- Reading-time and image metadata are derived server-side.

### Careers content

- Source: content/jobs/*.md.
- Frontmatter fields include title, slug, date, excerpt, department, location, employmentType, status, optional team/remote/order/tags.
- Job pages render application forms and schema metadata.

## 7. Form Workflows

### Contact form

- Validates required fields and email syntax.
- Requires reCAPTCHA verification.
- Sends email via Resend.
- Optionally sends SMS via Twilio when env vars are present.

### Job application form

- Validates required fields and blocked emails.
- Requires reCAPTCHA verification.
- Requires PDF resume, max 5MB, with signature checks.
- Sends application data + attachment via Resend.

## 8. Frontend Runtime Specifications

Shared runtime in static/index.js handles:

- Consent management for analytics.
- Deferred loading of recaptcha and optional fingerprint collectors.
- CTA/contact telemetry emission.
- Experiment-driven layout/CTA/section reordering.
- Navbar interactions and smooth anchor navigation.
- Hero animation bootstrap with immediate light render and deferred mesh loading.

Telemetry emission is gated by local consent and experiment context.

## 9. Experimentation Model

Experiment context is injected server-side and includes:

- enabled flag
- sessionId
- assignments
- emittedAt
- assignmentsHash

Current experiment definitions:

- homepage-layout-v1
- homepage-cta-v1
- product-devicer-layout-v1
- product-hyperlocal-layout-v1
- product-nashtwin-layout-v1

All are currently configured with enabledInProduction=false in code.

Guardrail conversion currently counts:

- contact_submit events
- qualified cta_click events including buy/checkout/accent actions and whitepaper clickthrough behavior

## 10. Security and Policy Specifications

Applied response headers:

- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- Referrer-Policy: strict-origin-when-cross-origin
- Permissions-Policy: camera=(), microphone=(), geolocation=()
- HSTS on secure origins
- CSP restricting script/connect/frame origins to self + approved domains

Session policy:

- Cookie name: fp_cicis_session
- HttpOnly, SameSite=Lax, optional Secure
- 10-minute TTL with sliding refresh
- In-memory session/token store with periodic pruning

## 11. Caching and Delivery

- Non-production: Cache-Control public, max-age=0, must-revalidate.
- Production fallback defaults:
	- Static binary/text assets: 1 year immutable.
	- XML: 1 hour.
	- Other pages: 5 minutes.
- Individual routes may set explicit content type and cache policy.

## 12. Data Persistence

SQLite-backed adapter files in data/:

- fp.db for raw fingerprint snapshots.
- ip.db for IP enrichment storage.
- tls.db for TLS profile history.
- peer.db for peer graph + cache.
- bbas.db for BBAS storage.

Experiment telemetry storage:

- content/experiment-events/YYYY-MM-DD.jsonl.
- Optional experiment-control disabled list file.

## 13. Environment Variables

Core operational variables include:

- PORT
- DENO_ENV
- FP_CICIS_TRUSTED_PROXIES
- FP_CICIS_ALLOWED_ORIGINS
- FP_CICIS_PUBLIC_ORIGIN

Contact/careers:

- RESEND_API_KEY
- CONTACT_EMAIL_FROM or CAREERS_EMAIL_FROM
- CONTACT_EMAIL_TO
- CAREERS_EMAIL_TO
- RECAPTCHA_SECRET_KEY
- TWILIO_ACCOUNT_SID
- TWILIO_AUTH_TOKEN
- TWILIO_NUMBER
- NOTIFICATION_NUMBER

Devicer snippet proxy:

- DEVICER_SNIPPET_KEY (preferred)
- DEVICER_PUBLISHABLE_KEY (fallback alias)

Experimentation/guardrails:

- EXPERIMENTS_ENABLED
- EXPERIMENT_EVENTS_DIR
- EXPERIMENTS_DISABLED_IDS
- EXPERIMENTS_DISABLED_FILE
- EXPERIMENTS_AUTO_DISABLE
- EXPERIMENT_GUARDRAIL_DROP_THRESHOLD
- EXPERIMENT_GUARDRAIL_MIN_EXPOSURES
- EXPERIMENT_ADMIN_KEY

## 14. Known Current Constraints

- Session store is in-process memory and not multi-node shared.
- Guardrail summary is file-scan based and scales with event volume.
- Experiment auto-disable is threshold-based rather than significance-based.
- Fingerprint clustering is periodic and can become compute-heavy as data grows.
