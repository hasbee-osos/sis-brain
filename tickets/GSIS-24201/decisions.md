### D-1 — Work type, flow and branch: bug, Flow A (base), `base/bugfix/GSIS-24201-corequisite-required-validation`
- **Stage:** plan (pre-planning), iteration 0
- **Decided by:** orchestrator (`/work`) · confirmed by human 2026-09-18T14:45:00Z
- **Options considered:** Flow A (base/common) vs Flow B (customer-specific gcet/gutech)
- **Why:** the bug is a general Module-admin co-requisite validation gap, not customer-specific behavior; `SIS-GCET-QA`/`SIS-GUTECH-QA` labels mark both customer lines as QA-relevant, not that the code is customer-specific
- **Convention cited:** `git-workflow` → Flow A (common/base ticket)
- **Evidence:** GSIS-24201 description ("Administration → Master → Module → Co-Requisite section"); no customer-specific field/module referenced
- **Status:** LOCKED

### D-2 — Repos to change and track: `sis-product-sis-frontend` only, light track
- **Stage:** plan (repo/track confirmation), iteration 1
- **Decided by:** planner · confirmed by human 2026-09-18T15:20:00Z
- **Options considered:** frontend-only fix (chosen) vs. also changing `sis-product-sis-admin-backend` to add a server-side guard on `coReqCoursesSMIds` (rejected for this ticket, recorded as Finding F-1 for a separate hardening ticket)
- **Why:** the entire defect is in `sis-product-sis-frontend`; the backend already receives no invalid payload today and needs no change to fix this bug. 1 repo changes, no cross-repo contract change, no new entity/table/workflow, nothing touching auth or existing rows — meets every light-track criterion in `harness-core` → Tracks.
- **Convention cited:** `harness-core` → Tracks (light-track criteria)
- **Evidence:** `plan.md` → Repositories, → Backend: defense in depth
- **Status:** LOCKED

### D-3 — Root cause: Module-page save gate never validates the co-requisite rows
- **Stage:** plan, iteration 1
- **Decided by:** planner
- **Options considered:** validator missing (ruled out — present and visibly working); backend accepts an invalid payload (true but unreachable, since FE prunes first — see F-1); regression from GSIS-20502 (ruled out — that commit only touched the student registration flow); multi-select writing a non-empty placeholder (ruled out — empty is `''`/`[]`, consistent with the prune)
- **Why:** `AddViewEditCourseComponent.isValidToCreate()/isValidToUpdate()` (lines 654-672) check only `this.formGroup.valid`; the co-requisite rows live in a separate `FormGroup` array inside the child `CourseCoRequisiteComponent` (`courseCoRequisiteFormGroupList`) that is never registered on the parent form, so an invalid row paints red but never fails `formGroup.valid`. `saveCourseCoRequisite()` (lines 291-294) then silently prunes any row with an empty `coReqCoursesSMIds`, which is why no bad data is ever persisted.
- **Convention cited:** n/a — code-tracing finding
- **Evidence:** `sis-product-sis-frontend/src/app/modules/admin/masters/course-master/add-view-edit-course/add-view-edit-course.component.ts:514,523,569,654-672`; `sis-product-sis-frontend/src/app/modules/admin/masters/course-master/requisite/course-co-requisite/course-co-requisite.component.ts:229-233,246-250,291-294`
- **Status:** LOCKED

### D-4 — Fix approach: add a row-validation method on the shared component, call it from the Module page's existing save gate
- **Stage:** plan, iteration 1
- **Decided by:** planner
- **Options considered:** (a) wire the child form groups into the parent `formGroup` — rejected, larger blast radius across all 5 host screens of the shared component; (b) remove the prune so the backend rejects an incomplete payload — rejected, turns a client-side gap into a server round-trip and newly exposes the ungated Module Offering screen (F-3) to backend errors; (c) switch the Module page to the `[saveButton]`/`validateSave()` drawer pattern — rejected, changes the page's save UX beyond the ticket
- **Why:** mirrors the validation already proven correct in `validateSave()` on the same component (used by Study Plan drawers), reuses the team's established `isValidToCreate()/isValidToUpdate()` override gate pattern, and keeps the change scoped to one repo with no contract change
- **Convention cited:** `engineering-standards` — reuse existing common components/patterns, smallest change that completely and safely delivers the ticket
- **Evidence:** `course-co-requisite.component.ts:303-307` (`validateSave()`); `add-view-edit-details-configuration.component.ts:231-249` (established gate-override pattern elsewhere in the codebase)
- **Status:** LOCKED

