# Plan

Ticket: GSIS-24201
Work type: bug
Track: **light** — the root cause is established with evidence (below); **1 repo changes** (`sis-product-sis-frontend`); no cross-repo contract change (no DTO, endpoint, or error-code change); no new entity, table, workflow, approval flow or notification; nothing touching authentication, `@PreAuthorizeGrant`, deletion checks, or existing rows (no bad data was ever persisted — see Root Cause). All light criteria in `harness-core` → Tracks are met.

# Part 1 — Understanding

## Problem

On Administration → Master → Module → open a module → Edit → **Module Co-Requisites** tab, a user can add several co-requisite groups. A group left with no module selected shows the red "required" highlight, but **Save is not blocked** — the module saves successfully and the incomplete group is silently discarded.

## Expected / Observed

- **Expected:** clicking Save with any co-requisite group that has no module selected is blocked, with a validation message.
- **Observed:** Save succeeds, "Module saved successfully" toast fires, the page navigates back to the Module list, and the incomplete group is gone when the module is reopened. No message, no indication the user's row was thrown away.

## Attachments

| Attachment | Read | What it shows |
|---|---|---|
| `bandicam 2026-05-28 14-15-11-940.mp4` (51.1s) | frames (14 JPEGs, all read in order) | `f01 @ 00:00` Module list page, URL host indicates QA environment, tenant "Oman Tourism College" (OTC). `f04 @ 00:06` View Module "Introduction to Sustainability", edit target `.../course/view/53`. `f05 @ 00:08` Edit mode, header shows Active toggle / Cancel / **Save**. `f06 @ 00:15` requisite section with tabs **Module Pre-Requisites \| Module Co-Requisites \| Mutually Exclusive**, Add/Remove buttons, module dropdown, "OR" separator between groups. `f09 @ 00:30` two co-requisite groups, both filled. `f10 @ 00:36` **the repro state — group 1 empty with the red required left-border, group 2 holds a selected module**. `f11 @ 00:42` after clicking Save: back on the Module list with the green **"Module saved successfully"** toast — no validation error. `f13-f14 @ 00:46-00:50` module reopened in View: Co-Requisites section now shows a single group with two module chips — the empty group is gone. |

Notes:
- The recording matches the ticket's written steps; no contradiction.
- Frames are scene-change based, no audio — a message shown under ~1s between `f10` (00:36) and `f11` (00:42) could have been missed. Doesn't change the conclusion: save clearly succeeded and navigated away.
- The ticket says the empty record "remains in the grid and is saved successfully". `f14` shows it is **not** persisted — it is silently dropped (confirmed in code). The user-visible defect is the unblocked save + silent data loss, not corrupt data in the table. **No data fix / backfill needed.**

## Repositories

| Repo | Role | Why (evidence) |
|---|---|---|
| `sis-product-sis-frontend` | **change** | Defect is entirely here: `.../requisite/course-co-requisite/course-co-requisite.component.ts` holds the per-row `Validators.required`; `.../add-view-edit-course/add-view-edit-course.component.ts` owns the Save gate and never consults those rows. |
| `sis-product-sis-admin-backend` | **context** | Serves `POST/PUT /api/v1/course` → `CourseMasterServiceImpl.saveCoursePreAndCoRequisite` → `CourseCoRequisiteServiceImpl.createList`. Read to answer the defense-in-depth question; no change proposed. |

Flow: `add-view-edit-course.component.html:97` renders `<sis-course-co-requisite #coRequisiteComponent>` → `add-view-edit-course.component.ts:335` `req.courseCoRequisite = this.coRequisiteComponent.saveCourseCoRequisite()` → `POST/PUT /api/v1/course` → `CourseMasterServiceImpl.java:312-330` → `CourseCoRequisiteServiceImpl.createList()` → `sis_course_co_requisite`.

All frontend files cited are byte-identical to `origin/base-development` except `add-view-edit-course.component.ts` (read via `git show origin/base-development:...`; line numbers below are the origin ones).

## Root Cause (bug)

**The Module page's save gate validates only the page's own `formGroup`, and the co-requisite rows live in a separate array of `FormGroup`s inside the child component (`courseCoRequisiteFormGroupList`) that nothing checks — so the row's `Validators.required` paints the field red but never blocks Save, and the row is then silently dropped from the payload.**

Evidence:

