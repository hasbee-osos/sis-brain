**Title:** GSIS-9911: show a paginator on the Approval Matrix so every approval workflow can be reached

## Jira
[GSIS-9911](https://gearsjira.atlassian.net/browse/GSIS-9911): Some of the Approval Workflows are not displayed in the Approval Matrix Master page (Bug, Product Core Feature)

## Summary
The Approval Matrix page (Administration > Approval Setup > Approval Matrix) asks the backend for page 0 with `pageSize` 10. The backend pages correctly and returns the total, but the matrix table view never rendered a paginator. So any workflow after the 10th in the campus could not be reached on screen. "Export as CSV" still had all of them.

## Implementation (sis-product-sis-frontend)
- `src/@gears-commons/gears-commons.module.ts`: **`GearsPaginatorComponent` added to `exports`**. It was already declared there; this is a single additive line.
  - **For the lead:** this is a change to a common module. It was agreed with the lead on condition that nothing else breaks; see Verification.
- `…/approval-matrix-table-view/approval-matrix-table-view.component.html`: `<gears-paginator>` added after the table, with the same wiring as `data-table.component.html:394-401`. The existing `filterChange` → `onFilterChanged` → URL → reload flow handles page changes.
- `…/approval-matrix-table-view/approval-matrix-table-view.component.spec.ts`: the broken stub is replaced by a regression spec and characterization tests.
- No backend change and no contract change. `GearsPaginatorComponent` itself is untouched.

## Tests (executed in this repo)
- **Regression spec** (TestBed importing `GearsCommonsModule`, no schema):
  - (a) the paginator renders with the backend total;
  - (b) next page emits `pageNo 1`;
  - (c) no paginator on empty data;
  - (d) the paginator is hidden when pagination is disabled.
- **Characterization tests:** `mapDataItem` row spans (2 levels × 2 approvers, no-level workflow, group with no approvers).
- Stock `ng test` cannot run in this repo today: 15 unrelated spec files on `base-development` don't compile (GSIS-28778). The specs were run through a narrowed Karma tsconfig kept outside the repo:
  - before the fix: **3 failed** ((a), (b), (d));
  - after the fix: **7 of 7 passed**.

## Verification
- **Common export breaks nothing:**
  - **Whole-suite run, before and after the fix:** 958 of 958 specs executed each time. The failure lists differ **only** by the 3 GSIS-9911 regression cases. All other failures are existing broken stubs on `base-development`.
  - **AOT build:** `npx ng build --build-optimizer=false` succeeds; it compiles all 263 modules that import `GearsCommonsModule`. With the template change and no export, the build fails with NG8001, which proves the export is needed.
  - **Code search:**
    - there is exactly one `gears-paginator` selector;
    - the component is declared only in `GearsCommonsModule`;
    - no module re-exports `GearsCommonsModule`;
    - the `<gears-paginator>` hosts are the 6 existing common tables plus this view.
- **Lint:** `ng lint` on the changed area passes.
- **Manual check in QA base: pending.** Needs a campus with more than 10 workflows. Check that:
  1. the paginator total equals the Approval Workflow page count;
  2. every workflow can be reached, with row-span blocks intact;
  3. page sizes 25 and 100 work, and the URL and browser Back restore the page;
  4. sort or filter from page 2 returns to page 1;
  5. CSV export from page 2 still contains everything;
  6. a filter that matches nothing shows no table and no paginator;
  7. paging still works on Approval Workflow and one finance list;
  8. layout is correct in dark mode and RTL.

## Evaluator
**PASS**, round 1 of 2 (full track), on commit `1867708ac7`, with 0 blocking findings. Non-blocking:
- manual QA check pending;
- a pre-existing backend issue: filters and sorts on to-many joins without `distinct` can repeat workflows and inflate the total (to be raised as a separate backend ticket).

## Iterations
1 implementation, 1 evaluation (PASS).

## Related PRs
None. This is a frontend-only change with no deploy ordering.

## Notes
- **This branch was cut from `base-development`, not `base-sandbox-qa`.** Besides the 3 GSIS-9911 commits, this PR also carries 3 `base-development` merges that are not yet in `base-sandbox-qa`. They were not reviewed as part of this ticket:
  - #7395 GSIS-19495 (`time-picker.component.ts`)
  - #7378 GSIS-27817 (schedule-exam-interview-report files)
  - #7375 GSIS-26301 (`selected-application-list.component.ts`)
- **Next human steps:**
  - review and merge into `base-sandbox-qa`;
  - promotion to the QA environment;
  - any port onto `gcet-sandbox-qa` / `gutech-sandbox-qa`;
  - the post-QA merge into `base-development`.

  All of these follow the team's existing process.
- **Base-line reminder:** porting to gcet/gutech, promotion and the post-QA merge follow the team's existing process for PRs raised from `base-sandbox-qa`. Check that only this ticket's change reaches each line.
- **Findings not fixed:**
  - a workflow with no levels shows Level Status "true";
  - the matrix's campus-context predicate may differ from the Approval Workflow page's (QA question Q2);
  - the matrix is a custom table rather than the common table component.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
