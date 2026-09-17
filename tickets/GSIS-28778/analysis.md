# Analysis

Ticket: GSIS-28778
Work type: bug (D-1; revisit recommended, see Root Cause)

## Problem

Pre-Requisite, Co-Requisite and Mutually Exclusive rules saved on a module at Module Master do not show up at Dept/Module Offering, Programme Study Plan or Student Study Plan. Pre-registration and registration validation is said to fail silently or wrongly as a result.

## Expected

Per the ticket, citing GSIS-20628: rules saved at Module Master flow down automatically to Offering, then Programme Study Plan, then Student Study Plan. Each level shows them as defaults that can be overridden per rule type. The master rule stays in force where no override exists. Validation reads the student's final plan.

## Observed

Per the ticket: none of the three lower levels shows the conditions. What the recording shows is below.

## Attachments

| Attachment | Read | What it shows |
|---|---|---|
| C0_REQ_Consition_violation.mp4 (44 s) | 10 frames | **@ 00:00:** Super Admin on OSOS staging, Administration > Master > Pathway Specialization Master (list only). **@ 00:04:** Master > Module, search "intr"; two modules listed (UFME49-15-0, UFCE4A-15-0). **@ 00:08:** View of module UFCE4A-15-0; tabs "Module Pre-Requisites / Module Co-Requisites / Mutually Exclusive" visible, contents not shown, no rule saved on screen. **@ 00:16:** Student Management > Student Eligibility Forecast (BSC_2026). One student in "Conflict" with remarks such as "GCET-15-0 : Skipped [Co-requisite UFCFTN-30-0 violated]", "UFCFTN-30-0 [GCET-15-0, UFCE4A-15-0, UFME49-15-0] co-requisite violated", "UFME49-15-0 [UFCE4A-15-0] co-requisite violated", plus credit conflicts. **@ 00:20–00:22:** Student list. **@ 00:31:** Student Portal > Academics > Study Plan view for that student (BSC in Data Science, Open standard, 8 semesters). **@ 00:34–00:44:** "Preview Study Plan" PDF; Pre-Requisites and Co-Requisites columns show "-" for every module, including UFCFTN-30-0, UFCE4A-15-0, UFME49-15-0 and GCET-15-0 in Semester 1. |

Mismatches with the written steps:
- No rule is saved on screen, and the Dept/Module Offering and Programme Study Plan screens (steps 2 and 3) are not shown.
- The Eligibility Forecast evaluates co-requisite rules for these modules while the student plan PDF shows none — inconsistent with "validation has no effective rules".
- The forecast screen is not on `origin/base-development`; it exists on `origin/base-qa` and `origin/base-sandbox-qa`. Environment is OSOS staging.

## Repositories

| Repo | Role | Why (evidence) |
|---|---|---|
| sis-product-sis-admin-backend | change | Master save services write only master tables; copy-at-creation logic, per-level requisite/exclusive tables, validation services and study plan PDF are here. |
| sis-product-sis-frontend | context (possibly change) | `course-co-requisite.component.ts` `onLoadDataComponent` loads only the viewed level's table (`course_offering`, `study_plan`, `student_study_plan`). Override UI would go here if in scope. |
| business-config, notification-handler, attachment-handler, keycloak, scheduler, workflow-engine | context – not involved | A code search for requisite / mutually-exclusive terms on `origin/base-development` returns nothing. |

Flow:
- **Master:** Module view tabs → `/api/v1/course-co-requisite` (and pre-requisite / exclusive endpoints) → `Course*ServiceImpl` → master tables.
- **Offering:** `CourseOfferingCourseServiceImpl.postCreateEntity` → `seedRequisitesFromCourseMaster`.
- **Programme study plan course:** `StudyPlanCourseServiceImpl.postCreateEntity` → `seedRequisitesFromCourseOfferingCourse`.
- **Student study plan course:** created by `StudentCustomizedStudyPlanServiceImpl`, `CTStudyPlanServiceImpl`, `StudentTransitionServiceImpl`, `ProgramChangeAcceptanceServiceImpl` → `StudentStudyPlanCourseRequisiteSeedHelper.seedFromAdminStudyPlanCourse`.
- **Validation** (`StudentCourse{Pre,Co}RequisiteValidationServiceImpl`, `StudentCourseMutuallyExclusiveValidationServiceImpl`) reads only student-level tables.

## Root Cause (bug)

