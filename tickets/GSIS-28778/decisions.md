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

### D-7 — S1 fix in the backend: per-level createList nulls any posted row id not owned by the parent
- **Stage:** design, iteration 1
- **Decided by:** designer · confirmed by human: not required
- **Options considered:** backend nulls foreign ids and keeps owned ids; frontend strips ids; backend ignores posted rows on create; both backend and frontend
- **Why:** protects every API client, keeps add-time edits and the programme filter the UI posts, and keeps edit flows that post their own ids updating in place; the guard also goes on the student co/pre createList as defence
- **Convention cited:** none
- **Evidence:** sis-product-sis-admin-backend/src/main/java/com/ubs/sis/administration/service/impl/CourseOfferingCourseCoRequisiteServiceImpl.java:63-91; generated CourseOfferingCourseCoRequisiteMapperImpl:124 copies id; sis-product-sis-frontend/.../course-co-requisite.component.ts:224-237, 288
- **Status:** LOCKED

### D-8 — Override marker stored as three boolean columns on each level's course record table
- **Stage:** design, iteration 1
- **Decided by:** designer · confirmed by human: not required
- **Options considered:** pre_requisite_overridden / co_requisite_overridden / mutually_exclusive_overridden BOOLEAN NOT NULL DEFAULT false on sis_admin_course_offering_course, sis_admin_study_plan_course, sis_student_study_plan_course; a flag on each rule row; a separate override table; one enum-set varchar
- **Why:** a record-level flag can express a deliberately empty rule set, fits Mutually Exclusive pairs shared by two courses, adds no FK that MasterBaseService.preDelete would count, and is queryable. Entity fields are updatable=false and change only through @Modifying repository updates, so header updates that rebuild the entity from the request cannot reset them.
- **Convention cited:** sis-development-guidelines.md → every schema change is a Liquibase script
- **Evidence:** sis-product-sis-admin-backend/.../CourseOfferingCourseServiceImpl.java:456-491 (validateAndMapToEntityForUpdate rebuilds the entity); Mutually Exclusive keyed by offering / study plan / student study plan scope
- **Status:** LOCKED

### D-9 — A rule type is marked overridden only when a level save changes that record's canonical content; only reset clears it
- **Stage:** design, iteration 1
- **Decided by:** designer · confirmed by human: not required
- **Options considered:** content change compared before/after in the same service call (including creation payloads that differ from the seed); mark on every save; client sends an explicit flag; auto-clear when content equals the parent
- **Why:** the offering header save re-posts co-requisites on every update, so marking on every save would override everything; client flags miss API and legacy paths. Canonical content: Pre-Req = sorted active grouped rows plus advanced conditions; Co-Req = sorted active rows' SM ids; Mutually Exclusive = set of course pairs involving the course in scope, overridden per (scope, course), and a push never alters a pair whose partner is overridden in that scope.
- **Convention cited:** none
- **Evidence:** sis-product-sis-frontend/.../add-view-edit-course-offering-course.component.ts:443-477 → CourseOfferingCourseServiceImpl.postUpdateEntity:207-216; add-view-edit-study-plan-course-list.component.ts:387-400, 415-429 (programme filter)
- **Status:** LOCKED

### D-10 — Cascade is synchronous and transactional, top-down, skipping overridden rule types and everything below them
- **Stage:** design, iteration 1
- **Decided by:** designer · confirmed by human: not required
- **Options considered:** synchronous @Transactional on the entry service method; async after commit; read-time resolution; push only to active non-transition student plans; keep separate seed copies
- **Why:** registration must never validate stale rows and there is no retry infrastructure for async; read-time resolution is ruled out by D-3; validators fall back to any student plan so all live plans of the tenant are targets (including inactive, transition and CT applicant plans); one copy implementation (RequisiteInheritanceServiceImpl) serves seeds and pushes so "identical" comparisons stay consistent. A target is rewritten only when its content differs from its parent. If a Module Master save for the largest module exceeds 10 s on realistic data, implementation stops and an async decision supersedes this one.
- **Convention cited:** none
- **Evidence:** gears-commons-lib BaseService.create/update not transactional; StudentStudyPlanRequisiteValidationSupport.resolveStudentStudyPlan:46-57; seeds at CourseOfferingCourseServiceImpl.java:588-676, StudyPlanCourseServiceImpl.java:752-854, StudentStudyPlanCourseRequisiteSeedHelper.java:66-227
- **Status:** LOCKED

### D-11 — Backfill and one-off sync as set-based Liquibase SQL in changesets 002026 (columns), 002027 (markers), 002028 (sync)
- **Stage:** design, iteration 1
- **Decided by:** designer · confirmed by human: not required
- **Options considered:** Liquibase DO $$ SQL; startup ApplicationRunner; admin endpoint; lazy on read; Java customChange
- **Why:** follows the existing SQL backfill precedent and runs once per environment and tenant with no manual step. D-6 is implemented with its data limits explicit: "deliberately deleted" = a soft-deleted rule row of that type created more than 10 minutes after the record; never true for Mutually Exclusive (hard-deleted). Synced rows carry created_by = GSIS-28778-sync for tracing and manual rollback. Numbers are re-checked against all active sandbox lines before the S2 commit.
- **Convention cited:** sis-development-guidelines.md → Liquibase V2/1-table_modifications, 6-digit numbering, preConditions MARK_RAN
- **Evidence:** gcet-sandbox-qa 002022-backfill-default-manage-category-for-universities.xml; @SQLDelete does not stamp updated_at; Mutually Exclusive repositories use JPQL DELETE
- **Status:** LOCKED

