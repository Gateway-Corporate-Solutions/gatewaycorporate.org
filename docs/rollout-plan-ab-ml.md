# Strict Rollout Plan: A/B Foundation to ML-Optimized Layouts

Date: 2026-07-19

This rollout is structured into strict deployment phases with guardrails. The end goal is machine-learning-driven layout optimization based on high-quality experiment data.

## Phase 1: Safe-to-Deploy-Now (No Behavior Risk)

Status target: production deploy immediately.

### Scope
- Deploy experiment infrastructure in passive mode only.
- No layout/content changes for users.
- No traffic splitting in production by default.

### Included changes
- Server-side experiment context bootstrap with `enabled: false` unless explicitly toggled.
- Event ingestion endpoint at `/events/experiment`.
- Client telemetry hooks that no-op when experiments are disabled.
- JSONL event log sink at `content/experiment-events/YYYY-MM-DD.jsonl`.

### Guardrails
- `EXPERIMENTS_ENABLED` defaults to off in production.
- No page variant mutation in runtime yet.
- Monitor event endpoint error rate and write failures.

### Exit criteria
- Deploy with no regression in core web vitals, form submission success, or routing.
- Ingestion error rate < 0.5% over 24h.

## Phase 2: Behavior Changes to QA on Staging

Status target: staging-only, QA-driven.

### Scope
- Enable controlled assignment for 1-2 homepage experiments.
- Add deterministic variant rendering toggles for small page sections:
  - Hero composition ordering
  - CTA ordering/copy variant
- Keep assignment persistent by session id.

### QA matrix
- Browser/device matrix: desktop + mobile major browsers.
- Functional checks:
  - Contact flow
  - Careers flow
  - Navigation/menu behavior
  - Recaptcha load timing
- Event schema checks:
  - `page_view`, `cta_click`, `contact_submit`
  - assignment payload integrity

### Guardrails
- Start with 5% treatment exposure on staging traffic only.
- Auto-disable experiment if:
  - JS error rate increases > 20% baseline
  - Contact submit completion decreases > 5% baseline

### Exit criteria
- 7-day stable QA run.
- No P1/P2 bugs open.
- Data completeness > 98% required fields.

## Phase 3: Messaging/Content Experiments with A/B Measurement Hooks

Status target: progressive production rollout.

### Scope
- Launch bounded experiments with one variable family at a time:
  - Headline framing
  - Proof placement
  - CTA sequencing
- Keep all experiments mapped to explicit business metrics.

### Metrics hierarchy
- Primary:
  - Contact submit rate
  - Qualified inbound rate
- Secondary:
  - CTA click-through
  - Scroll depth bands
  - Time-to-first-CTA click
- Guardrail metrics:
  - Bounce rate
  - Form error rate
  - JS error rate

### Ramp plan
- 5% -> 15% -> 30% -> 50% treatment, with 48h checks each step.
- Rollback on guardrail breach.

### Exit criteria
- Statistically valid winner or stop decision.
- Documented learning artifact for each experiment.

## ML Prerequisites and Data Contract

### Data quality requirements
- Immutable event schema versions.
- Session id consistency.
- Timestamp in ISO 8601 UTC.
- Assignment snapshot included with each event.

### Minimum dataset for first layout model
- At least 20k sessions with reliable conversion labels.
- Balanced representation across major traffic sources and devices.
- Exclusion rules for bots/test traffic.

### Initial modeling approach
- Stage 1: uplift modeling by segment (device/source/intent proxy).
- Stage 2: contextual bandit for near-real-time layout selection.
- Stage 3: constrained policy optimization with guardrail-aware reward.

### Safety constraints for ML serving
- Hard caps on exploration traffic.
- Human-review approval for policy updates.
- Fallback to control variant on model confidence drop or missing features.

## Operational Checklist

- [ ] Set `EXPERIMENTS_ENABLED=0` in production initially.
- [ ] Set `EXPERIMENT_EVENTS_DIR` to durable storage path in non-local envs.
- [ ] Add daily ETL job from JSONL to analytics warehouse.
- [ ] Define canonical KPI dictionary and owner.
- [ ] Establish experiment review cadence (weekly).

## Guardrail Operations

- Daily summary:
  - `GET /experiments/guardrails?days=7`
- Manual/automated evaluation trigger:
  - `POST /experiments/guardrails/evaluate` with `{ "days": 7 }`
- Optional endpoint protection:
  - Set `EXPERIMENT_ADMIN_KEY` and send `x-experiment-admin-key` header.
- Auto-disable mode:
  - Set `EXPERIMENTS_AUTO_DISABLE=true`.
  - Disabled experiments are persisted to `EXPERIMENTS_DISABLED_FILE`.

## Notes

This plan deliberately separates infrastructure deployment from behavioral changes to preserve stability while building the data backbone required for ML-driven optimization.
