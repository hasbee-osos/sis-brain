# Plan: GSIS-9911, Approval Matrix Master does not show every approval workflow (revision 2, full track)

Ticket: GSIS-9911 · Work type: bug · Track: full (moved from light by the human; on the evidence it would qualify for light, but it changes a common module, `GearsCommonsModule`, imported by 263 NgModules, which this plan covers at full depth).

**Summary:** D-1 to D-4 all hold; nothing superseded. Two production edits in sis-product-sis-frontend: one added export in `GearsCommonsModule`, one `<gears-paginator>` block in the matrix table template. New in this revision: a checked blast radius of the common export; a regression spec that uses the matrix module's real compile scope (imports `GearsCommonsModule`, so it also proves the export); new finding F-4.

# Part 1: Understanding

## Problem
Approval Matrix Master (Administration > Approval Setup > Approval Matrix) shows only the first page of workflows (default 10) and has no page control. Any workflow after the 10th in the campus context cannot be reached on screen.
- **Expected:** every approval workflow configuration of the campus can be seen on the matrix page.
- **Observed:** only page 0 with `pageSize=10` is fetched and shown; no paginator. "Export as CSV" still contains every workflow.

## Attachments
| Attachment | Read | What it shows |
|---|---|---|
| `approval wf.mp4` | frames (revision 1) | `@ 00:00` QA base, route `#/admin/setup/approval/matrix?pageSize=10&sortDirection=DESC&…`. `@ 00:01.6` more Receipt Voucher blocks and Credit Note. `@ 00:09.5` group "sub" block, "SUB EXAM" row with Level Name "-" and Level Status "true" (F-1), then Study Plan. `@ 00:11.4` filter panel, every filter "All". `@ 00:15.1`, `@ 00:22.0` Study Plan; recording ends without the bottom of the table in view. |

About 10 workflow blocks are visible, matching `pageSize=10` (frames between 00:01.6 and 00:09.5 may hide blocks, so this supports but does not prove). No audio, no actual-result text, missing workflows not named.

## Repositories
| Repo | Role | Why (evidence) |
|---|---|---|
| sis-product-sis-frontend | **change** | `approval-matrix-table-view.component.html` renders no paginator. `GearsPaginatorComponent` declared in `src/@gears-commons/gears-commons.module.ts:272`, not in `exports` (l.371-467). |
| sis-product-sis-admin-backend | **context** | `ApprovalMatrixServiceImpl#getList` (l.65-77) pages and returns `ResponseMetadata(pageNo, totalPages, pageSize, totalElements)`. CSV (`createCsvDataList` l.129-134) uses `PageRequest.of(0, Integer.MAX_VALUE, …)`. |

Flow: lazy route `/admin/setup/approval/matrix` (`approval-setup-routing.module.ts:23` → `ApprovalMatrixModule`) → `ApprovalMatrixListComponent` → `ApprovalMatrixService.getList` → `GET approval-matrices` → `ApprovalMatrixController#getList` → `ApprovalMatrixServiceImpl#getList` → `approvalWorkflowRepository.findAll(ApprovalMatrixSpecification, PageRequest)`.

## Root cause (per D-2, holds)
**The Approval Matrix table view renders no paginator. The list page requests only page 0 with `pageSize` 10 and the backend returns only that page, so any workflow after the first 10 in the campus context can never be shown on screen.**

Evidence (`origin/base-development`; frontend `cafd775d42`, admin-backend `4f47372e38`):
- `src/@gears-commons/models/base-filter.ts:7`: `pageSize? = 10`; recording URL shows `pageSize=10`.
- `approval-matrix-list.component.html:17-33` passes `[paginationMetaData]`, `[(filter)]`, `[loading]`, `(filterChange)="onFilterChanged($event)"`.
- `approval-matrix-table-view.component.html` (80 lines) has no paginator; `paginationMetaData` (`base-data-table.ts:58-59`) is never rendered.
- `BaseListViewPage#onFilterChanged` (`base-list-view-page.ts:385-396`) → `updateRouterParams` → `readAndSetParams` (l.114-122) → `loadData()`; `onDataLoaded` (l.522-526) stores `response.metadata`.

