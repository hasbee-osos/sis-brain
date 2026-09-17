# GSIS-28778 — Decisions

### D-1 — Work type bug, Flow A (base), branch base/bugfix/GSIS-28778-module-relationship-rule-propagation from base-development
- **Stage:** analyze, iteration 1
- **Decided by:** harness · confirmed by human 2026-09-17T05:16:24Z
- **Options considered:** Flow A base line with work type bug; Flow A with work type feature (the ACs restate the whole GSIS-20628 inheritance and override design); escalate as OSOS (recording made on OSOS staging, label SIS-OSOS-QA)
- **Why:** the ticket marks the customer as "Product Core Feature", so the fix belongs in the shared base product; the OSOS environment receives base images by commit SHA through DevOps, so no OSOS branch flow is needed. The Jira type Bug is kept; if the Analyzer finds the propagation was never built, the work type is revisited with a superseding record. Stage 1 PR → base-sandbox-qa; stage 2 → gcet-sandbox-qa and gutech-sandbox-qa after the human confirms stage 1 is on base-qa.
- **Convention cited:** git-workflow → Flow A for common tickets; work-types → Bug maps to bug / bugfix
- **Evidence:** Jira GSIS-28778 fields Issue Type = Bug, Customer Name = Product Core Feature, label SIS-OSOS-QA; C0_REQ_Consition_violation.mp4 @ 00:00 address bar shows the OSOS staging host
- **Status:** LOCKED

### D-2 — Root cause (defect in built behaviour): offering and study-plan course creation re-uses the parent table's row IDs
- **Stage:** analyze, iteration 1
- **Decided by:** analyzer (analysis-2.md, RC-2) · confirmed by human: not required
- **Options considered:** creation posts parent rows with parent primary keys and createList soft-deletes the seeded rows then merges the foreign IDs; seeded rows survive and the posted rows are ignored; a separate PDF display defect explains the empty requisite columns
- **Why:** the frontend copies each parent row's id into the create payload, the mapper keeps it, and BaseEntity uses IDENTITY with no @Version, so saveAll merges. A live child row with the same ID is moved to the new record, silently removing that rule from another offering or study plan course; only when no such ID exists is a correct copy inserted. The seed added for GSIS-20628 is overwritten by this older UI path on every add.
- **Convention cited:** none
- **Evidence:** sis-product-sis-frontend/src/app/modules/admin/masters/course-offering-master/add-view-edit-course-offering-course/add-view-edit-course-offering-course.component.ts:271, 477; sis-product-sis-frontend/.../course-master/requisite/course-co-requisite/course-co-requisite.component.ts:288; sis-product-sis-frontend/.../study-plan-master/add-view-edit-study-plan-course-list/add-view-edit-study-plan-course-list.component.ts:886-891; sis-product-sis-admin-backend/src/main/java/com/ubs/sis/administration/service/impl/CourseOfferingCourseCoRequisiteServiceImpl.java:63-91; sis-product-sis-admin-backend/.../StudyPlanCourseCoRequisiteServiceImpl.java:58-83; sis-product-sis-admin-backend/.../StudyPlanCoursePreRequisiteServiceImpl.java:58-83
- **Status:** LOCKED

### D-3 — The reported symptom is behaviour never built: no push of Module Master rules to existing lower-level records, and no override marker
- **Stage:** analyze, iteration 1
- **Decided by:** analyzer (analysis-2.md, RC-1 and Gap) · confirmed by human: not required
- **Options considered:** push-on-save exists but is broken; push-on-save and override tracking were never built (copy only at creation); rules are resolved at read time from Module Master
- **Why:** master save services write only master tables on every branch checked (base-development, base-sandbox-qa, base-qa, gcet-sandbox-qa, OSOS staging); lower levels copy from their parent only in postCreateEntity or the student seed helper; no per-level table has an override, inherited or source column on any branch. The ticket's AC-1 and AC-4 (written by the GSIS-20628 design owner) require push on save that skips overridden rule types, so existing records must update regardless of when they were created.
- **Convention cited:** none
- **Evidence:** sis-product-sis-admin-backend/src/main/java/com/ubs/sis/administration/service/impl/CourseOfferingCourseServiceImpl.java:175-192, 588-676; sis-product-sis-admin-backend/.../StudyPlanCourseServiceImpl.java:229-240, 752-850; sis-product-sis-admin-backend/src/main/java/com/ubs/sis/student/service/helper/StudentStudyPlanCourseRequisiteSeedHelper.java:66-78; Liquibase V2/1-table_modifications 000709-000712, 000737-000738, 002011-002013; Jira GSIS-28778 AC-1, AC-4; GSIS-20628 comments 2026-05-20/21
- **Status:** LOCKED