1. **The gate never sees the rows.** `AddViewEditCourseComponent.submitButtonCLicked()` (line 514) → `saveCourseWithMutuallyExclusivePartners()`/`updateCourseWithMutuallyExclusivePartners()` (523, 569), each gated only by `isValidToCreate()`/`isValidToUpdate()` (654-672), whose entire check is `this.formGroup.markAllAsTouched(); isValid = this.formGroup.valid;` plus a course-code check. `courseCoRequisiteFormGroupList` is built inside the **child** component (`course-co-requisite.component.ts:229-233, 246-250`) and never registered on the parent `formGroup`.
2. **The payload is then silently pruned.** `course-co-requisite.component.ts:291-294`, inside `saveCourseCoRequisite()`:
   ```ts
   // skip, if there is no course selected
   if (req.coReqCoursesSMIds?.length > 0) {
       this.courseCoRequisiteReq.push(req);
   }
   ```
   This is why the empty group is gone rather than persisted blank, and why no invalid data exists in the DB table.

The correct behaviour already exists in the **same component** on a different host: `validateSave()` (303-307), used by Study Plan / Student Study Plan drawers via `[saveButton]`. The Module page doesn't set `saveButton` (default `false`), so it gets none of that validation.

**Alternatives ruled out:**
- Backend accepts an invalid payload — true, but it never receives one (FE prunes first). Kept as hardening finding F-1.
- Required validator missing — present and working (red highlight visible at `f10`).
- Regression from GSIS-20502 — no; that ticket's commit only touched the student course-registration/pre-registration flow, never the admin Module-master editor.
- Multi-select writes a non-empty value — a new row seeds `''`, a cleared row yields `[]`; both fail `?.length > 0`, consistent with the observed prune.

**GSIS-28701 (duplicate subtask):** no branch or commit evidence of overlapping work in either repo (`git branch -a --list '*24201*' '*28701*'` empty). Safe to proceed; worth a Jira note to the other assignee before implementation.

**Adjacent branch to watch:** `origin/base/bugfix/gsis-26575-course-co-requisite-auto-select-issue-base-sand-qa` touches the same component and is not yet merged into `base-development` — a possible merge-conflict surface later, not a blocker now.

## Backend: defense in depth

The API does **not** reject an incomplete co-requisite record — `CourseCoRequisiteRequestDto.coReqCoursesSMIds` has no `@NotEmpty`/`@NotNull` (sibling fields do use `@NotBlank`/`@NotNull`), and `CourseCoRequisiteServiceImpl.createList()` saves every DTO with no emptiness check. **Recommendation: do not change the backend in this ticket** — the frontend prune stays, so no caller can send an empty row before or after the fix, and a server-side rejection is a behaviour tightening on an endpoint used by other flows, out of scope for a bug. Recorded as **Finding F-1** for a separate hardening ticket.

## Open Questions

None blocking. Two items noted at confirmation:
1. Message wording — D-5 below picks the existing key `validation.message.notFilledRequiredField`.
2. Sibling defects, deliberately out of scope:
   - **F-2:** Module **Pre-Requisites** tab on the same page has the identical gap (`course-pre-requisite.component.ts` prunes the same way, ungated).
   - **F-3:** **Module Offering** screen calls the same `saveCourseCoRequisite()` with no gate — same defect, different screen.

# Part 2 — Plan

## Decisions

- **Following:** D-1 (work type: bug, flow A, branch `base/bugfix/GSIS-24201-corequisite-required-validation` off `base-development`).
- **New:** D-3 (root cause, above), D-4 (fix approach — see Change), D-5 (message key `validation.message.notFilledRequiredField`), D-6 (test strategy — see Tests).
- **Superseding:** none.

## Conventions That Apply

- Reuse existing common components and the existing per-screen validation pattern; no new common component, no behavior change to the shared component for its other hosts.
- `isValidToCreate()`/`isValidToUpdate()` override pattern is the team's established gate (e.g. `add-view-edit-details-configuration.component.ts:231-249`); extend the existing overrides, don't add a new gate.
- Alerts via injected `GearsAlertService.showErrorAlert(translate('<key>'))`, as already used in `course-co-requisite.component.ts:306, 362`.
- No commented-out code, no `console.log`. The existing `// skip, if there is no course selected` comment stays.

## Change

### sis-product-sis-frontend