Alternatives ruled out: (1) backend filter drops rows (only the context predicate with default filters; `@ 00:11.4` all "All"); (2) `mapDataItem` drops rows (no-level branch l.141-150 emits a row); (3) campus-context predicate difference (partly ruled out; F-2, Q2).

## Open questions
- **Q1 (QA, non-blocking):** for the campus in the recording, how many workflows does the Approval Workflow page list, and does the matrix CSV contain the ones missing on screen?
- **Q2 (QA, non-blocking):** after deployment, is any workflow on the Approval Workflow page still missing from every matrix page? If so, F-2 applies.
- **Q3 (lead): answered** — export accepted on condition nothing else breaks; addressed in Blast radius and Tests.

# Part 2: Plan

## Decisions
- **Following:** D-1, D-2, D-3, D-4 (refined, not contradicted: the TestBed imports `GearsCommonsModule` as `ApprovalMatrixModule` does, instead of declaring `GearsPaginatorComponent` with `NO_ERRORS_SCHEMA`, which could not prove the export and would fail with a double declaration).
- **New:**
  - **D-5 — common-export verification:** (a) code-search checks (single `gears-paginator` selector; only one module declares the component; list of `<gears-paginator>` hosts); (b) full AOT `ng build`; (c) the specs that import `GearsCommonsModule` run before and after with identical results; plus `GearsPaginatorComponent` `.ts/.html/.scss/.spec.ts` have no diff.
  - **D-6 — spec style:** the regression test uses TestBed because the defect is a missing template element; characterization tests of `mapDataItem` / `calc*RowSpan` use the repo's `Object.create(Component.prototype)` style.
- **Superseding:** none.

## Conventions
- Common components (`references/frontend.md` l.9): use `gears-paginator`, not a custom `mat-paginator`; common-component change discussed with the lead (Q3), stated in the PR.
- Page sizes from the common paginator (`[5, 10, 25, 100]`); default 10 applies.
- Placement copies the common tables: sibling after the table root, `[hidden]="!paginationEnabled"` (`data-table.component.html:394-401`, `data-table-headers-lable.component.html:196-198`).
- No commented-out code, no `console.log`, no reformatting of the module file. No TypeScript change to list/table components; no backend change.

## Change — sis-product-sis-frontend
Files: `src/@gears-commons/gears-commons.module.ts` (exports only); `…/approval-matrix-table-view/approval-matrix-table-view.component.html`; `…/approval-matrix-table-view/approval-matrix-table-view.component.spec.ts` (replaces the broken stub, which provides no `MasterServiceWrapper`).

1. Branch from `origin/base-development` (D-1); the local checkout is on `main` and differs under `src`.
2. `gears-commons.module.ts`: add `GearsPaginatorComponent` to `exports` after `StatusIndicatorComponent` (l.466, add comma). Already imported (l.97) and declared (l.272). No other change (no reordering, no dedup of existing duplicates such as `RichTextInputComponent`, `PaymentTypeComponent`).
3. Table-view template, after the closing `</div>` of the root `*ngIf` block (l.80), exactly as `data-table.component.html:394-401`:
   ```html
   <gears-paginator
       [hidden]="!paginationEnabled"
       [loading]="loading"
       [dataSource]="dataSource"
       [paginationMetaData]="paginationMetaData"
       [filter]="filter"
       (filterChange)="filterChange.emit($event)"
   ></gears-paginator>
   ```
   Bindings exist on `BaseDataTableComponent` (`paginationEnabled` l.49-50 default true, `filter` l.22-23, `paginationMetaData` l.58-59, `filterChange` l.76-77, `loading` l.79-80, `dataSource` l.19-20). Outside the root `*ngIf`; the paginator hides itself on no data (`gears-paginator.component.html:1`).
4. Leave `src/@gears-commons/component/table/gears-paginator/*` untouched.
5. Replace the table-view spec (Tests).

