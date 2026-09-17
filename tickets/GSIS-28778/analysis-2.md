# Analysis (revision 2)

Ticket: GSIS-28778
Work type: bug (D-1). **I recommend switching it to feature, split into slices, with the confirmed defect as Slice 1** (see Recommendation). Both the Root Cause and Gap sections are kept so the developer can choose. Drop the one that isn't used.

Revision 2 answers revision 1's open questions from code, git history, the recording and Jira instead of asking QA. `qa-packet.md` is superseded and must not be posted.

## Problem

Pre-Requisite, Co-Requisite and Mutually Exclusive rules saved on a module at Module Master are not reflected at Dept/Module Offering, Programme Study Plan or Student Study Plan. Validation is said to act on missing rules.

## Expected

The ticket's ACs, written by the product owner who designed GSIS-20628, say:
- A rule saved at Module Master is pushed down on save.
- Each lower level inherits from the level above and can override each rule type separately.
- The master rule applies wherever no override exists.
- Validation reads only the student's final plan.

## Observed

- Lower levels get rules only once, when the lower-level record is created.
- Nothing is pushed on a later save, and nothing marks a rule as overridden.
- Copy-at-creation also has a defect that re-uses row IDs (RC-2).

## Acceptance Criteria (feature)

| ID | Criterion | Source |
|---|---|---|
| AC-1 | When a Pre-Req / Co-Req / Mutually Exclusive rule is saved at Module Master, it is automatically reflected at Dept/Module Offering (pushed on save) | ticket |
| AC-2 | Programme Study Plan shows the rules inherited from Offering; admin can override one rule type independently | ticket |
| AC-3 | Student Study Plan inherits the effective Programme-level rules; override per rule type per student | ticket |
| AC-4 | If a lower level has no override, the Module Master rule stays in force | ticket |
| AC-5 | Pre-registration and course registration validate only against the final Student Study Plan configuration | ticket |

"Pre-Req" covers both the grouped pre-requisites and the advanced pre-requisite conditions. They are seeded together (`seedAdvancedPreRequisiteListsFromCourseMaster` + `seedAdvancedPreReqConditionsFromCourseMaster`) and shown under the same Pre-Requisites tab (`add-view-edit-course-offering-course.component.html:82`).

## Attachments

| Attachment | Read | What it shows |
|---|---|---|
| C0_REQ_Consition_violation.mp4 (44 s) | 10 frames | **@ 00:00–00:08:** Super Admin on the OSOS staging host. Module master list, then the view of UFCE4A-15-0 with its Pre-Req / Co-Req / Mutually Exclusive tabs; no rule is saved on screen. **@ 00:16:** Student Eligibility Forecast (BSC_2026). One student is in "Conflict" with remarks "GCET-15-0 : Skipped [Co-requisite UFCFTN-30-0 violated]", "UFCFTN-30-0 [GCET-15-0, UFCE4A-15-0, UFME49-15-0] co-requisite violated" and "UFME49-15-0 [UFCE4A-15-0] co-requisite violated", plus credit/module-minimum conflicts. **@ 00:31:** Student Portal Study Plan for that student. **@ 00:34–00:44:** "Preview Study Plan" PDF. Semester 1 holds UFCE4A-15-0, UFCFTN-30-0, UFME49-15-0 and GCET-15-0; the Pre-Requisites and Co-Requisites columns show "-" for every module in all semesters. |

Mismatches:
- The Offering and Programme Study Plan steps are not recorded.
- The ticket says validation "fails silently", but the OSOS forecast does enforce co-requisites. That comes from a GCET-line SQL fallback to Module Master (see RC-1 evidence), not from inherited rows.

## Repositories

| Repo | Role | Why (evidence) |
|---|---|---|
| sis-product-sis-admin-backend | change | Master and per-level save services, copy-at-creation, the `createList` ID re-use (RC-2), per-level tables (no override marker), validators, study plan PDF |
| sis-product-sis-frontend | change | Offering and study-plan add flows post parent-level rows with parent IDs (RC-2). An inherited/overridden indicator and "reset to inherited" would go on the requisite tabs (AC-2, AC-3). |
| other 6 repos | context – not involved | No requisite / mutually-exclusive code (revision 1 search) |

