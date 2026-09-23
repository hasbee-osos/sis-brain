# Plan: GSIS-9911, Approval Matrix Master does not show every approval workflow (bug, iteration 1)

**Summary:** The Approval Matrix Master page shows only the first page of workflows (10 by default) and has no page control. The backend already returns pages and the total count correctly. The fix is to add the missing paginator in the frontend. One repo changes, no contract change. Proposed track: light. Status: READY.

## Part 1: Understand

### Problem
- **Expected (ticket):** the Approval Matrix page shows every approval workflow configuration.
- **Actual:** the page shows only the first page of workflows, 10 by default, and has no page control. Any workflow after the 10th in the current campus context cannot be reached on screen. "Export as CSV" still returns all of them.

### Attachments
- `approval wf.mp4 @ 00:00`: QA base environment, route `#/admin/setup/approval/matrix?pageSize=10&sortDirection=DESC&…`. Page: Administration > Approval Setup > Approval Matrix, columns Module to Approver Status. Visible rows: Manage Refund Request, then Receipt Voucher with levels 1 to 3.
- `@ 00:01.6`: after scrolling, more Receipt Voucher blocks and a Credit Note block.
- `@ 00:09.5`: a block whose last level has group "sub", then a "SUB EXAM" row with Level Name "-" and Level Status "true", then two Study Plan blocks.
- `@ 00:11.4`: filter panel open with every filter set to "All"; list back at the top.
- `@ 00:15.1`, `@ 00:22.0`: Study Plan blocks. The recording stops here; the bottom of the table (where a paginator would be) is never scrolled into view.
- Across the kept frames there are 10 workflow blocks, matching `pageSize=10`. Frames between 00:01.6 and 00:09.5 may hide blocks, so the count supports the finding but does not prove it.
- The recording does not say which workflows were missing; no audio, no actual-result text.

### Repositories
| Repo | Role | Evidence |
|---|---|---|
| sis-product-sis-frontend | **change** | The matrix table template has no paginator (see root cause). |
| sis-product-sis-admin-backend | **context** | `GET /api/v1/approval-matrices` already pages and returns the total: `ApprovalMatrixServiceImpl#getList` (l.65-77) returns `ResponseMetadata(pageNo, totalPages, pageSize, totalElements)`. |
| all other repos | not involved | The flow is UI → admin-backend only. |

Flow: route `/admin/setup/approval/matrix` → `ApprovalMatrixListComponent` → `ApprovalMatrixService` (`approval-matrices`) → `ApprovalMatrixController#getList` → `ApprovalMatrixServiceImpl#getList` → `approvalWorkflowRepository.findAll(ApprovalMatrixSpecification, PageRequest)`.

### Root cause
**The Approval Matrix table view (`approval-matrix-table-view.component.html`) has no paginator. The list page requests only page 0 with `pageSize` 10 and the backend returns only that page, so any workflow after the first 10 in the campus context can never be shown on screen.**

Evidence (all at `origin/base-development`):
- `sis-product-sis-frontend/src/@gears-commons/models/base-filter.ts:7`: `pageSize? = 10`; the recording URL shows `pageSize=10`.
- `…/approval-matrix/approval-matrix-list/approval-matrix-list.component.html`: passes `[paginationMetaData]="metaData"` and `(filterChange)="onFilterChanged($event)"` to `<sis-approval-matrix-table-view>`; the paging wiring exists.
- `…/approval-matrix-table-view/approval-matrix-table-view.component.html`: no `<gears-paginator>` or `<mat-paginator>`; `paginationMetaData` is received but never rendered. `git log -S paginator` on the folder finds nothing.
- Common tables have one, e.g. `src/@gears-commons/component/data-table/data-table.component.html:394-401`. The Approval Workflow page uses `<gears-data-table>` and pages, which is why it lists workflows the matrix does not.
- `sis-product-sis-admin-backend/…/ApprovalMatrixServiceImpl.java:65-77` pages with `PageRequest.of(pageNo, pageSize, …)`.
- CSV export (`createCsvDataList`, l.129-134) uses `PageRequest.of(0, Integer.MAX_VALUE, …)`, so it contains every workflow.

### Alternatives ruled out
1. **Backend filter drops rows.** With default filters, `ApprovalMatrixSpecification` adds only the `contextAssignmentId` predicate; no level/group/user joins. Recording confirms all filters "All" (`@ 00:11.4`).
2. **Frontend mapping drops rows.** `setupData` / `mapDataItem` output at least one row per workflow, including no-level workflows (else-branch l.141-150).
3. **Campus-context difference** (only partly ruled out): the workflow page matches `structureMaster.entityAssignmentId = ctx OR entityAssignment IS NULL`; the matrix inner-joins the entity assignment and requires `id = ctx` (`ApprovalMatrixSpecification` l.78-82). A workflow whose structure master has no entity assignment appears on the workflow page but never on the matrix. The UI create path always sets `contextAssignmentId` (`add-view-edit-approval-workflow.component.ts:232`), so this should be rare. Finding F-2 and QA question Q2; not part of this fix.