### D-4 — Scope: deliver RC-2 and AC-1…AC-5 in full under GSIS-28778 as one bug, ordered as phases S1–S4 on one branch
- **Stage:** analyze, iteration 1
- **Decided by:** developer · confirmed by human 2026-09-17T10:01:18Z
- **Options considered:** keep bug scoped to RC-2 and move AC-1…AC-5 to a new story; switch to feature and slice into Jira sub-tasks; switch to feature and deliver the whole story; keep bug and deliver the whole scope
- **Why:** the team cannot create additional Jira stories or sub-tasks, and the ticket's ACs must be met for QA to accept it. This overrides the work-types too-big rule (reviewability) with that reason. Reviewability is kept by delivering the analysis-2 slices as ordered phases with focused commits: S1 RC-2 row-ID fix; S2 override marker per rule type per level with backfill; S3 push-on-save cascade skipping overrides plus AC-5 regression tests; S4 UI inherited/overridden indicator and reset. Scope in: AC-1…AC-5 on base-development and RC-2 (D-2). Out: GCET-line SQL routines (D-5), legacy *PreRequisitesOne/Two and *CoRequisites lists. Assumption: Pre-Req includes advanced pre-requisite conditions. Work type stays bug per D-1.
- **Convention cited:** work-types → story too big for one run: human override recorded with reason
- **Evidence:** analysis-2.md Gap and proposed slices; Jira GSIS-28778 Acceptance Criteria; developer answer 2026-09-17
- **Status:** LOCKED

### D-5 — GCET/OSOS forecast and eligibility SQL routines are out of scope
- **Stage:** analyze, iteration 1
- **Decided by:** developer · confirmed by human 2026-09-17T10:01:18Z
- **Options considered:** leave the routines unchanged and record a known gap; align fn_forecast_process_cs_v19 and fn_get_course_per_student_by_ay_aysem_v28 with AC-5 in stage 2
- **Why:** the routines exist only on the gcet line and OSOS hotfix branches, not on base-development where this change is made; changing them widens the stage-2 regression surface. Known gap: they ignore student-level pre-requisite overrides and fall back to Module Master for co-requisites, contrary to AC-5.
- **Convention cited:** engineering-standards → smallest change that completely delivers the ticket; document unrelated problems as findings
- **Evidence:** origin/pre-hotfix-osos-staging-31feab8 src/main/resources/db/changelog/sql_files/stored_routines/fn_forecast_process_cs_v19.sql:1096-1190, 1449-1461 (sis-product-sis-admin-backend)
- **Status:** LOCKED

### D-6 — Backfill classifies existing lower-level rows by comparing them to their parent
- **Stage:** analyze, iteration 1
- **Decided by:** developer · confirmed by human 2026-09-17T10:01:18Z
- **Options considered:** compare to parent (identical = inherited, different = overridden and kept; empty level inherited unless rules were deliberately deleted after creation); treat all existing rows as inherited; defer to the Designer
- **Why:** keeps manual lower-level edits made before the marker existed (AC-4 regression surface) while letting untouched records receive future Module Master pushes.
- **Convention cited:** none
- **Evidence:** analysis-2.md DD-3; per-level tables have no marker (Liquibase V2/1-table_modifications 000709-000712, 000737-000738, 002011-002013)
- **Status:** LOCKED