Flow:
- **Master:** Module tabs → `Course{CoRequisite,PreRequisite}ServiceImpl.createList`, `CourseAdvancedPreReqConditionServiceImpl.replaceAdvancedPreReqConditionsByCourse`, `CourseMutuallyExclusiveServiceImpl.replaceMutuallyExclusiveCourses` → master tables only.
- **Offering create:** `CourseOfferingCourseServiceImpl.postCreateEntity` → seed from master → then `saveCoursePreAndCoRequisite` → `CourseOfferingCourseCoRequisiteServiceImpl.createList`.
- **Study plan course create:** `StudyPlanCourseServiceImpl.postCreateEntity` → seed from offering → `StudyPlanCourse{Co,Pre}RequisiteServiceImpl.createList`.
- **Student plan course create:** `StudentStudyPlanCourseRequisiteSeedHelper.seedFromAdminStudyPlanCourse`.
- **Validation on base-development:** `StudentCourse{Pre,Co}RequisiteValidationServiceImpl` and `StudentCourseMutuallyExclusiveValidationServiceImpl` read student tables only.

## Root Cause (bug)

**RC-1 (the reported symptom; behaviour never built)**

No branch has any code that pushes a rule saved at Module Master to lower-level records that already exist. The master save services write only master tables, and each lower level copies from its parent only once, in `postCreateEntity` or the student seed helper. So any Offering, Programme Study Plan course or Student Study Plan course that existed before the save keeps its old rules. In the recording, those old rules are empty at student level.

Evidence:
- The master save services have no reference to offering, study-plan or student repositories. Checked on base-development, base-sandbox-qa, base-qa, gcet-sandbox-qa and the OSOS staging branch.
- A history search across all branches for propagation of requisite, exclusive or rule data finds nothing.
- The PDF reads only student-level rows (`StudentStudyPlanCourseServiceImpl.getList:214-229`), and it shows "-" for every module in both columns. The co-requisite partners (UFCFTN-30-0, GCET-15-0, UFME49-15-0) are in the same plan, so their codes would resolve through `extractCourseCodeListOfCourseOfferingCourse`. That makes "no student-level rows" the likely reading.
- The forecast does not tell us either way. `fn_forecast_process_cs_v19.sql:1096-1110, 1133-1190` uses student-level co-requisites if any exist, and otherwise falls back to `sis_admin_course_co_requisite` (Module Master). The remarks at 2039 and 2362 therefore appear with or without student rows.

**RC-2 (defect in built behaviour; confirmed from code)**

When a Dept/Module Offering course or a Programme Study Plan course is created from the UI, the frontend posts the parent level's co-requisite rows with the parent table's primary keys. For study plan it also posts pre-requisite rows. `createList` then soft-deletes the rows the backend has just seeded and runs `saveAll` on entities that carry those foreign IDs. Spring Data therefore calls JPA `merge`. Each table has its own IDENTITY sequence, and Spring Boot 2.7.12 uses Hibernate 5.6. So:
- if a live child row has that ID, `merge` updates it and moves it to the new record, which silently removes that rule group from another offering or study plan course;
- only when no live row has that ID does `merge` insert a correct copy.

Evidence:
- **Offering, frontend:** `onCourseSelect` → `courseRequisiteState(course, false)` (`add-view-edit-course-offering-course.component.ts:271`) puts the co-requisite component in its default mode. `loadData` then reads master `course_co_requisite` rows, and `saveCourseCoRequisite` copies each row's `id` (`course-co-requisite.component.ts:288`). `generateReq:477` always sends `courseOfferingCourseCoRequisite`. This has been in place since GSIS-5410, 2023-10-17, commit `4877c1caad`.
- **Offering, backend:** `hasRequisitesProvidedInRequest:580` is true, so `saveCoursePreAndCoRequisite:418` → `CourseOfferingCourseCoRequisiteServiceImpl.createList:63`. `delete()` removes the seeded rows, whose IDs are not among the posted master IDs (line 90), then `saveAll` runs (line 73). The mapper copies `id` (the generated `CourseOfferingCourseCoRequisiteMapperImpl` calls `setId(entityRequest.getId())`, with no ignore in `BaseMapper`). In gears-commons-lib 0.0.33, `BaseEntity.id` is `@GeneratedValue(IDENTITY)` with no `@Version`, so a non-null ID means `merge`.
- **Study plan:** `loadDataCoCourseOffering` / `loadDataPreCourseOffering` store offering rows, with offering IDs, in hash maps. `create` posts them as `studyPlanCourseCoRequisite` / `studyPlanCoursePreRequisite` (`add-view-edit-study-plan-course-list.component.ts:886-891`, since commit `c6b8554b3d`, 2023-10-25). They reach `StudyPlanCourse{Co,Pre}RequisiteServiceImpl.createList:58` with the same delete-then-merge pattern.
- **Not affected:**
  - Offering pre-requisites and advanced conditions are not posted on create (the component needs a saved ID), so the seeded rows stay.
  - Mutually Exclusive uses `replace` with structure-master IDs and has no row-ID re-use.
  - Student level: the student screens load their own rows.