### D-5 — Validation message: reuse existing key `validation.message.notFilledRequiredField`
- **Stage:** plan, iteration 1
- **Decided by:** planner
- **Options considered:** `admin.error.nullRecords.courseCoRequisiteListNull` ("Module Co Requisite List is Empty") — rejected, misleading here since the list isn't empty, only one row is incomplete; a brand-new i18n key — rejected, would pull `sis-product-sis-admin-backend` (where en/ar translations live) into the change set for text alone
- **Why:** `validation.message.notFilledRequiredField` ("Please enter a valid value for required fields") already exists with 101 usages and accurately describes the condition
- **Convention cited:** reuse existing i18n keys before adding new ones
- **Evidence:** `sis-product-sis-frontend` i18n usage search (101 existing call sites)
- **Status:** LOCKED

### D-6 — Test strategy: Angular unit tests at the gate, regression test proves the ticket, plus manual repro
- **Stage:** plan, iteration 1
- **Decided by:** planner
- **Options considered:** full `TestBed.createComponent` — rejected, template/DI heavy for this repo's convention; backend/DB test — rejected, no backend change in scope
- **Why:** the repo's established harness-test convention (`Object.create(Component.prototype)` + `jasmine.createSpyObj`) gives a fast, direct test of the two touched methods; the regression test on `isValidToUpdate()/isValidToCreate()` fails on `origin/base-development` today (both return `true` reading only `formGroup.valid`) and must pass after the fix
- **Convention cited:** `sis-product-sis-frontend/.../review-program-sponsor.component.spec.ts` harness-test pattern
- **Evidence:** n/a — forward-looking test plan, see `plan.md` → Tests
- **Status:** LOCKED

### D-7 — Evaluator verdict: PASS (iteration 1)
- **Stage:** evaluate, iteration 1
- **Decided by:** evaluator
- **Options considered:** PASS vs INSUFFICIENT_EVIDENCE (given 4 of 5 manual browser steps unrun)
- **Why:** the reported defect is a client-side save-gate code path; the evaluator independently reproduced a fail-before/pass-after regression test at that exact gate, verified 10/10 targeted unit tests, a clean build, zero new lint issues, and confirmed by grep that no other host of the shared component is affected. This is executed evidence the root cause is removed. The unrun manual steps verify presentation/cross-screen non-regression, not the fix's mechanism — recorded as a required pre-merge human check (NB-1) and non-blocking, not a confidence gap in the fix.
- **Convention cited:** `harness-core` — bug standard: "is the bug fixed, with evidence and no regression"
- **Evidence:** `evaluation-1.md` — E-1 through E-8
- **Status:** LOCKED

### D-8 — Post-PR fix: guard `isValidCoRequisite()` against the async load race (Copilot review, PR #7338)
- **Stage:** post-PR fix, not a new implement/evaluate iteration
- **Decided by:** developer (Ashoka), applied directly in-session, not re-evaluated by the Evaluator
- **Options considered:** (a) block the parent save while co-requisite data is loading (chosen); (b) load co-requisites synchronously before the page is interactive — rejected, larger change touching page init order across 5 host screens; (c) ignore as low-probability — rejected, Copilot correctly identified a silent-data-loss path on a fast EDIT-mode save
- **Why:** on EDIT, `courseCoRequisiteFormGroupList` starts empty and is filled asynchronously by `loadData()`/its siblings; a save before that resolves reached `isValidCoRequisite()` with an empty list (vacuously valid), and `saveCourseCoRequisite()` then sent no existing rows, silently clearing them server-side. Added `isCoRequisiteDataLoading`, set before each of the 5 load paths and cleared in their `next`/`error` callbacks; the gate now blocks (reusing the existing `validation.message.notFilledRequiredField` alert per D-5, so no new i18n key/backend touch) while it is true.
- **Convention cited:** D-5 (reuse existing i18n keys before adding new ones); `harness-core` — smallest safe change
- **Evidence:** `course-co-requisite.component.ts` (isCoRequisiteDataLoading + 5 load callbacks + isValidCoRequisite guard); `course-co-requisite.component.spec.ts` U-C5/U-C6; targeted suite `Executed 12 of 12 SUCCESS` (temp `tsconfig.spec.local-verify.json` excluding the same ~14 pre-existing broken specs as iteration 1, deleted after the run); `ng build --build-optimizer=false` exit 0; `eslint` on both touched files: 1 pre-existing error (line 229, `coRequisiteFilterBasedSelectedProgramAndMms`, untouched by this change), 0 new
- **Status:** LOCKED — **not yet evaluated by the Evaluator** (light track's single evaluation round was already used in iteration 1); commit `0e6de953a4` is ahead of `evaluated_head` (`2228522`) and not yet pushed to origin
