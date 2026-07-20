# CTA Experiment Brief: Whitepaper and Contact Pathways

## Objective

Improve whitepaper clickthrough rate and preserve or increase contact conversion quality on `/services` and `/products`.

## Experiments

### 1) services-whitepaper-cta-v1

- Variants:
  - `control`
  - `whitepaper-first`
  - `contact-first`
- Path:
  - `/services`
- Runtime behavior:
  - `whitepaper-first` moves/labels whitepaper CTA for earlier technical proof intent.
  - `contact-first` emphasizes architecture call pathway while keeping whitepaper available.

### 2) products-whitepaper-cta-v1

- Variants:
  - `control`
  - `proof-copy`
  - `technical-copy`
- Path:
  - `/products`
- Runtime behavior:
  - Copy testing on whitepaper CTAs to evaluate messaging clarity and technical intent.

## Primary Metrics

- `whitepaperClickthroughs` per variant
- `contactSubmits` per variant
- `conversionRate` per variant

## Secondary Metrics

- `buyClickthroughs` and `contactClickthroughs`
- Session-level conversion participation

## Event Dependencies

- `cta_click` with `clickIntent`
- `experiment_exposure`
- `contact_submit`
- `form_submit_result` for contact and careers pathways

## Rollout Plan

1. Enable experiments in non-production and verify event emission.
2. Enable in production with guarded traffic and watch `/experiments/guardrails`.
3. Keep guardrail thresholds active; disable if significant conversion degradation appears.

## Exit Criteria

- Statistically and operationally meaningful increase in whitepaper clickthroughs.
- No harmful regression in contact conversion quality.
- Clear winner selected for default CTA copy/placement strategy.