- The backend seed (commit `2abffe1579`, 2026-06-01, GSIS-20628) is overwritten by this older UI path every time the add screen is used.

**Falsifiable tests:**
- **RC-2:** a DB has a live `course_offering_course_co_requisite` row with ID N on offering course A, and module X has a master co-requisite row with ID N. Create an offering course for X from the UI. Row N now belongs to the new course and A has lost its rule.
- **RC-1:** save a new co-requisite at master. Existing offering, study-plan and student rows for that module are unchanged.

**Also noted:** `StudentStudyPlanCourseRequisiteSeedHelper.java:76-77` swallows every exception at INFO, so a failed student seed is silent.

**Ruled out:**
- *The PDF has its own display defect that explains the "-":* not needed. The same lookup is used by the programme PDF (`StudyPlanMasterServiceImpl:752`), and "-" also appears in the Pre-Requisites column.
- *Validation reads master on base:* rejected, the validators read student tables.
- *Propagation code differs on OSOS staging:* rejected. The propagation classes are identical; the diffs are in unrelated APL and registration-detail code.
- *Override support exists anywhere:* rejected (see Gap).

## Gap (feature)

| Area | Today (base-development; same on base-sandbox-qa, base-qa, OSOS staging) | Needed | AC |
|---|---|---|---|
| Push on save, master → offering | None; copy only at creation, broken by RC-2 | Push to existing offering courses of the module, skipping overridden rule types | AC-1, AC-4 |
| Push offering → study plan → student | None | Cascade when a level's rule changes, skipping overrides | AC-2, AC-3, AC-4 |
| Override marker per rule type per level | None. The per-level tables (Liquibase 000709-000712, 000737-000738, 002011-002013) have only audit, tenant, deleted, parent, SM-ids and active_status columns. No override, inherited or source column on any branch (history search on changelogs and entities). | Marker per rule type per level; set by the level's save entry points (`CourseOffering*`, `StudyPlan*`, `StudentStudyPlan*` `createList` / `replace*`) | AC-2, AC-3 |
| Mutually Exclusive granularity | Pairs are keyed by course offering, study plan or student study plan, not by course | The override design must fit that shape | AC-2, AC-3 |
| UI | Tabs show only the viewed level's rows (`course-co-requisite.component.ts` `onLoadDataComponent`) | Inherited vs overridden indicator; reset to inherited | AC-2, AC-3 |
| Validation | Base Java validators read student level only: **already met** | Keep; add regression tests | AC-5 |
| GCET/OSOS SQL routines | `fn_forecast_process_cs_v19`, `fn_get_course_per_student_by_ay_aysem_v28` (gcet-sandbox-qa, gcet-qa, OSOS): co-requisites fall back to master; pre-requisites read master ∪ offering and ignore the student level; Mutually Exclusive unions master, study plan and student | Would ignore student overrides; contradicts AC-5. Not on base branches. | AC-5 (stage 2) |

Scope:
- **In:** AC-1…AC-5 on base-development and RC-2.
- **Out:** the GCET-line SQL routines (DD-4), legacy `*PreRequisitesOne/Two` and `*CoRequisites` lists.
- **Assumption:** "Pre-Req" includes the advanced conditions.

