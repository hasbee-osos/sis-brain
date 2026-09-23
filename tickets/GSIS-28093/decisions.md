# GSIS-28093 — Decisions

### D-1 — Routing: bug on the base line, cut from base-development
- **Stage:** plan, iteration 0
- **Decided by:** orchestrator · confirmed by human 2026-09-23T10:41:20Z
- **Options considered:** cut from `base-sandbox-qa` (the default for the base line); cut from `base-development`
- **Why:** Jira issue type is Bug; Customer Name is "Product Core Feature", which maps to the `base` line. The developer chose to cut the branch from `base-development` so it carries no unverified tickets; the PR still targets `base-sandbox-qa`. The ticket's label SIS-OSOS-QA does not change routing.
- **Convention cited:** routing decision by Customer Name (source branch overridden by the developer)
- **Evidence:** Jira GSIS-28093 issuetype = "Bug"; Customer Name = "Product Core Feature"
- **Status:** LOCKED

Work type: `bug` · Line: `base` · Branch: `base/bugfix/GSIS-28093-final-invoice-duplicate-fee-category` · Source branch: `base-development` · PR target: `base-sandbox-qa`

### D-2 — Root cause: final-invoice fee category joins every interim charge's category name without de-duplication
- **Stage:** plan, iteration 1
- **Decided by:** planner
- **Options considered:** duplicate charge rows persisted; frontend concatenation; FreeMarker template joining (all ruled out)
- **Why:** the per-row fee category is computed at read time by joining the category of each charge on the linked interim invoice, so N same-category charges give the name N times. Stored data is correct: one final charge per interim invoice, and the invoice-level description is already de-duplicated. So the defect is display only and needs no data fix.
- **Convention cited:** —
- **Evidence:** `sis-product-sis-admin-backend/src/main/java/com/ubs/sis/finance/service/impl/InvoiceServiceImpl.java` ~L524-531, ~L2857-2864, ~L4566-4572; `…/SponsorInvoiceServiceImpl.java:1460-1486`; `bandicam 2026-09-08 12-08-35-002.mp4 @ 00:31` ("Tuition Fee, Tuition Fee"), `@ 01:15` (PDF)
- **Status:** LOCKED

### D-3 — Fix approach: one distinct-join helper used at all four composition sites
- **Stage:** plan, iteration 1
- **Decided by:** planner
- **Options considered:** inline `.distinct()` at each site; de-duplicate in the frontend; persist a description column
- **Why:** smallest backend-only change that fixes every surface (View, interim grid, PDF, list) consistently. It follows the existing `finance/util` static-helper pattern. It returns null when empty so existing fallbacks keep working. No contract or schema change.
- **Convention cited:** `engineering-standards` → smallest safe change; reuse existing patterns
- **Evidence:** `sis-product-sis-admin-backend/src/main/java/com/ubs/sis/finance/util/EarlySettlementAllocationUtils.java` (pattern)
- **Status:** LOCKED

### D-4 — Test strategy: helper unit regression test, backend build, manual QA check
- **Stage:** plan, iteration 1
- **Decided by:** planner
- **Options considered:** service-level tests (the constructors are too heavy; an optional Mockito test is added only if it is feasible)
- **Why:** `InvoiceFeeCategoryUtilsTest` covers duplicate, mixed, single and null cases, and the duplicate case fails before the fix. The build proves the call sites compile. The manual QA check covers View, the interim grid, the PDF and an existing invoice.
- **Convention cited:** `engineering-standards` → risk-based testing
- **Evidence:** plan.md → Tests
- **Status:** LOCKED
