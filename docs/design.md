# GatewayCorporate.org Design Notes

## 1. Architectural Intent

The site is designed as a practical hybrid of:

- Server-rendered, indexable, low-complexity page delivery.
- A single shared frontend runtime for behavior, experiments, and telemetry.
- Privacy-gated, first-party measurement and risk telemetry.

This prioritizes speed of iteration and operational control over framework complexity.

## 2. Why Server-Rendered HTML + Shared Runtime

Design choice:

- Keep HTML views simple and mostly static.
- Inject runtime context server-side (session token, experiment assignments).
- Run all interaction logic from one script, static/index.js.

Nuance:

- This lowers build tooling burden and keeps pages SEO-friendly.
- It centralizes risk: regressions in one shared file can affect all pages.
- It is intentionally opinionated toward maintainability by a small team.

## 3. Context Injection Strategy

Design choice:

- Server injects only the context required for runtime behavior.

Nuance:

- Session token injection enables immediate WebSocket connectivity without a separate auth round trip.
- Experiment bootstrap is injected as script for deterministic assignment continuity.
- Secret material is deliberately not injected:
	- Devicer snippet key is now backend-only and proxied through /api/devicer/snippet.

Tradeoff:

- Inline bootstrap scripts require CSP allowance for unsafe-inline.
- Security posture is still strong, but nonce/hash CSP hardening is constrained by this pattern.

## 4. Consent-First Analytics as a Core Principle

Design choice:

- Analytics and risk telemetry are consent-gated in the browser.

Nuance:

- Consent controls both experiment telemetry emission and fingerprint/risk socket initialization.
- This ensures event quality aligns with user intent and policy.
- It also means some observational blind spots are expected by design.

## 5. Experimentation Model and Guardrails

Design choice:

- Deterministic variant assignment based on hashed session seed.
- Passive event capture to JSONL.
- Guardrail comparison against control with auto-disable support.

Nuance:

- Deterministic assignment avoids per-request random drift and supports reproducibility.
- File-based JSONL logging is operationally lightweight and transparent.
- Current disable logic is pragmatic (relative drop + min exposure), not statistical significance.

Tradeoff:

- Simplicity and low ops cost vs. rigor at high scale.

## 6. Real-Time Fingerprint Ingestion Design

Design choice:

- WebSocket ingestion for telemetry snapshots and feedback loop responses.

Nuance:

- The server can emit enriched fingerprint responses and alerts in near real time.
- Rate limiting and tokenized session checks are core safeguards.
- TLS-profile complexity fallback behavior avoids hard failures when enrichment data is insufficient.

Tradeoff:

- Stateful channels provide richer behavior than REST polling.
- They increase scaling and observability requirements as traffic grows.

## 7. Data Layer Separation by Capability

Design choice:

- Separate SQLite adapters/databases for device, IP, TLS, peer, and BBAS domains.

Nuance:

- Each plugin can evolve independently and degrade independently.
- This maps directly to devicer-suite responsibilities.
- Operational troubleshooting is clearer per subsystem.

Tradeoff:

- Cross-domain analysis requires additional joins/aggregation layers outside single-table workflows.

## 8. Content Model: Markdown as Source of Truth

Design choice:

- Blog and jobs are file-driven markdown content with frontmatter parsing.

Nuance:

- Editorial updates are version-controlled and deployment-native.
- Rendering includes sanitization and derived metadata.
- It favors transparent publishing pipelines over CMS complexity.

Tradeoff:

- Filesystem scanning and parse work can become expensive without caching/indexing at larger content volumes.

## 9. Form Pipeline Design

Design choice:

- Server-side validation and provider integrations (Resend, reCAPTCHA, optional Twilio).

Nuance:

- Contact and careers forms share a strict anti-abuse posture:
	- Required captcha verification.
	- Input normalization/sanitization.
	- File-type and size checks for resumes.
- Redirect-based status feedback allows no-JS-safe completion behavior.

Tradeoff:

- Strong trust boundaries and compatibility vs. richer inline asynchronous UX.

## 10. Performance Design Choices

Design choice:

- Shared runtime deferred in page heads.
- Hero animation starts with immediate lightweight rendering and defers heavier mesh/model loading to idle.
- Contact dependencies (reCAPTCHA) load on proximity or intent.

Nuance:

- This preserves visual identity while reducing critical-path main-thread work.
- It avoids delayed hero startup regressions from coarse fixed timeouts.

Tradeoff:

- Runtime complexity increases due to staged initialization paths.

## 11. Security Posture and Operational Boundaries

Design choice:

- Centralized response hardening through middleware.
- Origin-aware secure cookie behavior.
- Admin route authorization by key.

Nuance:

- Local development is intentionally permissive where practical.
- Production defaults are stricter via secure origin detection and cache strategy.

Tradeoff:

- In-memory session storage is simple and fast for a single instance.
- Horizontal scaling needs shared session/token state to preserve guarantees.

## 12. Current Design Debt and Pressure Points

- Shared frontend runtime has broad responsibility surface.
- Experiment event storage and aggregation are append-and-scan.
- Guardrail logic is threshold-based, not significance-aware.
- Session store and analytics refresh model assume moderate scale.

These are deliberate early-to-mid stage design choices, not accidental defects. They optimize for shipping speed and code ownership clarity, and should be evolved as traffic and team size increase.