Size: **too big for one run.** 5 ACs, 2 repos and no new workflow pass the size test. It fails on reviewability: the backend needs a marker on about 12 per-level tables, marking at about 12 save entry points, a cascade from 4 master and 6 lower-level save points, and a backfill. The frontend needs changes on 3 screens with 3 tabs each.

Proposed slices:

| # | Slice | ACs | Repos | Order |
|---|---|---|---|---|
| S1 | Fix RC-2: creation never re-uses foreign row IDs (offering co-req; study-plan co- and pre-req); regression test | — (defect) | backend (+ frontend if IDs are stripped client-side) | 1st, independent |
| S2 | Override marker per rule type per level; set on each level save; exposed in responses; backfill per DD-3 | AC-2, AC-3 (backend), AC-4 basis | backend | after S1 |
| S3 | Cascade push on save (master → offering → study plan → student) skipping overrides; one-off sync of existing non-overridden records; AC-5 regression tests | AC-1, AC-4, AC-5 | backend | after S2 |
| S4 | UI inherited/overridden indicator and reset-to-inherited on Offering, Programme Study Plan, Student Study Plan | AC-2, AC-3 | frontend (+ small backend endpoint) | after S2; can run alongside S3 |

## Affected

- **admin-backend (administration services):**
  - `Course{CoRequisite,PreRequisite,AdvancedPreReqCondition,MutuallyExclusive}ServiceImpl`
  - `CourseOfferingCourse{,CoRequisite,PreRequisite,AdvancedPreReqCondition}ServiceImpl`, `CourseOfferingMutuallyExclusiveServiceImpl`
  - `StudyPlanCourse{,CoRequisite,PreRequisite,AdvancedPreReqCondition}ServiceImpl`, `StudyPlanMutuallyExclusiveServiceImpl`
- **admin-backend (student):**
  - `StudentStudyPlanCourse{CoRequisite,PreRequisite,AdvancedPreReqCondition}ServiceImpl`, `StudentStudyPlanMutuallyExclusiveServiceImpl`
  - `StudentStudyPlanCourseRequisiteSeedHelper`
  - validators
  - Liquibase `V2/1-table_modifications`
- **frontend:** `course-master/requisite/*`, `course-offering-master/{add-view-edit-course-offering-course,course-offering-advanced-pre-requisite,course-offering-mutually-exclusive}`, `study-plan-master/add-view-edit-study-plan-course-list`, `student-portal/academics/student-study-plan/study-plan-course`

## Regression Surface

- Existing lower-level edits must survive a push (AC-4). They have no marker today (DD-3).
- Offering and study-plan add/edit flows, including the legacy lists and the recursive offering `create` in `saveOtherEntities`.
- The four student-plan creation paths: enrolment, transition, programme change, CT study plan / APL.
- Pre-registration and registration validators (`/co-requisite-validation`), eligible-module list.
- Both study plan PDFs.
- GCET-line forecast and eligibility SQL (stage 2 to gcet-sandbox-qa).

## Evidence

As of `origin/base-development` (admin-backend `f0230d6ceb`, frontend `e7dc118980`):

**admin-backend**
- `sis-product-sis-admin-backend/src/main/java/com/ubs/sis/administration/service/impl/CourseOfferingCourseServiceImpl.java:175-192, 405-437, 580-586, 588-676`
- `.../CourseOfferingCourseCoRequisiteServiceImpl.java:63-91`
- `.../StudyPlanCourseServiceImpl.java:229-240, 300-328, 752-850`
- `.../StudyPlanCourseCoRequisiteServiceImpl.java:58-83`
- `.../StudyPlanCoursePreRequisiteServiceImpl.java:58-83`
- `sis-product-sis-admin-backend/src/main/java/com/ubs/sis/student/service/impl/StudentStudyPlanCourseServiceImpl.java:214-229`
- `.../StudentCustomizedStudyPlanServiceImpl.java:363-383, 415-429`
- `.../student/service/helper/StudentStudyPlanCourseRequisiteSeedHelper.java:66-78`
- Mapper and ORM:
  - generated `CourseOfferingCourseCoRequisiteMapperImpl.mapRequestDtoToEntity` (local build) copies `id`
  - gears-commons-lib 0.0.33 `BaseEntity` is `@GeneratedValue(IDENTITY)` with no `@Version`
  - `build.gradle:2` is Spring Boot 2.7.12