### Codebase map corrections
- `generated/api.md:246` lists `matrix | ApprovalMatrixListComponent` as a frontend API service; `matrix` is the route segment from `BaseListViewPage#getContextPath()`, not an HTTP path (likely other list components too). → `build.js` gap.
- `sis-product-sis-frontend` notes, pitfall: `GearsPaginatorComponent` is declared but not exported from `src/@gears-commons/gears-commons.module.ts`.

## Part 2: Plan

### Track: light
Root cause established from code; one repo changes; no contract, entity, table, workflow or notification change; nothing touches authorization, deletion or existing rows.

### Fix approach (sis-product-sis-frontend only)
1. `src/@gears-commons/gears-commons.module.ts`: add `GearsPaginatorComponent` to `exports` (additive; the component is untouched). Mention it in the PR for the lead.
2. `…/approval-matrix-table-view/approval-matrix-table-view.component.html`: at the end, add the block the common table uses (`data-table.component.html:394-401`):
   `<gears-paginator [hidden]="!paginationEnabled" [loading]="loading" [dataSource]="dataSource" [paginationMetaData]="paginationMetaData" [filter]="filter" (filterChange)="filterChange.emit($event)"></gears-paginator>`
   All inputs exist on `BaseDataTableComponent` (`paginationEnabled` l.49-50, `paginationMetaData` l.58-59, `filterChange` l.77). The list page's `onFilterChanged` → `updateRouterParams` → reload handles page changes.
3. No TypeScript change to list or table component. No backend change.

**Rejected:** inline `<mat-paginator>` + `MatPaginatorModule` (duplicates a common component; fallback only if the export is rejected); loading all workflows (`UNLIMITED_PAGE_SIZE`; changes load behaviour, inconsistent); rewriting onto `gears-data-table` (refactor, out of scope).

### Conventions
Use common components (`gears-paginator`, page sizes `[5, 10, 25, 100]`); tell the lead about the common-module export; no commented-out code or `console.log`.

### Regression surface
- **Changed:** matrix table template (only consumer `approval-matrix-list.component.html:17`) and the `GearsCommonsModule` export list (additive; no other `gears-paginator` selector in `src/app`).
- **Preserve:** row-span grouping in `mapDataItem`; header filters reset `pageNo = 0` (`filter-component.ts:65/102/119`); sort resets `pageNo = 0`; CSV export exports everything; paginator hidden on empty data.
- **Likeliest regressions:** paginator layout inside the custom flex/table markup; page/page-size change after `pageSize=10` query param must update URL and reload.

### Tests
**Regression (fails before, passes after):** replace the stub `approval-matrix-table-view.component.spec.ts`. TestBed with `ApprovalMatrixTableViewComponent`, `GearsPaginatorComponent`, `MatPaginatorModule`, `MatSortModule`, `NoopAnimationsModule`, `TranslocoTestingModule`, a `MasterServiceWrapper` stub, `NO_ERRORS_SCHEMA`.
- (a) 10 workflows, `totalItems = 12`, `filter {pageNo: 0, pageSize: 10}` → a `mat-paginator` with length 12.
- (b) next page emits `filterChange` with `pageNo 1`, `pageSize 10`.
- (c) empty `dataSource` → no paginator.

**Characterization:** `mapDataItem` row spans for 2 levels × 2 users, and the no-level branch.

**Commands:** `npx ng test --watch=false --browsers=ChromeHeadless --include="src/app/modules/admin/setup/approval-setup/approval-matrix/**/*.spec.ts"` (if Karma reports "Executed 0 of 0", record as an environment gap, cf. GSIS-28778); `npx ng build`.

**Manual (QA base, >10 workflows in one campus):** paginator appears with total equal to the Approval Workflow page count and every workflow reachable; page sizes 25 and 100 work; a filter or sort from page 2 returns to page 1; CSV export unchanged.

### Findings (not fixed)
- **F-1:** a workflow with no levels shows Level Status "true" instead of Active/Inactive (`approval-matrix-table-view.component.ts:143`); seen at `@ 00:09.5`.
- **F-2:** campus-context difference (alternative 3).
- **F-3:** the matrix is a custom table rather than the common table component (tech debt).

## Open questions (non-blocking)
- **Q1 (QA):** for the campus in the recording, how many workflows does the Approval Workflow page list, and does "Export as CSV" on the matrix contain the workflows missing on screen?
- **Q2 (QA):** after the fix is deployed, is any workflow still on the Approval Workflow page but missing from every matrix page? If so, F-2 applies.
- **Q3 (lead):** is exporting `GearsPaginatorComponent` from `GearsCommonsModule` acceptable? If not, use the mat-paginator fallback.

READY_FOR_IMPLEMENTATION
