## Jira
[GSIS-24201](https://gearsjira.atlassian.net/browse/GSIS-24201) — Empty Co-Requisite Record Can Be Saved Without Module Selection

## Summary
On Administration → Master → Module → Module Co-Requisites, a co-requisite row left with no module selected showed the red "required" highlight but did not block Save — the row was silently dropped instead of being persisted or rejected. Root cause: the page's save gate (`isValidToCreate()`/`isValidToUpdate()`) only checked the page's own form; the co-requisite rows live in a separate form array inside a child component that the gate never consulted.

## Implementation (this repo)
- `course-co-requisite.component.ts`: added `isValidCoRequisite()` — marks every incomplete row touched (so all offending rows highlight, not just the first), returns whether every row has a module selected, shows a validation alert (reusing the existing `validation.message.notFilledRequiredField` key) when not.
- `add-view-edit-course.component.ts`: `isValidToCreate()`/`isValidToUpdate()` now also gate on `isValidCoRequisite()`, guarded for the case the child isn't yet rendered.
- No template changes. No change to the existing silent-prune fallback (`saveCourseCoRequisite()`), which stays as a safety net for the Module Offering screen (uses the same shared component, has a pre-existing identical gap — tracked separately, not fixed here, see Findings).
- No backend change — `sis-product-sis-admin-backend` was read as context only; it doesn't reject an incomplete payload either, but the frontend fix means it never receives one (recorded as hardening Finding F-1 for a separate ticket).

## Tests (executed in this repo)
- New unit tests in `course-co-requisite.component.spec.ts` (5) and `add-view-edit-course.component.spec.ts` (5), following the repo's existing lightweight test convention.
- Regression test independently reproduced fail-before/pass-after: 2 tests fail against the pre-fix code (`Expected true to be false`), pass against the fix.
- `npx ng build --build-optimizer=false` — succeeds, exit 0.
- Lint: 0 new issues (13 pre-existing lint items in the two touched production files, unchanged in nature, confirmed via baseline diff against `origin/base-development`).

## Verification
- Automated: 10/10 targeted unit tests pass (via a temporary local tsconfig excluding ~15 pre-existing, unrelated broken spec files in this repo — a known environment gap, not caused by this change).
- Manual (not yet run — needs QA before merge):
  1. Add 2 co-requisite groups, leave one empty, Save → expect blocked with a validation alert, no navigation.
  2. Fill the empty group, Save → succeeds, both groups persist.
  3. Remove the empty group via Remove, Save → succeeds.
  4. Module with no co-requisites at all, Save → succeeds (covered at unit level).
  5. Spot-check Module Offering and a Study Plan co-requisite drawer still behave as before.

## Fixed after the last evaluation — reviewer to check
- **Copilot (PR review):** on EDIT, `courseCoRequisiteFormGroupList` starts empty and is populated asynchronously by `loadData()` (and its siblings for the other host screens); a Save before that resolves reached `isValidCoRequisite()` with an empty list (vacuously valid), and `saveCourseCoRequisite()` then sent no existing rows — silently clearing them server-side. Fix: added `isCoRequisiteDataLoading`, set before each of the 5 load paths and cleared in their `next`/`error` callbacks; `isValidCoRequisite()` now blocks the save (reusing the existing `notFilledRequiredField` alert, no new i18n key) while it is true. Covered by `course-co-requisite.component.spec.ts` U-C5/U-C6. This commit was **not re-run through the automated Evaluator** — light track's one evaluation round was already used in iteration 1 — so please review it directly, the same as a final-fix-round commit.

## Evaluator
**PASS** (iteration 1, 0 blocking findings). Full evaluation: `sis-brain/tickets/GSIS-24201/evaluation-1.md`. See "Fixed after the last evaluation" above for a change made after this verdict.

## Iterations
1 of 2 (light track).

## Related PRs
None — single-repo change (`sis-product-sis-frontend` only); `sis-product-sis-admin-backend` was context-only and is unchanged.

## Notes — next human steps
- **QA:** run the 5 manual verification steps above before merging.
- Per team flow: this PR targets `base-sandbox-qa` (stage 1). After it's merged and promoted to `base-qa` and checked there, a human/QA can request stage 2 (PRs to `gcet-sandbox-qa` / `gutech-sandbox-qa`).
- Final merge to `base-development` is human-only, after QA verification, done by the lead developer.
- Consider raising separate tickets for: F-1 (backend has no guard on `coReqCoursesSMIds`), F-2 (`course-pre-requisite.component.ts` has the identical gap on the Pre-Requisites tab), F-3 (Module Offering screen shares this component with no save gate).
- Heads-up: subtask GSIS-28701 (identical summary) is assigned to a different person — worth a note to avoid duplicate work.
