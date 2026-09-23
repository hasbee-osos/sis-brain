### D-1 — Routing: bug on the base line, cut from base-development
- **Stage:** plan, iteration 0
- **Decided by:** orchestrator · confirmed by human 2026-09-23T06:28:06Z
- **Options considered:** cut from `base-sandbox-qa` (the `git-workflow` default for the base line); cut from `base-development`
- **Why:** Jira issue type is Bug; Customer Name is "Product Core Feature", which maps to the `base` line. The developer chose to cut the branch from `base-development` instead of `base-sandbox-qa` so the branch carries no unverified tickets; the PR still targets `base-sandbox-qa`.
- **Convention cited:** `git-workflow` → The routing decision (source branch overridden by the developer)
- **Evidence:** Jira GSIS-9911 issuetype = "Bug"; Customer Name = "Product Core Feature"
- **Status:** LOCKED

Work type: `bug` · Line: `base` · Branch: `base/bugfix/GSIS-9911-approval-matrix-missing-workflows` · Source branch: `base-development` · PR target: `base-sandbox-qa`

### D-2 — Root cause: the Approval Matrix table view has no paginator
- **Stage:** plan, iteration 1
- **Decided by:** planner
- **Options considered:** backend specification drops rows; frontend `mapDataItem` drops rows; campus-context predicate differs from the Approval Workflow page (partly ruled out, kept as finding F-2)
- **Why:** the list page requests page 0 with `pageSize` 10; the backend pages correctly and returns the total; the matrix table template never renders `paginationMetaData`, so workflows after the 10th cannot be reached on screen
- **Convention cited:** —
- **Evidence:** `sis-product-sis-frontend/src/app/modules/admin/setup/approval-setup/approval-matrix/approval-matrix-table-view/approval-matrix-table-view.component.html` (no paginator); `sis-product-sis-frontend/src/@gears-commons/models/base-filter.ts:7`; `sis-product-sis-admin-backend/…/ApprovalMatrixServiceImpl.java:65-77`; `approval wf.mp4 @ 00:00` (URL `pageSize=10`)
- **Status:** LOCKED

### D-3 — Fix approach: export `GearsPaginatorComponent` and add `<gears-paginator>` to the matrix table view
- **Stage:** plan, iteration 1
- **Decided by:** planner
- **Options considered:** inline `<mat-paginator>` (fallback only if the export is rejected); load all rows with `UNLIMITED_PAGE_SIZE`; rewrite the matrix onto `gears-data-table`
- **Why:** smallest change that reuses the common paginator and the existing `filterChange` → `onFilterChanged` reload wiring; frontend only, no contract change
- **Convention cited:** `engineering-standards` → use common components; common-module change to be flagged to the lead
- **Evidence:** `sis-product-sis-frontend/src/@gears-commons/gears-commons.module.ts` (declared l.272, not exported l.371-467); `src/@gears-commons/component/data-table/data-table.component.html:394-401`
- **Status:** LOCKED

### D-4 — Test strategy: TestBed regression spec, row-span characterization, build, manual QA paging check
- **Stage:** plan, iteration 1
- **Decided by:** planner
- **Options considered:** —
- **Why:** the regression spec (paginator rendered with length 12 for 10 of 12 rows; next page emits `pageNo 1`; none on empty data) fails before and passes after; characterization protects `mapDataItem` row spans; `ng build` proves the export compiles; manual check in QA base covers layout and URL/reload
- **Convention cited:** `engineering-standards` → risk-based testing, characterization tests
- **Evidence:** plan.md → Tests
- **Status:** LOCKED

### D-5 — Common-export verification: code-search checks, full AOT build, before/after run of GearsCommonsModule-importing specs
- **Stage:** plan, iteration 2 (full-track revision)
- **Decided by:** planner · condition set by human (export accepted only if nothing else breaks)
- **Options considered:** rely on `ng build` alone; manual smoke test only
- **Why:** `GearsCommonsModule` is imported by 263 NgModules; the export is additive, and three independent checks with recorded results prove no other host, selector, re-export or declaration changes: (a) single `gears-paginator` selector, one declaring module, hosts listed; (b) `npx ng build --build-optimizer=false`; (c) the 2 specs importing `GearsCommonsModule` plus the paginator spec run before and after with identical results; and `GearsPaginatorComponent` files have no diff
- **Convention cited:** `engineering-standards` → common components changed only with the lead's agreement
- **Evidence:** plan-2.md → Blast radius of the common export
- **Status:** LOCKED

### D-6 — Spec style: TestBed for the template regression test, prototype style for characterization
- **Stage:** plan, iteration 2
- **Decided by:** planner
- **Options considered:** repo-usual `Object.create(Component.prototype)` for everything
- **Why:** the defect is a missing template element, which only a rendered template can show; the TestBed imports `GearsCommonsModule` (no schema, no direct declaration) so it also proves the export. Characterization of `mapDataItem` / `calc*RowSpan` keeps the repo's prototype style
- **Convention cited:** deviation from the repo's usual spec style (not from `engineering-standards`)
- **Evidence:** `resit-retake-rules-list.component.spec.ts` (TestBed precedent); `review-program-sponsor.component.spec.ts` (prototype style)
- **Status:** LOCKED

### D-7 — Repos: change sis-product-sis-frontend; sis-product-sis-admin-backend is context
- **Stage:** plan, iteration 2
- **Decided by:** planner · confirmed by human 2026-09-23T07:09:37Z
- **Options considered:** also change the backend
- **Why:** the backend already pages and returns the total; the defect and fix are in the frontend template and common module only. All other repos are not in the flow
- **Convention cited:** `harness-core` → Touch only confirmed repos
- **Evidence:** `sis-product-sis-admin-backend/…/ApprovalMatrixServiceImpl.java:65-77`
- **Status:** LOCKED

### D-8 — Track: full
- **Stage:** plan, iteration 2
- **Decided by:** human (planner proposed light) · 2026-09-23T07:09:37Z
- **Options considered:** light
- **Why:** the ticket meets every light criterion on the evidence, but it changes `GearsCommonsModule`, imported by 263 modules; the human chose full for the extra care (2 evaluation rounds)
- **Convention cited:** `harness-core` → Tracks
- **Evidence:** plan-2.md header
- **Status:** LOCKED
