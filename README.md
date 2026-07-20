# Deno Minimal Webserver

This repo is for demonstrating a minimal static web server with Deno and oak.

You can run the project using `deno task start`

## Markdown blog

The site now includes a markdown-powered blog system.

- Add posts in `content/blog/*.md`
- Use YAML-style front matter with `title`, `slug`, `date`, `author`, `excerpt`, and `tags`
- If a title begins with a quote, wrap the entire YAML value in the other quote style, for example `title: '"Quoted title" and the rest'`
- Visit `/blog` for the archive and `/blog/<slug>` for individual posts
- The homepage automatically renders the latest posts into the blog section

## Careers

The site also supports a markdown-powered careers section with direct email applications.

- Add open roles in `content/jobs/*.md`
- Use YAML-style front matter with `title`, `slug`, `date`, `excerpt`, `department`, `location`, `employmentType`, and `status`
- Visit `/careers` for the index and `/careers/<slug>` for the individual role page
- Applicants submit a shared questionnaire and a PDF resume from the role page
- Successful applications are emailed to `office@gatewaycorporate.org` through the configured mail provider
- Required environment variables for application delivery: `RESEND_API_KEY`, `CAREERS_EMAIL_FROM`, and `RECAPTCHA_SECRET_KEY`
- Optional environment variable: `CAREERS_EMAIL_TO` to override the default inbox

## Contact form

The homepage contact form delivers messages through Resend to `office@gatewaycorporate.org`.

- Required environment variables: `RESEND_API_KEY`, `RECAPTCHA_SECRET_KEY`, and either `CONTACT_EMAIL_FROM` or `CAREERS_EMAIL_FROM`
- Optional environment variable: `CONTACT_EMAIL_TO` to override the default inbox
- If Twilio env vars remain configured, the contact flow will also send the existing SMS notification

## Shared footer

The site footer is rendered from `footer.ts` for both blog pages and static HTML views.

- Update footer content and per-page footer link groups in `footer.ts`
- Do not reintroduce literal `<footer class="footer">` blocks in `static/views/*.html`

## Experimentation and A/B telemetry

The site now includes a passive experimentation telemetry foundation for staged rollouts.

- Server injects experiment bootstrap context into rendered HTML.
- Client emits events to `POST /events/experiment` when experiments are enabled.
- Events are stored as JSONL files under `content/experiment-events/` by default.

Environment variables:

- `EXPERIMENTS_ENABLED` (optional): `true/1` to enable assignment + telemetry, `false/0` to disable.
- `DENO_ENV` (optional): set to `production` to keep production-safe defaults.
- `EXPERIMENT_EVENTS_DIR` (optional): override event output directory.
- `EXPERIMENTS_DISABLED_IDS` (optional): comma-separated experiment ids to force-disable.
- `EXPERIMENTS_DISABLED_FILE` (optional): JSON file path for persistent disabled experiments.
- `EXPERIMENTS_AUTO_DISABLE` (optional): `true/1` enables auto-disable writes from guardrail evaluation.
- `EXPERIMENT_GUARDRAIL_DROP_THRESHOLD` (optional): relative conversion drop threshold (default `0.2`).
- `EXPERIMENT_GUARDRAIL_MIN_EXPOSURES` (optional): minimum exposures before action (default `50`).
- `EXPERIMENT_ADMIN_KEY` (optional): protects guardrail evaluate endpoint when set.

Guardrail endpoints:

- `GET /experiments/guardrails?days=7` returns per-variant exposure and contact-submit conversion summary.
- `GET /experiments/dashboard?days=7` renders an internal HTML dashboard for quick visual inspection.
- `POST /experiments/guardrails/evaluate` evaluates treatment vs control drops and can persist disables when auto-disable is enabled.
- Provide header `x-experiment-admin-key` when `EXPERIMENT_ADMIN_KEY` is configured.
- For browser-only access, `key=<EXPERIMENT_ADMIN_KEY>` query string is also accepted.

Rollout plan:

- See `docs/rollout-plan-ab-ml.md` for strict 3-phase deployment and ML readiness criteria.