Files:
- `.../requisite/course-co-requisite/course-co-requisite.component.ts`
- `.../add-view-edit-course/add-view-edit-course.component.ts`
- `.../requisite/course-co-requisite/course-co-requisite.component.spec.ts` (generated stub today)
- `.../add-view-edit-course/add-view-edit-course.component.spec.ts` (generated stub today)

Steps:
1. In `CourseCoRequisiteComponent`, add one public method that marks every row touched (so the red highlight shows on **all** offending rows), returns whether all rows have at least one module selected, and calls `showErrorAlert(translate('validation.message.notFilledRequiredField'))` when not. Emptiness predicate: `!(formGroup.get('coReqCoursesSMIds').value?.length > 0)` — matches the existing prune, treats `''`, `[]`, `null`, `undefined` as empty.
2. In `AddViewEditCourseComponent.isValidToCreate()`/`isValidToUpdate()` (654-672), after the existing checks, call the new method via `@ViewChild('coRequisiteComponent')` with an optional-chained guard (`this.coRequisiteComponent?.…`), and AND it into `isValid`. Keep the current "evaluate then return" shape so the page's own required fields still get marked touched.
3. **Do not** remove the prune at `course-co-requisite.component.ts:291-294` — it is the safety net for the Module Offering screen (F-3), which shares this component and gains no gate in this ticket.
4. No change to the template, to `validateSave()`, or to any other host of the shared component.

## Cross-Repo Contracts

None — single repo, no endpoint/DTO/validation/error-code change, no deploy ordering.

## Regression Surface

- **Direct:** Save/Update gate on Administration → Master → Module (add, edit, clone); one new method on the shared `CourseCoRequisiteComponent`.
- **Preserve:** `saveCourseCoRequisite()`'s payload shape and prune; `validateSave()` and the `[saveButton]` drawer path (Study Plan / Student Study Plan); duplicate-co-requisite check; Pre-Requisites, Mutually Exclusive, Advanced Pre-Requisite tabs; the module's own required-field validation.
- **Dependent (5 hosts of the shared component):** only `AddViewEditCourseComponent` gains the gate; the other four (Module Offering, Study Plan course list, student study-plan, graduation-plan) must behave exactly as before.
- **Likeliest regressions:** predicate written as `=== 0` instead of `!(… > 0)`; a stale empty row on a `[hidden]` (not `*ngIf`) tab blocking Save without a visible alert; double alerts if the implementor also raises one on the main form.
- **High-risk path:** editing an existing module that already has co-requisite groups — saving with no change must remain possible.

## Tests

### sis-product-sis-frontend

Follow the repo's harness-test convention (`Object.create(Component.prototype)` + `jasmine.createSpyObj`, not full `TestBed`), per `review-program-sponsor.component.spec.ts`.

- `course-co-requisite.component.spec.ts`: U-C1 (mixed empty/filled → false + one alert), U-C2 (all filled → true, no alert), U-C3 (no co-requisite rows at all → true), U-C4 (`[]` and `null` both treated as incomplete).
- `add-view-edit-course.component.spec.ts` — **the regression test**: with a valid page `formGroup` and a stubbed `coRequisiteComponent` reporting an incomplete row, `isValidToUpdate()`/`isValidToCreate()` must return `false`. **Fails on `origin/base-development`** (both currently return `true`, reading only `formGroup.valid`) and passes after the fix. Mirror case: all rows complete → still `true`.

Command: `npx ng test --watch=false --browsers=ChromeHeadless --include='**/course-co-requisite.component.spec.ts' --include='**/add-view-edit-course.component.spec.ts'` (Karma+Jasmine, Angular 13.0.1; scoped because most of the repo's 755 specs are generated stubs). Also `npx ng build` and `npx ng lint` on touched files.

**Manual verification** (record result — ticket's own repro):
1. Module → Edit → Module Co-Requisites → add 2 groups, fill one, leave one empty → Save → **blocked**, alert shown, row still on screen, no navigation, no success toast.
2. Fill the empty group → Save → succeeds, both groups persist; reopen in View to confirm.
3. Remove the empty group via **Remove** → Save → succeeds.
4. Save a module with no co-requisites at all → succeeds.
5. Spot-check Module Offering co-requisites and a Study Plan co-requisite drawer still behave as before.

### Cross-repo

Not needed.

## Risk

**Low** — two small additions in one repo, no contract/schema/data/authorization change, mirrors an existing in-component check, other 4 hosts of the shared component untouched.

## Status

READY_FOR_IMPLEMENTATION