### D-12 — Contracts: marker fields on the three record responses, reset endpoints on the three existing level controllers
- **Stage:** design, iteration 1
- **Decided by:** designer · confirmed by human: not required
- **Options considered:** POST …/{id}/requisite-inheritance-resets per level controller with body {ruleType}; one generic /requisite-inheritances?level= controller; a separate GET marker endpoint per tab
- **Why:** keeps each level's existing @PreAuthorizeGrant module (COURSE_OFFERING / STUDY_PLAN / {STUDY_PLAN, STUDENT_STUDY_PLAN} UPDATE) and avoids extra calls since hosts already hold the record. Enum RequisiteRuleType {PRE_REQUISITE, CO_REQUISITE, MUTUALLY_EXCLUSIVE}; error key admin.error.requisiteInheritance.parentNotFound; response fields preRequisiteOverridden, coRequisiteOverridden, mutuallyExclusiveOverridden (never null); one shared frontend status component.
- **Convention cited:** sis-development-guidelines.md → plural endpoints, translatable GearsException keys, shared components for missing common UI
- **Evidence:** EntityAssignmentCourseOfferingCourseController, EntityAssignmentStudyPlanCourseController, StudentStudyPlanCourseController and their @PreAuthorizeGrant modules
- **Status:** LOCKED

### D-13 — Programme Study Plan inherits offering rules unfiltered; the UI's create-time programme filter becomes an override when it changes content
- **Stage:** design, iteration 1
- **Decided by:** designer · confirmed by human: not required
- **Options considered:** inherit unfiltered (as the GSIS-20628 seed does); project offering rules onto the courses offered to the programme/MMS in the backend
- **Why:** projection would be a new business rule needing the entity-assignment course query inside the cascade and the backfill SQL. Consequence accepted: an inherited co-requisite group can name a course outside the programme; the remedy is a study-plan override.
- **Convention cited:** none
- **Evidence:** StudyPlanCourseServiceImpl.seedAdvancedPreRequisiteListsFromCourseOfferingCourse:769-793; add-view-edit-study-plan-course-list.component.ts:387-400; StudentCourseCoRequisiteValidationServiceImpl:146-156
- **Status:** LOCKED

### D-14 — The seed helper's catch-all stays out of scope
- **Stage:** design, iteration 1
- **Decided by:** designer · confirmed by human: not required
- **Options considered:** leave the catch and record a finding; remove the catch; raise the log level
- **Why:** removing it changes failure behaviour of enrolment, transition, programme change and CT paths; the cascade calls the new service directly so its exceptions propagate, and a push repairs any silently failed student seed whose content differs from its parent
- **Convention cited:** engineering-standards → document unrelated problems as findings
- **Evidence:** sis-product-sis-admin-backend/src/main/java/com/ubs/sis/student/service/helper/StudentStudyPlanCourseRequisiteSeedHelper.java:76-77
- **Status:** LOCKED

### D-15 — Test strategy: Mockito unit tests (characterization first, RC-2 regression failing before S1, one per AC), PostgreSQL 14 container for Liquibase SQL, Karma spec for the new frontend component
- **Stage:** design, iteration 1
- **Decided by:** designer · confirmed by human: not required
- **Options considered:** Mockito unit plus isolated PostgreSQL container plus Karma spec; Testcontainers; H2 @SpringBootTest
- **Why:** service logic is fully mockable; the backfill and sync SQL is PostgreSQL-specific (json functions, DO $$) which H2 1.3.148 cannot run and Liquibase is disabled in test config; Testcontainers would add a dependency that CI (which skips tests) never runs. Manual per-screen steps cover AC-2/AC-3 UI and a timed Module Master save covers D-10 performance.
- **Convention cited:** testing and characterization-testing skills
- **Evidence:** sis-product-sis-admin-backend/build.gradle:125-127; Dockerfile gradle build -x test; src/test/resources/application.yml; CourseRegistrationAddDropServiceImplTest pattern; frontend karma.conf.js
- **Status:** LOCKED

### D-16 — Convention deviation: cascade targets children by parent foreign key plus tenant, not campus Structure Master filtering
- **Stage:** design, iteration 1
- **Decided by:** designer · confirmed by human: not required
- **Options considered:** parent FK plus tenant_id; campus Structure Master filter
- **Why:** parent links already fix the campus; a campus filter would wrongly skip cross-campus offerings of the same module
- **Convention cited:** sis-development-guidelines.md → "Always use campus-based filtering via Structure Master"
- **Evidence:** design.md Conventions That Apply
- **Status:** LOCKED