**Hypothesis H1 (likely, not yet confirmed):** rules are copied down only when a lower-level record is created, each level copying from the level directly above. Saving a rule at Module Master updates nothing below it, so an offering, programme study plan course or student study plan course that already existed when the rule was saved never gets it — nor does one created later from a parent that lacks it.

**Falsifiable test:** save a co-requisite on module X at Module Master; then create a new Dept/Module Offering for X, add it to a new programme study plan, enrol a new student. H1 predicts the rule appears at all three new levels while previously created records stay empty.

**Evidence:**
- Master saves write only master rows: `CourseCoRequisiteServiceImpl.createList` (line 64), `CoursePreRequisiteServiceImpl.createList` (65), `CourseMutuallyExclusiveServiceImpl.replaceMutuallyExclusiveCourses` (66).
- The only copy code runs at creation: `CourseOfferingCourseServiceImpl.postCreateEntity` (175) → `seedRequisitesFromCourseMaster` (588); `StudyPlanCourseServiceImpl.postCreateEntity` (229) → `seedRequisitesFromCourseOfferingCourse` (752); `StudentStudyPlanCourseRequisiteSeedHelper.seedFromAdminStudyPlanCourse` (66), called only on student-plan course creation.
- `postUpdateEntity` at offering and study-plan level does not copy again.
- Each level has its own tables (`CourseOfferingCourseCoRequisite`, `StudyPlanCourseCoRequisite`, `StudentStudyPlanCourseCoRequisite`, and the pre-requisite / mutually-exclusive equivalents). None has an inherited/overridden marker, so "default vs override" cannot be represented today.

**Also noted (not the main cause):**
- The student seed helper catches every exception and logs at INFO (`StudentStudyPlanCourseRequisiteSeedHelper.java:76-77`); a failed copy is silent.
- When adding an offering, the frontend loads master co-requisite rows (with master row IDs) and always sends `courseOfferingCourseCoRequisite` (`add-view-edit-course-offering-course.component.ts` `generateReq`). `CourseOfferingCourseCoRequisiteServiceImpl.createList` then deletes the rows just copied and saves the posted ones carrying master IDs — risk of deleted/duplicated rows or reused IDs.
- The study plan PDF gets co-requisite codes via `StudentCustomizedStudyPlanServiceImpl.extractCourseCodeListOfCourseOfferingCourse` (415), which filters by `contextAssignmentId`; it can print "-" even when student-level rows exist, which could explain the recording's PDF by itself.

**Ruled out / not supported:**
- *Propagation never built:* rejected — copy code exists on `base-development` since June 2026 (GSIS-20628).
- *Validation reads the master level:* rejected — validators read student-level tables.
- *Copy logic differs on `base-qa`:* rejected — seed helper and master services identical; offering/study-plan diffs unrelated.

**Unresolved against the recording (H2):** the forecast evaluates co-requisites for this student while the PDF shows "-". Student-level rows may exist and the visible symptom could be the PDF lookup. The forecast remark text was not traced on any base branch.

**Size:** fixing only copy-at-creation defects is small. Pushing later master changes down while preserving lower-level overrides needs an override marker in the per-level tables plus UI — materially larger.

## Affected

- admin-backend: `administration/service/impl/{CourseCoRequisite,CoursePreRequisite,CourseMutuallyExclusive,CourseOfferingCourse,StudyPlanCourse}ServiceImpl`; `student/service/helper/StudentStudyPlanCourseRequisiteSeedHelper`; `student/service/impl/{StudentCustomizedStudyPlan,StudentStudyPlanCourse}ServiceImpl`; `student/service/impl/StudentCourse{Pre,Co}RequisiteValidationServiceImpl`, `StudentCourseMutuallyExclusiveValidationServiceImpl`; `templates/customized-student-study-plan.ftl`
- frontend: `course-master/requisite/*`, `course-offering-master/add-view-edit-course-offering-course`, `study-plan-master/add-view-edit-study-plan-course-list`, `student-study-plan/study-plan-course`

## Regression Surface

- Edits already made at offering, study-plan or student level must not be overwritten by a master push; today they are effectively overrides.
- Pre-registration and registration validation (`/co-requisite-validation` on `CoursePreRegisterOfferController` / `CourseRegisterOfferController`), eligible-module list, Eligibility Forecast (on `base-qa`).
- Legacy requisite lists (`*PreRequisitesOne/Two`, `*CoRequisites`), still saved on update.
- Delete cascades in `CourseOfferingCourseServiceImpl.postDelete`.
- Study plan and student plan PDFs.
- Student-plan creation paths: enrolment, transition, programme change, CT study plan (and GCET-specific APL approval).

