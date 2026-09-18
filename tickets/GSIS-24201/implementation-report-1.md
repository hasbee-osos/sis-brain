# Implementation Report — GSIS-24201 (iteration 1, light track)

## sis-product-sis-frontend

### Changes

1. `src/app/modules/admin/masters/course-master/requisite/course-co-requisite/course-co-requisite.component.ts`
   Added `isValidCoRequisite(): boolean` (per D-4). Iterates `courseCoRequisiteFormGroupList`, marks every row's controls touched (so all offending rows show the red highlight, not just the first), treats a row invalid when `!(coReqCoursesSMIds?.length > 0)` — same predicate as the existing prune at lines 291-294, so `''`, `[]`, `null`, `undefined` are all incomplete. Calls `showErrorAlert(translate('validation.message.notFilledRequiredField'))` once (D-5) if any row is invalid. Zero rows → returns `true`. Prune and `validateSave()` untouched (D-4 step 3/4).

2. `src/app/modules/admin/masters/course-master/add-view-edit-course/add-view-edit-course.component.ts`
   In `isValidToCreate()` and `isValidToUpdate()` (lines 654-680), after the existing checks:
   ```ts
   if (this.coRequisiteComponent && !this.coRequisiteComponent.isValidCoRequisite()) {
       isValid = false;
   }
   ```
   Keeps the "evaluate then return" shape so the page's own fields still get marked touched.

3. `.../course-co-requisite/course-co-requisite.component.spec.ts` — extended from generated stub.
4. `.../add-view-edit-course/add-view-edit-course.component.spec.ts` — extended from generated stub.

### Deviation from plan (implementation detail, not a scope/approach change — no new decision record)

The plan's literal guard form `!this.coRequisiteComponent?.isValidCoRequisite()` is buggy: when `coRequisiteComponent` is `undefined` (early lifecycle), the expression evaluates `!undefined` = `true`, wrongly forcing `isValid = false` before the child renders. Implemented as `this.coRequisiteComponent && !this.coRequisiteComponent.isValidCoRequisite()` instead — same "guard, don't gate when absent" intent, without the bug. Covered by a test asserting the gate stays `true` when `coRequisiteComponent` is `undefined`.

### Tests

Repo's harness convention (`Object.create(Component.prototype)` + `jasmine.createSpyObj`, real `FormGroup`/`FormControl`), matching `review-program-sponsor.component.spec.ts`.

- `course-co-requisite.component.spec.ts` (5 tests): mixed empty/filled → false + one alert; every offending row touched; all filled → true, no alert; zero rows → true; `[]` and `null` both incomplete.
- `add-view-edit-course.component.spec.ts` (5 tests, **the regression proof**): `isValidToUpdate()`/`isValidToCreate()` → `false` when co-requisite invalid (valid page form); mirror → `true` when complete; guard → `true` (no throw) when `coRequisiteComponent` is `undefined`.

### Verification evidence

**Regression proof (fails before, passes after — D-6):** ran the two new regression tests against the pre-fix `add-view-edit-course.component.ts` (`origin/base-development` version) → `2 FAILED, 3 SUCCESS`, both failures `Expected true to be false`, exactly as predicted. Restored the fixed file (diff-verified against intended fix) and reran.

**Post-fix targeted suite:** the repo's karma bundling (`src/test.ts` `require.context`) compiles every spec file, and ~22 pre-existing, unrelated spec files across the repo fail to compile (documented environment gap, tracked under GSIS-28778) — a full `ng test` on the target files reports `Executed 0 of 0` because of this, not because of the change under test. Confirmed all 22 compile errors are pre-existing and outside the 4 touched files. To get real pass/fail evidence, used a **temporary, uncommitted** `tsconfig.spec.local-verify.json` (extends `tsconfig.spec.json`, excludes those 22 files), ran the targeted suite, then deleted the temp file (`git status` confirms only the 4 intended files are modified). Result: **`Executed 10 of 10 SUCCESS`**.

**Build:** `npx ng build --build-optimizer=false` — succeeded, exit 0 (only pre-existing CommonJS warnings).

**Lint:** initial run flagged 15 problems; 13 are pre-existing lint debt in the two production files (member-ordering, type-annotation-spacing, a missing semicolon), confirmed unchanged in nature via a stash-based diff (only line numbers shifted). Fixed the 2 new errors introduced by the spec file itself (`prefer-arrow-functions`). Re-lint of the two spec files: all pass. The 13 pre-existing errors were left as-is (unrelated to this ticket).

### Diff summary

`git diff --stat`: 4 files changed, 158 insertions(+), 48 deletions(-) (deletions mostly the two generated stub bodies). `add-view-edit-course.component.ts` +6 lines; `course-co-requisite.component.ts` +15 lines; two spec files rewritten from stubs. No other files touched. `sis-product-sis-admin-backend` not modified.

### Manual verification — status (needs human/QA; not run in a browser this iteration)

1. Add 2 groups, leave one empty, Save → expect blocked + alert. **Needs human.**
2. Fill the empty group, Save → succeeds, both persist. **Needs human.**
3. Remove the empty group, Save → succeeds. **Needs human.**
4. Module with no co-requisites at all, Save → succeeds. **Covered by test U-C3 (code-level); live check still recommended.**
5. Module Offering / Study Plan co-requisite drawers unaffected. **Needs human.** By inspection: `isValidCoRequisite()` is only called from `AddViewEditCourseComponent`; the other 4 hosts' code paths are byte-for-byte unchanged — inference, not observed evidence.

### Findings (not fixed, out of scope per plan)

- F-1: backend accepts an incomplete `coReqCoursesSMIds` with no validation — unreachable today (FE prune stays). Separate hardening ticket.
- F-2: `course-pre-requisite.component.ts` has the identical ungated-prune gap on the Pre-Requisites tab.
- F-3: Module Offering screen shares the component with no gate at all — same defect, different screen.
- New, minor: the 13 pre-existing lint errors above — left as-is per smallest-change principle; candidate for a separate lint-debt cleanup.

### Status

**READY FOR EVALUATION.** Matches D-3–D-6 with one corrected guard expression (documented above; not a scope/approach change). Regression test verified fail-before/pass-after. Build succeeds. Targeted tests 10/10 pass via a documented, temporary workaround for a known pre-existing environment gap. Diff scoped to the 4 planned files. Ticket did not outgrow the light track.

Commit: `22285220ab` on `base/bugfix/GSIS-24201-corequisite-required-validation` in `sis-product-sis-frontend`. Not pushed.
