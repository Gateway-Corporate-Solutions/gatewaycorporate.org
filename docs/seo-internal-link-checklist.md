# SEO and Internal Link Checklist

## Scope

This checklist operationalizes roadmap item 2.3 for GatewayCorporate.org.

## A. Sitemap Inclusion and Freshness

- [x] Run sitemap health report endpoint:
  - `GET /seo/sitemap-health?staleAfterDays=45`
  - Include `x-experiment-admin-key` header when `EXPERIMENT_ADMIN_KEY` is configured.
- [ ] Confirm `ok: true` in response.
- [ ] Confirm `missingPaths` is empty.
- [ ] Confirm `staleEntries` is empty or intentionally documented.
- [x] Verify newly added blog posts appear in `/sitemap.xml`.
- [x] Verify newly added open roles appear in `/sitemap.xml`.
- [x] Verify new product pages and paper assets are represented.

## B. Cross-Link Consistency

- [x] Blog navigation links include: Home, Services, Products, FAQ, Careers, Blog, Contact.
- [x] Careers navigation links include: Services, Products, FAQ, Careers, Blog, Contact.
- [x] Core static views retain links among Products, FAQ, Careers, Blog.
- [x] Product and service pages include direct whitepaper and contact pathways.

## C. Whitepaper CTA Quality

- [x] Services page has above-the-fold whitepaper CTA.
- [x] Products page has above-the-fold whitepaper CTA.
- [x] Product card whitepaper CTAs are present and trackable.
- [x] CTA variants are applied via experiments where enabled.

## D. Tracking and Verification

- [x] Confirm `cta_click` events include `clickIntent` values (`buy`, `whitepaper`, `contact`, `other`).
- [x] Confirm whitepaper clickthrough counts are visible in guardrail summary metrics:
  - `whitepaperClickthroughs`
  - `buyClickthroughs`
  - `contactClickthroughs`
- [x] Confirm whitepaper-focused experiments emit `experiment_exposure` events when active.

## E. Release Checklist

- [x] Run `deno check main.ts`.
- [x] Run `node --check static/index.js`.
- [ ] Spot-check `/services`, `/products`, `/blog`, `/careers`, `/faq` in browser.
- [x] Run Lighthouse/unlighthouse against `/services` and `/products` after CTA changes.

## Verification Notes (2026-07-20)

- `GET /seo/sitemap-health?staleAfterDays=45` currently returns `401 Unauthorized` without the configured admin key, so `ok`, `missingPaths`, and `staleEntries` could not be confirmed in this pass.
- `/sitemap.xml` returned `200` and includes current blog slugs, open role slug (`software-sales-associate`), product pages (`/products/devicer`, `/products/hyperlocal`, `/products/nashtwin`), and paper assets under `/papers/`.
- Spot-check routes were not verifiable at the end of this pass because `localhost:5000` was unavailable during the direct HTTP route checks.