- Liquibase `src/main/resources/db/changelog/V2/1-table_modifications/000709, 000710, 000711, 000712, 000737, 000738, 002011, 002012, 002013` (checked on base-qa)

**frontend**
- `sis-product-sis-frontend/src/app/modules/admin/masters/course-offering-master/add-view-edit-course-offering-course/add-view-edit-course-offering-course.component.ts:236-272, 451-480`
- `.../course-master/requisite/course-co-requisite/course-co-requisite.component.ts:111-130, 275-300`
- `.../study-plan-master/add-view-edit-study-plan-course-list/add-view-edit-study-plan-course-list.component.ts:354-381, 876-891`

**OSOS / GCET line**
- `origin/pre-hotfix-osos-staging-31feab8` (head `049d9f9611`): `src/main/resources/db/changelog/sql_files/stored_routines/fn_forecast_process_cs_v19.sql` lines 731-745, 1096-1190, 1449-1461, 2039, 2362
- The same branch has `fn_get_course_per_student_by_ay_aysem_v28.sql`

## Former questions

- **Q1** (were records created before or after the rule): **moot.** AC-1 and AC-4 require existing records to update either way. The PDF shows no student-level rows for the recorded student.
- **Q2** (forecast vs PDF): **answered.**
  - The remark comes from `fn_forecast_process_cs_v19.sql`, which uses student-level co-requisites and falls back to Module Master.
  - The PDF and the Student Study Plan screen read only student-level rows (screen: `loadDataStudentStudyPlan`).
  - So a master rule exists and student-level rows are absent.
  - No separate PDF defect is needed to explain the "-".
- **Q3** (which module and rule): **answered** (orchestrator + recording).
- **Q4** (do master changes reach existing records; are overrides kept): **answered** by AC-1 + AC-4.
- **Q5** (build on sis-staging-osos): **answered, as far as the repos can show.**
  - **Backend:** `origin/pre-hotfix-osos-staging-31feab8` is gcet-qa at `31feab8f22` (2026-09-04) plus "stag hotfix" `7759ff7bfb` (which adds `fn_forecast_process_cs_v19`) plus the GSIS-28115 and GSIS-28040 hotfix merges.
  - **Frontend:** `origin/pre-hotfix-osos-staging-4d9b17d` is the gcet-qa line plus the GSIS-28331 hotfix.
  - The remark "Skipped [Co-requisite … violated]" exists only in v19, which is only on gcet-sandbox-qa, gcet-qa and the OSOS hotfix branches. That backs this reading.
  - The exact deployed image SHA is unknown from repos.
  - The propagation Java and the requisite save payloads are the same as base-development.
  - It does not matter for a fix to base-development. It matters only for DD-4.

## Open Questions

None external. Code, git history and the recording settle everything the design needs.

Developer decisions (no other team needed):
- **DD-1 Work type.** Recommendation: **switch GSIS-28778 to feature** (supersede D-1) and deliver RC-2 as Slice S1.
  - Why: the reported symptom (RC-1) and all five ACs describe behaviour that was never built: push, override marker, UI. A bug-type fix could not show AC-1 to AC-4 met, so the product owner could not accept the ticket.
  - RC-2 is a real defect in the same copy paths and must be fixed before a push re-uses them.
  - Alternative: keep this ticket as a bug scoped to RC-2, and put AC-1 to AC-4 in a new story.
- **DD-2** Accept the slices S1–S4, or proceed with the whole story (record the reason).
- **DD-3** How to classify existing lower-level rows that have no marker.
  - Suggested default: identical to the parent means inherited; different means overridden (kept).
  - An empty level whose record has no soft-deleted rows created after the record itself means inherited; otherwise it is a deliberate override.
- **DD-4** Whether stage 2 (gcet-sandbox-qa) also aligns the GCET SQL routines with AC-5. Today they ignore student pre-requisite overrides and fall back to master.
- **DD-5** Marker design and Mutually Exclusive granularity (Designer, within S2).

## Status

READY_FOR_DESIGN. No QA or product-owner input is needed. The RC-2 root cause can be locked now. DD-1 and DD-2 are developer-only decisions and should be taken before the Designer starts.