## Evidence

As of `origin/base-development` (admin-backend `f0230d6ceb`, frontend `e7dc118980`):
- `sis-product-sis-admin-backend/src/main/java/com/ubs/sis/administration/service/impl/CourseOfferingCourseServiceImpl.java:175-186, 207-214, 580-676`
- `sis-product-sis-admin-backend/src/main/java/com/ubs/sis/administration/service/impl/StudyPlanCourseServiceImpl.java:229-252, 752-850`
- `sis-product-sis-admin-backend/src/main/java/com/ubs/sis/administration/service/impl/CourseCoRequisiteServiceImpl.java:64`; `CoursePreRequisiteServiceImpl.java:65`; `CourseMutuallyExclusiveServiceImpl.java:66`
- `sis-product-sis-admin-backend/src/main/java/com/ubs/sis/administration/service/impl/CourseOfferingCourseCoRequisiteServiceImpl.java:63-91`
- `sis-product-sis-admin-backend/src/main/java/com/ubs/sis/student/service/helper/StudentStudyPlanCourseRequisiteSeedHelper.java:66-78`
- `sis-product-sis-admin-backend/src/main/java/com/ubs/sis/student/service/impl/StudentCustomizedStudyPlanServiceImpl.java:363-383, 415-429, 460-469`
- `sis-product-sis-admin-backend/src/main/java/com/ubs/sis/student/service/impl/StudentStudyPlanCourseServiceImpl.java:208-233`
- `sis-product-sis-frontend/src/app/modules/admin/masters/course-master/requisite/course-co-requisite/course-co-requisite.component.ts` (`onLoadDataComponent`, `saveCourseCoRequisite`)
- `sis-product-sis-frontend/src/app/modules/admin/masters/course-offering-master/add-view-edit-course-offering-course/add-view-edit-course-offering-course.component.{ts,html}` (`generateReq`, html line 83)
- History: admin-backend commits `2abffe1579`, `c0188498e4`, `d3461c885d`; merge `e807a6a3f4` (GSIS-20628)
- `origin/base-qa` contains everything on `base-development` plus 5,037 commits; forecast code (`BulkAllocationValidationSupport`, `0352d80271`) exists only on the QA branches.

## Orchestrator addendum — GSIS-20628 read from Jira (2026-09-17)

The Analyzer could not read Jira; the orchestrator read GSIS-20628 (Story, status Available for UAT, epic GSIS-2639) and its comments to answer the Analyzer's developer question on the design:
- The story description specifies read-time precedence (student → programme → Module Master).
- The design was then changed in the comment thread (product owner, 2026-05-20 and 2026-05-21): rules are **copied/inherited downward** Module Master → Module Offering → Programme Study Plan → Student Study Plan; an override updates only that rule at that level; pre-registration/registration validate only against the student study plan, with no runtime fallback. The developer confirmed building it that way, and noted student plans are also created on enrolment, APL approval (GCET-specific), programme transition and programme change.
- The developer's question of how to mark a rule as overridden (flag or other mechanism), and how to tell which rule type is overridden, was **not answered** in the thread.
- The thread does **not** say whether a rule saved at Module Master after lower-level records exist must be pushed down to them, nor what happens to a lower-level override when it is.

So the implemented copy-at-creation matches the agreed design for new records. Whether this ticket is a defect in that implementation (push on save was intended) or new behaviour depends on the answer to open question 4.

## Open Questions

1. **(qa)** Were the module's Dept/Module Offering, Programme Study Plan course and student study plan created before or after the rule was saved at Module Master? Retest with all three created after the rule.
2. **(qa)** The recording shows the Eligibility Forecast reporting co-requisite violations while the study plan PDF shows none. Is the failure the screens not showing rules, or validation not applying them? Which screen/step failed?
3. **(qa)** Which module and rule were configured at Module Master? Screenshots of the Module Offering and Programme Study Plan requisite tabs.
4. **(qa / product)** When a rule is added or changed at Module Master after offerings and study plans already exist, must it update them — and if a lower level has already overridden that rule type, is the override kept? (Replaces the Analyzer's developer question on GSIS-20628, narrowed by its comment thread.)
5. **(developer)** What build runs on sis-staging-osos, and where does the forecast remark "Skipped [Co-requisite … violated]" come from? Not found on `base-development`, `base-qa` or `base-sandbox-qa`.

## Status

NEEDS_INPUT: Q1–Q4 (qa, packet `qa-packet.md`), Q5 (developer). Work type to be revisited after Q4.
