# Security dependency audit — 2026-11-13

## Baseline findings
GitHub Actions `pnpm audit --prod --audit-level high` on the original
dependency graph found 13 issues total, including **1 critical and 6 high**:

| Package | Previous | Required fixed version | Source |
|---|---|---|---|
| DOMPurify (transitive via posthog-js) | 3.4.15 | >= 3.4.17 | GHSA-cg2g-xh64-v4q7; GHSA-mrv2-3pqr-j5jr |
| PostCSS (transitive via Next.js) | 8.4.31 | >= 8.5.18 | GHSA-6g55-p6wh-862q; GHSA-r28c-9q8g-f849 |
| source-map-js (transitive) | 1.2.1 | >= 1.2.2 | GHSA-68fv-2mgg-jv7q |
| Sharp | 0.35.4 | >= 0.35.5 | GHSA-wq5f-xc86-pv6w |
| Zod | 3.25.76 | >= 4.6.6 | GHSA-mrhx-c7xc-m3w5 |

## Remediation
- Upgrade direct dependencies Sharp and Zod to patched versions.
- Use pnpm overrides for the three vulnerable transitive packages.
- Regenerate and commit the exact lockfile; CI uses frozen-lockfile.
- Zod is a major version migration: run static type checking, contract tests,
  REST handlers and mock E2E. Do not suppress errors or waive the audit.
- Run CodeQL javascript-typescript security-extended analysis on PR and master.

## Gate

**Do not merge/enable the public product until security audit, CodeQL, CI,
typecheck, unit tests and Vercel Preview build pass.**

These supply-chain tests do not establish security of Supabase RLS, Stripe
webhook deliveries, photo retention and real-user workloads. That requires
live provider integrations plus the checklist in `docs/RELEASE-OPERATIONS.md`.
