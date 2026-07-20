# SEO and Internal Link Checklist

## Scope

This checklist operationalizes roadmap item 2.3 for GatewayCorporate.org.

## A. Sitemap Inclusion and Freshness

- [ ] Run sitemap health report endpoint:
  - `GET /seo/sitemap-health?staleAfterDays=45`
  - Include `x-experiment-admin-key` header when `EXPERIMENT_ADMIN_KEY` is configured.
- [ ] Confirm `ok: true` in response.
- [ ] Confirm `missingPaths` is empty.
- [ ] Confirm `staleEntries` is empty or intentionally documented.
- [ ] Verify newly added blog posts appear in `/sitemap.xml`.
- [ ] Verify newly added open roles appear in `/sitemap.xml`.
- [ ] Verify new product pages and paper assets are represented.

## B. Cross-Link Consistency

- [ ] Blog navigation links include: Home, Services, Products, FAQ, Careers, Blog, Contact.
- [ ] Careers navigation links include: Services, Products, FAQ, Careers, Blog, Contact.
- [ ] Core static views retain links among Products, FAQ, Careers, Blog.
- [ ] Product and service pages include direct whitepaper and contact pathways.

## C. Whitepaper CTA Quality

- [ ] Services page has above-the-fold whitepaper CTA.
- [ ] Products page has above-the-fold whitepaper CTA.
- [ ] Product card whitepaper CTAs are present and trackable.
- [ ] CTA variants are applied via experiments where enabled.

## D. Tracking and Verification

- [ ] Confirm `cta_click` events include `clickIntent` values (`buy`, `whitepaper`, `contact`, `other`).
- [ ] Confirm whitepaper clickthrough counts are visible in guardrail summary metrics:
  - `whitepaperClickthroughs`
  - `buyClickthroughs`
  - `contactClickthroughs`
- [ ] Confirm whitepaper-focused experiments emit `experiment_exposure` events when active.

## E. Release Checklist

- [ ] Run `deno check main.ts`.
- [ ] Run `node --check static/index.js`.
- [ ] Spot-check `/services`, `/products`, `/blog`, `/careers`, `/faq` in browser.
- [ ] Run Lighthouse/unlighthouse against `/services` and `/products` after CTA changes.
