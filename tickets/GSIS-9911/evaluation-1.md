# Evaluation: GSIS-9911, iteration 1 of 2 (full track)

**Evaluated HEAD:** `sis-product-sis-frontend` @ `1867708ac7`, branch `base/bugfix/GSIS-9911-approval-matrix-missing-workflows`, merge-base `cafd775d42` (`origin/base-development`). Working tree clean.

## Verdict: **PASS**

| Repo / check | Result |
|---|---|
| sis-product-sis-frontend (change) | PASS |
| sis-product-sis-admin-backend (context) | n/a — untouched per D-7 |
| Cross-repo consistency | PASS — no contract change; UI uses existing `pageNo`/`pageSize` and `metadata.totalItems` (`ApprovalMatrixServiceImpl#getList` l.65-77) |

**The D-5 question.** The implementor's evidence alone was not enough: no test had executed, so it would have been INSUFFICIENT_EVIDENCE. The evaluator closed the gap without touching the repo. GSIS-28778 is not a Karma limitation: Karma type-checks every spec and 15 specs don't compile, so pointing Karma at a narrowed tsconfig and entry file (kept in the session scratchpad) makes it run.
- **New spec, before/after:** pre-fix copy (HEAD with the two production files reset to `origin/base-development`): (a), (b), (d) **fail** ("expected exactly one GearsPaginatorComponent host", "expected a MatPaginator to be rendered"); (c) and the 3 characterization tests pass. At HEAD: **7 of 7 pass**.
- **"Nothing else breaks" (D-5):** every compiling spec (all but the 15 non-compiling ones and `letter-template-add-edit-view`, whose leaking timer aborts the run), fixed order, in both trees: **958 of 958 executed each time**. Before: 783 failed / 175 passed; after: 780 failed / 178 passed. The failure lists differ **only** by the three GSIS-9911 regression cases. D-5c specs identical before/after (`resit-retake-rules-list` "should create" fails in both; `send-offer-letter-confirm-dialog` 1 failure in both; `GearsPaginatorComponent` "should create" passes in both). All those failures are broken stubs already on `origin/base-development`.
- **AOT build (D-5b):** rerun at HEAD — success, hash `9e453fc5f0c31961` (same as the implementor's). Template-only build fails with NG8001, so the export is required.

The only proof still missing is the manual paging check in QA base: a QA step, not a blocker.

## Blocking findings
None.

## Non-blocking findings
- **E-1 (process):** implementation-report-1 called Karma impossible; true only of the stock config. The evaluator runs supersede the "not executed" status of (a)–(d) and D-5c. `tsc -p tsconfig.spec.json` finds **15** non-compiling spec files, not 22. Record the workaround in the codebase map.
- **E-2:** manual QA-base check (plan-2 Tests item 4) not run — layout, dark mode, RTL, URL/Back, sort/filter from page 2, CSV from page 2, smoke on two other common-table screens. The PR must list it as pending.
- **E-3 (pre-existing, extends F-4):** `ApprovalMatrixServiceImpl#createPageRequest` sorts `approverName`, `approverActiveStatus`, `groupTitle`, `levelNo` on to-many paths, so workflows can repeat and pages shift when sorted by those columns. Paging makes it visible. Put it in the separate backend ticket with F-4.
- **E-4 (F-2 accuracy):** `ApprovalWorkflowSpecification` shows no `OR IS NULL` predicate; its `campusAssignmentId` branch is an INNER join like the matrix. The workflow page's context filter must be applied in the base service (not reviewed). Q2 to QA remains the right check.
- **E-5 (spec style):** characterization case 3 sets `approvalUsers = []` redundantly after `buildLevel(3, 1, 0)`. Otherwise the spec checks behaviour through the rendered DOM and `MatPaginator` state, uses the real compile scope, and pins F-1 without fixing it.

## Required changes
None.

## Recommended changes
- PR lists the D-5 evidence (whole-suite before/after, AOT build), the lead's Q3 acceptance, and manual QA item 4 as pending.
- Add the narrowed-tsconfig Karma workaround and the 15-file list to the frontend codebase notes; update GSIS-28778.
- Raise a backend ticket for F-4 and E-3.

## Decisions checked
- D-1 followed (branch from `cafd775d42`). D-2 confirmed (`@ 00:00` `pageSize=10`; regression fails before, passes after). D-3 followed exactly (one export line; 8-line block identical to `data-table.component.html:394-401`; `gears-paginator/*` no diff; `approval-matrix.module.ts` unchanged). D-4 followed (tests executed by evaluator; manual pending, E-2). D-5 satisfied (one selector; declared only in `gears-commons.module.ts` l.97/272/467; hosts = 6 common tables + matrix view; no re-export; AOT passes; whole-suite identical except the 3 target tests). D-6 followed. D-7 followed. D-8: round 1 of 2. Nothing contradicted or superseded.
- Conventions: common `gears-paginator` used; lead agreed (Q3); no commented-out code or `console.log`; `git diff --check` clean; lint passes; no TS, backend, date, auth or schema change.

## Evidence (commands run by the evaluator; scratch files in the session scratchpad, nothing written to the repo)
- `git diff origin/base-development...HEAD`: 3 files (module +2/-1, html +8, spec).
- `npx ng test --watch=false --browsers=ChromeHeadless --ts-config=<scratch>/tsconfig.eval-spec.json --include=<table-view spec>` at HEAD: **Executed 7 of 7 SUCCESS**; on the pre-fix copy: **3 FAILED, 4 SUCCESS** ((a), (b), (d)).
- Whole suite `ng test --karma-config=<scratch>/karma.eval.js --main=<scratch>/run-{after,before}/test-eval.ts --ts-config=…/tsconfig.all.json`: after `Executed 958 of 958 (780 FAILED)`; before `Executed 958 of 958 (783 FAILED)`; diff = the 3 GSIS-9911 cases.
- `npx tsc -p tsconfig.spec.json --noEmit`: 15 spec files fail to compile.
- `npx ng build --build-optimizer=false` at HEAD: success, hash `9e453fc5f0c31961`, 151 s.
- `npx ng lint …`: "All files pass linting."