End to end: `GearsPaginatorComponent#onPageChange` mutates `filter.pageNo/pageSize` on the shared filter object (the list's `this.filter` via `[(filter)]`) and emits `filterChange`; the table re-emits; the list's `onFilterChanged` reads `this.filter`, writes the URL and reloads — same as `DataTableComponent` elsewhere.

**Compile scope:** `approval-matrix.module.ts` imports `GearsCommonsModule` (l.6, l.26). The paginator's own template compiles in `GearsCommonsModule`'s scope, which imports `CommonModule` (l.328) and `MatPaginatorModule` (l.341); `ApprovalMatrixModule` needs no change.

## Blast radius of the common export
All `git grep` against `origin/base-development` in sis-product-sis-frontend.

| Check | Result | Evidence |
|---|---|---|
| Importers of `GearsCommonsModule` | 263 NgModules (all `*.module.ts`) | admin 52, student 38, examination 33, finance 32, admission 25, timetable 22, hostel-management 15, faculty 9, attendance 9, advisoryAndCounselling 9, appointment 7, integration 5, notifications 2, dashboard 2, plus `shared.module.ts:73`, `@fuse/…/navigation.module.ts:46`, `layout/common/user/user.module.ts` |
| Re-exports | **None** — no module has `GearsCommonsModule` in `exports` | scripted scan: 0 hits; three modules import it twice (harmless) |
| Selector collision | **None** — one selector contains "paginator" | `gears-paginator.component.ts:6` only; `src` is the only source root |
| Double declaration | **None** | `GearsPaginatorComponent` only in `gears-commons.module.ts` (l.97, l.272) and its own spec |
| `<gears-paginator>` hosts today | 6, all in `@gears-commons` (data-table l.394, data-table-headers-lable l.196, data-table-multilevel-headers l.308, data-table-multiple-row-editable l.155, data-table-expandable-collapsable l.293, assignment-data-table l.65); **none under `src/app`** | `git grep gears-paginator` |
| Schema-tolerated hosts becoming live | **None** — `CUSTOM_ELEMENTS_SCHEMA`/`NO_ERRORS_SCHEMA` modules (`mat-quill-module.ts:17`, `manage-attendance.module.ts:88`, `teachingload-request-routing.module.ts:33`, `timetable-admin-routing.module.ts:47`) have no `<gears-paginator>` | same grep |
| `mat-paginator` in `src/app` | 1 place, different selector, unaffected | `integration/monitory-body/…common-dialog…html:35` |
| Providers / DI | none added | diff scope |
| Bundle | no new code (already compiled for `DataTableComponent`) | l.272, 6 hosts |
| Specs importing `GearsCommonsModule` | 2 (`send-offer-letter-confirm-dialog`, `resit-retake-rules-list`), hosts don't use `gears-paginator`; run before/after | `git grep -l GearsCommonsModule -- '*.spec.ts'` |
| The component itself | unchanged | `git diff --quiet` check |

Conclusion: the export only adds the component to direct importers' compile scope; with no existing `src/app` host, competing selector, re-export or schema-tolerated host, only this ticket's template changes behaviour.

## Cross-repo contracts
None change. The UI uses existing `GET approval-matrices` params (`pageNo`, `pageSize`, `sortBy`, `sortDirection`, filters) and `metadata.totalItems` (shared `ResponseMetadata`, as every paged `gears-data-table` page). No deploy ordering.

## Regression surface
- **Direct:** the export list (one entry); `approval-matrix-table-view.component.html` (only consumer `approval-matrix-list.component.html:17`, lazy `ApprovalMatrixModule`); the spec.
- **Indirect:** 263 importers — compile scope only, nothing changes; the six common tables unchanged.
- **Matrix page flows:**
  - URL params: page/size written by `updateRouterParams`; reload, deep link, Back restore; string params coerced by `mat-paginator`; `onFilterChanged` drops `contextAssignmentId` and appends `,id` to `sortBy` (l.387-393) — must keep working.
  - Sort: `sortHeaderClicked` resets `pageNo = 0` (`base-data-table.ts:481`); sort kept across pages.
  - Filters: header filter resets `pageNo = 0` (`filter-component.ts:65,102,119`). Paging is per workflow (`Page<ApprovalWorkflow>`), so row-span blocks never split across pages. See F-4.
  - CSV: `onExportClicked` sends `this.filter` (now may include page); backend CSV ignores it, so export still has everything. `EXPORT` permission check unchanged (`approval-matrix-list.component.ts:257`).
  - Empty state: table and paginator both hidden. Existing behaviour kept (not fixed): deep link beyond last page shows no paginator.
  - Row-span layout: `mapDataItem`, `calcMainRowSpan`, `calcLevelRowSpan` untouched; paginator below, left-aligned; sticky header unaffected.
  - Loading: paginator's local `loading` blocks double clicks; list's `loading` resets in `onDataLoaded` (l.524).
  - RTL / secondary language: labels from `MatPaginatorIntl`.
- **Likely regressions:** paginator layout in the custom markup (width, dark mode); page-size change not reloading (if the filter reference were lost — not expected); total differing from the Approval Workflow page (F-2, F-4).
- **High-risk paths:** the common-module edit (D-5); paging with active sort and filters; CSV after paging.

## Tests — sis-product-sis-frontend
Setup: run `npm ci` in `sis-product-sis-frontend` first (not installed); a registry failure is an environment gap.

**1. Regression spec (fails before, passes after)** — `approval-matrix-table-view.component.spec.ts`, TestBed:
- declarations: a test host component (template binding `dataSource`, `headers`, `filter`, `paginationMetaData`, `loading`, `paginationEnabled`, `approvalModules`, `campuses`, `programs`, `segments`, `(filterChange)="onFilter($event)"`) and `ApprovalMatrixTableViewComponent`;
- imports: `GearsCommonsModule`, `MatSortModule`, `MatCheckboxModule`, `NoopAnimationsModule`, `TranslocoTestingModule.forRoot({langs: {en: {}}})` (precedent `resit-retake-rules-list.component.spec.ts`);
- providers: `{provide: MasterServiceWrapper, useValue: {}}`;
- **no `NO_ERRORS_SCHEMA`; do not declare `GearsPaginatorComponent`.** 9 `FormHeader`s shaped like `ApprovalMatrixListComponent#createHeader`; non-null programs/segments/modules.

Cases:
- (a) 10 workflows, `totalItems = 12`, `filter {pageNo: 0, pageSize: 10}` → one `GearsPaginatorComponent`, one `MatPaginator` with `length 12`, `pageSize 10`, `pageIndex 0`. Fails before.
- (b) `matPaginator.nextPage()` → host `onFilter` called with `pageNo 1`, `pageSize 10`, and host `filter.pageNo === 1`. Fails before.
- (c) `dataSource = []` → no `MatPaginator`, no `table`. Passes before and after.
- (d) `paginationEnabled = false` → `gears-paginator` host has `hidden`.

Fallback: if `GearsCommonsModule` cannot boot in Karma (QuillModule / CalendarModule `forRoot`), record the error, declare `GearsPaginatorComponent` + `ActiveStatusChipComponent` and import `MatPaginatorModule`, still no schema; the export is then proven by the AOT build (NG8001 on a missing export).

**2. Characterization (same file, prototype style, D-6):**
- `pins current row spans for a workflow with 2 levels x 2 approvers`: `calcMainRowSpan 4`, `calcLevelRowSpan 2`, `mapDataItem` 4 rows; row 0 carries `module`/`program` rowSpan 4, `levelName` rowSpan 2; row 2 starts level 2.
- `pins current output for a workflow with no levels`: 1 row, rowSpans 1, `levelActiveStatus.value === true` (F-1 documented, not fixed).
- `pins current output for a level whose group has no approvers`: `approverName '-'`, rowSpan equals level rowSpan.

**3. Commands** (from the repo folder):
- `npx ng test --watch=false --browsers=ChromeHeadless --include="src/app/modules/admin/setup/approval-setup/approval-matrix/approval-matrix-table-view/**/*.spec.ts"` — before the production edits (a, b fail) and after (all pass). "Executed 0 of 0" or unrelated spec compile failures (GSIS-28778) → environment gap. Do not include the broken `approval-matrix-list.component.spec.ts` stub.
- D-5c, before and after, identical results: `npx ng test --watch=false --browsers=ChromeHeadless --include="src/app/modules/examination/masters/resit-retake-rules/resit-retake-rules-list/*.spec.ts" --include="src/app/modules/admission/manage/application/add-view-edit-application/send-offer-letter-confirm-dialog/*.spec.ts" --include="src/@gears-commons/component/table/gears-paginator/*.spec.ts"`
- D-5b: `npx ng build --build-optimizer=false` (AOT, all 263 importers, ~4-5 min).
- D-5a on the ticket branch:
  - `git -C D:/projects/sis_new_repo/brain/sis-product-sis-frontend grep -n -E "selector:\s*['\"][^'\"]*gears-paginator" HEAD -- src` → exactly 1
  - `git -C … grep -n "GearsPaginatorComponent" HEAD -- "src/**/*.module.ts"` → only `gears-commons.module.ts`, 3 lines
  - `git -C … grep -n "<gears-paginator" HEAD -- src` → the 6 hosts plus the matrix table view
  - `git -C … diff --quiet origin/base-development -- src/@gears-commons/component/table/gears-paginator` → exit 0
  - `git -C … diff --stat origin/base-development` → exactly 3 files
- Lint: `npx ng lint --lint-file-patterns="src/app/modules/admin/setup/approval-setup/approval-matrix/**/*.ts" --lint-file-patterns="src/@gears-commons/gears-commons.module.ts"`

**4. Manual (QA base, admin, >10 workflows in one campus):** paginator total equals Approval Workflow page count; every workflow reachable, row-span blocks intact; page sizes 25/100 reload and URL shows `pageNo`/`pageSize`, Back works; sort or filter from page 2 returns to page 1; CSV from page 2 has every workflow; no-match filter shows neither table nor paginator; smoke-test paging on two other common-table screens (Approval Workflow and a finance list); dark mode and RTL layout.

## Rollout
Frontend only, no backend/DB deploy, no flag. The PR states the `GearsCommonsModule` export, the lead's Q3 acceptance and the D-5 evidence. Revert = revert the single frontend commit.

## Findings (not fixed)
- **F-1:** no-level workflow shows Level Status "true" (`approval-matrix-table-view.component.ts:143`; `@ 00:09.5`).
- **F-2:** matrix context predicate inner-joins `structureMaster.entityAssignment` (`ApprovalMatrixSpecification.java:78-82`), unlike the workflow page's `OR IS NULL`.
- **F-3:** matrix is a custom table, not `gears-data-table` (tech debt).
- **F-4:** `levelId`, `levelNo`, `groupId`, `approverId`, `levelStatus`, `approverStatus` filters add INNER joins with no `query.distinct(true)` (`ApprovalMatrixSpecification.java:43-75`); a workflow can repeat and `totalElements` be inflated when filtered. Pre-existing; the paginator makes the total visible. Recommend a separate backend ticket.

## Risk
Low: two production lines in one repo; the export is additive and shown to change no other host, selector, re-export or declaration; proven by the AOT build, the module-scope spec and before/after runs.

## Codebase map corrections
- Frontend notes, "`GearsPaginatorComponent` not exported" pitfall: becomes stale once GSIS-9911 merges (update then).
- Frontend notes, spec style: template/DOM defects need a TestBed spec importing the feature module's real dependencies (precedent `resit-retake-rules-list.component.spec.ts`).
- `generated/api.md:246`: `matrix | ApprovalMatrixListComponent` is the route segment from `getContextPath()` (`approval-matrix-list.component.ts:312-314`), not an HTTP path — `build.js` gap.

## Status
READY_FOR_IMPLEMENTATION
