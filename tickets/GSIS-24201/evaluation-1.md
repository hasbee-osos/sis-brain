# Evaluation — GSIS-24201 (iteration 1, light track)

## Verdict

**PASS**

Per-repo: `sis-product-sis-frontend` — **PASS**. Cross-repo consistency — **PASS** (single-repo change, no contract touched; `sis-product-sis-admin-backend` correctly untouched per D-2).

Rationale on evidence sufficiency: the reported defect is a **client-side save-gate gap**, and its root cause (D-3) is a pure code path — `isValidToCreate()/isValidToUpdate()` never consulted the child component's row FormGroups. The evaluator independently reproduced a genuine fail-before/pass-after at exactly that gate (`2 FAILED` pre-fix / `10 of 10 SUCCESS` post-fix, real command output below), plus unit coverage of the predicate the gate now depends on, plus a clean production build. That is executed evidence that the root cause is removed, so `harness-core`'s bug standard ("is the bug fixed, with evidence and no regression") is met at the level the defect lives. The 4 un-run browser steps verify *presentation* (alert visible, no navigation, no success toast) and cross-screen non-regression, not the fix's mechanism; their absence is recorded as a required pre-merge human check and a non-blocking finding, not a confidence gap in the fix itself.

## Blocking Findings

None.

## Non-Blocking Findings

- **NB-1 — Manual verification unexecuted (4 of 5 steps).** Steps 1, 2, 3, 5 from `plan.md` need a human/QA run before merge. Step 5 (other 4 hosts unaffected) was verified statically instead (E-6).
- **NB-2 — Generic alert can fire while the offending row is off-screen.** The requisite tabs use `[hidden]`, not `*ngIf`, so a stale empty co-requisite row on the Pre-Requisites/Mutually Exclusive tab will block Save and show the generic alert with no visible red row on the active tab. UX sharp edge, not a defect — recommend checking during manual verification.
- **NB-3 — Report's environment-gap count is imprecise.** Reported "~22 pre-existing spec files"; actual measurement is **15 broken spec files / 21 TypeScript errors**. Substance correct (pre-existing, none touched by this ticket), figure inexact.
- **NB-4 — Gate regression test stubs the child.** The regression test in `add-view-edit-course.component.spec.ts` stubs `coRequisiteComponent`, proving the wiring, not the real predicate — but `course-co-requisite.component.spec.ts` (U-C1…U-C4) covers the real `isValidCoRequisite()` against real `FormGroup`s, so together they cover the root cause end-to-end at unit level.
- **NB-5 — Attachment evidence not retained.** The plan cites 14 extracted video frames, but no attachments/frames folder exists in the ticket's brain folder — brain/orchestrator housekeeping, not an implementation issue.
- **NB-6 — Pre-existing lint debt left in place (13 errors).** Verified genuinely pre-existing via baseline diff against `origin/base-development` (same 13, only line numbers shifted). Correct to leave under the smallest-change principle.
- **NB-7 — Unrelated local state in the context repo.** `sis-product-sis-admin-backend` has an unrelated modified `application.yml` (local dev credentials un-commented — must never be committed) and an untracked unrelated test file, on branch `gcet-sandbox-qa`. Confirmed unrelated to GSIS-24201; no branch for this ticket exists there.
- **NB-8 — Node version off `.nvmrc`.** Verification ran on Node v22.14.0 while `.nvmrc` pins 16. Build/lint/tests all succeeded regardless; noted so results aren't over-read as CI-equivalent.

## Required Changes

None.

## Recommended Changes

1. Have QA run manual steps 1, 2, 3 and 5 from the plan and record the result before merge (NB-1), including the off-tab case (NB-2).
2. Correct the "~22 spec files" figure to "15 spec files / 21 errors" in the ticket record (NB-3).
3. Raise separate tickets for F-1 (backend has no `@NotEmpty` on `coReqCoursesSMIds`), F-2 (`course-pre-requisite.component.ts` same ungated prune) and F-3 (Module Offering host has no gate) so they aren't lost.

## Decisions Checked

| Decision | Status | Evidence |
|---|---|---|
| D-1 (bug/Flow A/branch off base-development) | Followed | branch HEAD `22285220ab`, merge-base = `3056d98fe7` = `origin/base-development` |
| D-2 (frontend-only, light track) | Followed | diff-stat 4 files, 158(+)/48(-); no backend commit/branch for this ticket (NB-7) |
| D-3 (root cause) | Confirmed independently | pre-fix gate reads only `formGroup.valid`; rows built in child, never registered on parent form; prune explains silent drop |
| D-4 (fix approach) | Followed | new `isValidCoRequisite()` + gate wiring; prune and other hosts untouched |
| D-5 (message key) | Followed | existing key reused, present in en/ar i18n, 62 existing usages |
| D-6 (test strategy) | Followed | harness-style unit tests; fail-before/pass-after independently reproduced |

No contradiction of any LOCKED decision found. The Implementor's documented deviation (guard expression `x && !x.method()` instead of the plan's literal `!x?.method()`) is a correct, safe non-decision correction: `!undefined` evaluates `true` in JS, so the plan's literal form would wrongly block Save whenever the child isn't yet rendered. The implemented form preserves D-4's substance and is covered by a test.

## Evidence

All commands run from `E:/Projects/sis-product-sis-frontend`. Working tree verified clean and identical to `22285220ab` before and after verification.

- **E-1 Scope.** `git diff --stat origin/base-development...HEAD` → exactly 4 files, `4 files changed, 158 insertions(+), 48 deletions(-)`. Production diff is two added `if` blocks and one added method — `saveCourseCoRequisite()`, the prune, `validateSave()` and the template are byte-identical to `origin/base-development`.
- **E-2 Environment gap real and pre-existing.** Full targeted `ng test` → `Executed 0 of 0`. `npx tsc -p tsconfig.spec.json --noEmit` → 21 errors across 15 spec files, none touched by this ticket — matches `sis-brain/codebase/sis-product-sis-frontend.md` (GSIS-28778).
- **E-3 Post-fix suite reproduced.** Evaluator recreated an equivalent workaround (temp tsconfig excluding the 15 broken specs, deleted after) → `Executed 10 of 10 SUCCESS`, exit 0.
- **E-4 Fail-before independently proven.** Evaluator swapped in the pre-fix `add-view-edit-course.component.ts` from `origin/base-development`, reran → `2 FAILED, 8 SUCCESS`, exactly the two regression specs failing with `Expected true to be false`. Fixed file restored, tree re-verified clean.
- **E-5 Build and lint.** `ng build --build-optimizer=false` → exit 0, only pre-existing warnings. Lint on the 4 touched files → 13 pre-existing problems, both production files; baseline lint against `origin/base-development` versions → identical 13 problems, line numbers only shifted. Zero new lint problems. Both spec files lint clean.
- **E-6 Regression surface verified statically.** `grep -rn "isValidCoRequisite"` → only call sites are the two lines in `add-view-edit-course.component.ts`; the other 4 hosts of the shared component never reference it and are not in the diff.
- **E-7 Findings genuinely out of scope.** F-1/F-2/F-3 confirmed as separate, pre-existing, different-screen issues not required to resolve GSIS-24201's own reported behavior.
- **E-8 Conventions.** No convention breach found: existing alert/i18n patterns reused, no new dependency, no auth/deletion/schema/Liquibase surface touched.
