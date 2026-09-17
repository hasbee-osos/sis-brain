# Technical Design

Ticket: GSIS-28778
Work type: bug (D-1). Per D-4, the scope is RC-2 plus AC-1 to AC-5, delivered as phases S1 to S4 on `base/bugfix/GSIS-28778-module-relationship-rule-propagation` (from `origin/base-development`, Flow A). Each AC gets feature-level rigour.

Code of record: `origin/base-development` (admin-backend `f0230d6ceb`, frontend `e7dc118980`). Both local checkouts are on `base-sandbox-qa`, so every file was read with `git show origin/base-development:<path>`.

## Repositories

| Repo | Role | Summary |
|---|---|---|
| sis-product-sis-admin-backend | change | **S1:** stop `createList` re-using foreign row IDs. **S2:** override-marker columns, marking at every level save, marker backfill (Liquibase). **S3:** `RequisiteInheritanceService` push cascade, seeds moved into it, one-off sync (Liquibase), AC-5 regression tests. **S4:** reset endpoints and i18n keys. |
| sis-product-sis-frontend | change | S4 only. Marker fields on 3 models, a reset call on 3 services, a new shared `sis-requisite-inheritance-status` component, the Offering / Programme Study Plan / Student Study Plan host screens, and a `saved` output on 7 requisite tab components. No change in S1 to S3. |
| other 6 product repos | context | No requisite or mutually-exclusive code (analysis revision 1 search). Not re-opened. |

Corrections to the analysis (verified against the code):
1. **Creation-time payloads are overrides, not pure copies.**
   - The Programme Study Plan add screen posts offering rows *filtered to the courses offered to the programme/MMS* (`sis-product-sis-frontend/src/app/modules/admin/masters/study-plan-master/add-view-edit-study-plan-course-list/add-view-edit-study-plan-course-list.component.ts:387-400, 415-429`, since `c6b8554b3d`).
   - On the offering add screen the user can edit co-requisites before saving (`add-view-edit-course-offering-course.component.html:83`).
   - So "creation copies the parent" is only true when the posted payload matches the seed. This drives D-9 and D-13.
2. **Offering header save always posts co-requisites.** Every offering course header update re-posts the co-requisite rows (`add-view-edit-course-offering-course.component.ts:443-477` → `CourseOfferingCourseServiceImpl.postUpdateEntity:207-216`). A marker set "on every save" would override every offering course. The marker must therefore be content-based (D-9).
3. **Soft delete does not stamp `updated_at`.**
   - `@SQLDelete` only sets `deleted=true`, and `BaseEntity.updatedAt` is Hibernate `@UpdateTimestamp` (gears-commons-lib 0.0.33).
   - Mutually Exclusive pairs are **hard-deleted** by JPQL `DELETE` (`MutuallyExclusiveCourseOfferingCourseRepository`, `StudyPlanMutuallyExclusiveCourseRepository`, `StudentStudyPlanMutuallyExclusiveCourseRepository`).
   - So D-6's "deliberately deleted after creation" can only be inferred from the `created_at` of soft-deleted rows, and never for Mutually Exclusive (D-11).
4. **The base create/update path is not transactional.** `BaseService.create/update` (gears-commons-lib) and `MasterBaseService` have no `@Transactional`. Each repository call commits on its own; the new service methods set the transaction boundary.
5. **Master saves can also delete.** Master co-requisite and pre-requisite rules are saved through `CourseMasterServiceImpl.saveCoursePreAndCoRequisite:279-342`. It calls `createList`, or deletes everything when the posted list is empty. That delete branch is a master save entry point the analysis did not list.
6. **Base pre-requisite validation uses advanced conditions only.** `StudentCoursePreRequisiteValidationServiceImpl` reads only `StudentStudyPlanCourseAdvancedPreReqConditionRepository`, not grouped pre-requisite rows. AC-5 is already met for all three validators.
7. **Only the seed helper feeds student creation.** The `createList` calls in `StudentTransitionServiceImpl:302-379`, `ProgramChangeAcceptanceServiceImpl:271-338` and `StudentCustomizedStudyPlanServiceImpl:533-597` are `@Deprecated` private methods with no callers. Student creation uses only `StudentStudyPlanCourseRequisiteSeedHelper` (enrolment `:469`, transition `:255`, programme change `:225`, CT/APL `CTStudyPlanServiceImpl:493`).
8. **Liquibase numbering.** `base-sandbox-qa`/`base-qa` are already at `002025`, `gcet-sandbox-qa` at `002022`, `base-development` at `002017`. New scripts must start at the next number free on all active lines, `002026` as of today.
9. **Test tooling.**
   - Backend CI never runs tests (`Dockerfile`: `gradle build -x test`). The checkout has no `gradle/wrapper/gradle-wrapper.jar`, and there is no `build/test-results`, so there is no recorded baseline.
   - Frontend `.nvmrc` requires Node 16; the machine default is 24.20.0 (16.20.2 is installed).

## Conventions That Apply

- **Liquibase** (`sis-development-guidelines.md` → Database and Liquibase):
  - Files go in `src/main/resources/db/changelog/V2/1-table_modifications/`, numbered with 6 digits plus a description, no "changelog" in the name, not registered anywhere.
  - Every schema or data change is a Liquibase script; Hibernate auto-update is never used.
  - Changeset shape follows the existing scripts: `preConditions onFail="MARK_RAN" onError="HALT"`; data scripts use a `<sql splitStatements="false">` `DO $$` block as in `gcet-sandbox-qa:002022-backfill-default-manage-category-for-universities.xml`.
  - No new tables and no new FKs, so the FK `pg_constraint` guard does not apply.
- **Constructor injection only**; `@Slf4j` for logging (Entities, services and DTOs; Logging). The new service is not a master (no list or add page), so it does not extend `MasterBaseService` (the documented exception).
- **Authorization:** reset endpoints go on the existing level controllers with the same `@PreAuthorizeGrant` module as their sibling update endpoints:
  - `COURSE_OFFERING`/`UPDATE`
  - `STUDY_PLAN`/`UPDATE`
  - `{STUDY_PLAN, STUDENT_STUDY_PLAN}`/`UPDATE`

  No annotation on list views (Authorization).
- **Endpoints plural, entities singular.**
- **Errors:** translatable `GearsException(GearsResponseStatus.CUSTOM_MESSAGE_ERROR, "<key>")`, with keys added to `sis-product-sis-admin-backend/src/main/resources/i18n/en.json` and `ar.json` (where `requisite.*` keys already live, e.g. `requisite.coRequisiteMsg`).
- **Frontend:**
  - Use common components (`gears-button`, `GearsDialogService.openWarnDialog` for the reset confirmation).
  - A missing common component is created as a shared component (`src/app/shared/components/`), not built ad hoc per screen.
  - Always confirm destructive actions; no `console.log`; no commented-out code.
- **Existing patterns kept:**
  - Co-requisite, pre-requisite and advanced-condition rows are soft-deleted (`@SQLDelete`); Mutually Exclusive pairs are hard-deleted, as the existing replace services do.
  - Row copies take the target record's `tenant_id`.
- **ArchUnit rules** (`src/test/java/com/ubs/sis/archunit/master/MasterArchUnitTest.java`): service impls are reached only through service interfaces, and domain classes only from service, repository or mapper packages. New code must pass this test.
- **Deviation to lock (D-16):** guideline "Always use campus-based filtering via Structure Master". The cascade selects targets through parent foreign keys plus `tenant_id`, not campus Structure Master filters. Parent links already fix the campus, and a campus filter would wrongly skip cross-campus offerings of the same module.

## Decisions

- **Following:** D-1 (flow, work type, branch); D-2 (RC-2 root cause); D-3 (no push, no marker); D-4 (scope and S1 to S4 phases); D-5 (GCET SQL routines out of scope); D-6 (backfill classification).
- **New** (full records to be written from these lines):

| ID | Decision | Rejected options | Evidence |
|---|---|---|---|
| D-7 | **S1 fix in the backend only.** In each per-level `createList` (offering co/pre, study-plan co/pre, student co/pre), any posted row `id` that is not a live row of *this* parent is set to `null` before the delete and `saveAll`. Owned IDs are kept (the edit flow depends on them). The frontend is not changed in S1. | Frontend strips IDs (loses no content, but the API stays open and other clients stay unprotected). Backend ignores posted rows on create (loses add-time edits and the programme filter, correction 1). Both. | `CourseOfferingCourseCoRequisiteServiceImpl.java:63-91`; generated mapper copies `id` (`CourseOfferingCourseCoRequisiteMapperImpl:124`); `course-co-requisite.component.ts:288`; edit flows post owned IDs (`course-co-requisite.component.ts:224-237`) |
| D-8 | **Marker storage:** 3 `BOOLEAN NOT NULL DEFAULT false` columns (`pre_requisite_overridden`, `co_requisite_overridden`, `mutually_exclusive_overridden`) on `sis_admin_course_offering_course`, `sis_admin_study_plan_course` and `sis_student_study_plan_course`. Entity fields are `@Column(updatable = false)` and change only through repository `@Modifying` JPQL updates, so header updates that rebuild the entity from the request cannot reset them. | A flag column on each rule row (cannot express a deliberately empty set; Mutually Exclusive pairs are shared by two courses). A separate override table (new entity, a new FK that `MasterBaseService.preDelete` usage checks would count against course deletion, extra joins). One enum-set varchar (not queryable, error-prone). | `CourseOfferingCourseServiceImpl.validateAndMapToEntityForUpdate:456-491` rebuilds the entity from the request; Mutually Exclusive is keyed by scope (`MutuallyExclusiveCourseOfferingCourse.courseOffering`, `StudyPlanMutuallyExclusiveCourse.studyPlan`, `StudentStudyPlanMutuallyExclusiveCourse.studentStudyPlan`) |
| D-9 | **Marker semantics:**<br>• A level save marks a rule type overridden only when the save changes that record's canonical content for the type, compared before and after inside the same service call. This includes creation: a posted payload that differs from the seeded rows is an override (the programme-filter case).<br>• Markers are cleared only by reset.<br>• Canonical content: **Pre-Req** = sorted multiset of active grouped rows (sorted SM IDs) plus advanced conditions (`appliedTo`, `condition`, `value`); **Co-Req** = sorted multiset of active rows' sorted SM IDs; **Mutually Exclusive** = set of `min-max` course pairs involving the record's course in its scope.<br>• Mutually Exclusive is overridden per (scope, course): a course counts as overridden if any of its records in the scope is flagged, and a save or reset sets or clears the flag on all of them.<br>• A push never alters a pair whose partner course is Mutually Exclusive-overridden in that scope. | Mark on every save (the offering header save would override everything, correction 2). Frontend sends an explicit flag (trusts the client, misses API and legacy paths). Auto-clear when content equals the parent (surprising; reset is the explicit path). | Corrections 1 and 2; validators read active rows only (`StudentStudyPlanCourseCoRequisiteRepository.findAllActiveByStudentStudyPlanIdAndCourseIdIn`) |
| D-10 | **Cascade:**<br>• Synchronous, inside a Spring `@Transactional` boundary on the entry service method (`createList`, `replace*`) together with the level write and the marker update.<br>• Runs top-down: Master → Offering courses of the module → Study-plan courses whose `courseMaster` is that offering course → student study-plan courses with the same `courseMaster`, the same `semester` and `studentStudyPlan.studyPlan` equal to the semester's study plan.<br>• Pushes only when the source content changed.<br>• A target is rewritten only when its canonical content differs from its parent's. Overridden targets are skipped, and nothing is pushed below them (their children inherit from them).<br>• Scope: all live (`deleted=false`) records of the same `tenant_id`, including inactive, transition and applicant (CT) student plans.<br>• One copy implementation (`RequisiteInheritanceServiceImpl`) serves the seeds and the push; the three existing seed families move into it. | Async after commit (eventual consistency; failures invisible; no retry infrastructure; registration would validate stale rows). Read-time resolution from parents (rejected by D-3; validators and GCET SQL read the tables). Only active non-transition student plans (validators fall back to any plan: `StudentStudyPlanRequisiteValidationSupport.resolveStudentStudyPlan:46-57`). Keep separate seed copies (create and push could diverge and break the "identical" rule). | `BaseService.create/update` not transactional (correction 4); seeds at `CourseOfferingCourseServiceImpl.java:588-676`, `StudyPlanCourseServiceImpl.java:752-854`, `StudentStudyPlanCourseRequisiteSeedHelper.java:66-227` |
| D-11 | **D-6 backfill and one-off sync as Liquibase SQL** (set-based `DO $$`), in 3 changesets:<br>• `002026`: add columns.<br>• `002027`: classify markers top-down against the parent's *effective* content. An empty, non-deliberate parent counts as its own parent's effective content.<br>• `002028`: copy effective-parent rows into records that are empty and inherited, top-down.<br>"Deliberately deleted" means a soft-deleted rule row of that type exists for the record with `created_at > record.created_at + interval '10 minutes'`. It is never true for Mutually Exclusive (hard delete). Synced rows get `created_by = 'GSIS-28778-sync'` so they can be traced and rolled back manually. | Startup `ApplicationRunner` (new pattern; needs a guard flag). Admin endpoint (manual step per environment and tenant). Lazy on read (D-3). Java `customChange` (no Spring context; not an existing pattern). | `gcet-sandbox-qa:…/002022-backfill-default-manage-category-for-universities.xml` (SQL backfill precedent); correction 3 |
| D-12 | **Contracts:**<br>• Marker fields exposed on the 3 existing record response DTOs.<br>• Reset = `POST …/{id}/requisite-inheritance-resets` on the 3 existing level controllers, body `{ruleType}`, returning the 3 flags.<br>• Enum `RequisiteRuleType {PRE_REQUISITE, CO_REQUISITE, MUTUALLY_EXCLUSIVE}`.<br>• New error key `admin.error.requisiteInheritance.parentNotFound`.<br>• One shared frontend status component. | One generic `/requisite-inheritances?level=` controller (would need cross-module authorization juggling). A separate GET marker endpoint per tab (extra calls; the hosts already hold the record). | Controllers `EntityAssignmentCourseOfferingCourseController`, `EntityAssignmentStudyPlanCourseController`, `StudentStudyPlanCourseController` and their `@PreAuthorizeGrant` modules |
| D-13 | **Programme Study Plan inherits offering rules unfiltered** (as the GSIS-20628 seed does). The create-time programme/MMS filter in the UI is kept, and it becomes an override when it changes the content (D-9). | Backend projection of offering rules onto the programme's course list (a new business rule; needs the entity-assignment course query in the cascade and in backfill SQL). | `StudyPlanCourseServiceImpl.seedAdvancedPreRequisiteListsFromCourseOfferingCourse:769-793` (unfiltered); `add-view-edit-study-plan-course-list.component.ts:387-400` (filtered) |
| D-14 | **The seed helper's catch-all stays out of scope** (logged as a finding). The cascade calls the new service directly (exceptions propagate), and a push rewrites any non-overridden student course whose content differs from its parent, which repairs a silently failed seed. | Remove the catch (changes enrolment, transition, programme change and CT failure behaviour). Raise the log level (unrelated change). | `StudentStudyPlanCourseRequisiteSeedHelper.java:76-77` |
| D-15 | **Test strategy.** Mockito unit tests in the style of `CourseRegistrationAddDropServiceImplTest`: characterization first, an RC-2 regression test that fails before S1, and at least one test per AC. Liquibase and cascade SQL checked against an isolated PostgreSQL 14 container with a fixture matrix. Frontend Karma spec for the new component and service. Manual steps per screen. | Testcontainers (a new dependency, and CI does not run tests). H2 `@SpringBootTest` (H2 1.3.148 cannot run the JSON/`DO $$` SQL; Liquibase is disabled in `src/test/resources/application.yml`). | `build.gradle:125-127`; `Dockerfile` `-x test`; `docker-compose.yml:62-64` (`postgres:14`) |
| D-16 | Convention deviation: the cascade uses parent-FK plus tenant targeting instead of campus Structure Master filtering (reason in Conventions). | Campus filter. | Guideline "Always use campus-based filtering via Structure Master" |

- **Superseding:** None. D-6 is implemented with its limits made explicit in D-11 (deletion time is not recorded; Mutually Exclusive is hard-deleted), not changed.

## Cross-Repo Contracts

- **Response fields** (boolean, never null), added to `CourseOfferingCourseMasterResponseDto`, `StudyPlanCourseMasterResponseDto` and `StudentStudyPlanCourseResponseDto`, and to the frontend models `course-offering-course.ts`, `study-plan-course.ts` and `student/student-study-plan-course.ts`:
  - `preRequisiteOverridden`
  - `coRequisiteOverridden`
  - `mutuallyExclusiveOverridden`
- **Reset endpoints** (new):
  - `POST /api/v1/entity-assignments/course-offering-courses/{courseOfferingCourseId}/requisite-inheritance-resets`, `@PreAuthorizeGrant(COURSE_OFFERING, UPDATE)`
  - `POST /api/v1/entity-assignments/study-plan-courses/{studyPlanCourseId}/requisite-inheritance-resets`, `@PreAuthorizeGrant(STUDY_PLAN, UPDATE)`
  - `POST /api/v1/student-study-plans-course/{studyPlanCourseId}/requisite-inheritance-resets`, `@PreAuthorizeGrant({STUDY_PLAN, STUDENT_STUDY_PLAN}, UPDATE)`
  - Request: `{ "ruleType": "PRE_REQUISITE" | "CO_REQUISITE" | "MUTUALLY_EXCLUSIVE" }` (`@NotNull`).
  - Response: `Response<RequisiteInheritanceResponseDto>` with the 3 flags.
- **Error keys:**
  - `admin.error.requisiteInheritance.parentNotFound` (a student course with no matching admin study-plan course).
  - Record not found: `admin.error.notFound.courseOfferingCourseNotFound` / `admin.error.notFound.studentStudyPlanCourseNotFound` (already used in code, missing from `en.json`; add them), plus new `admin.error.notFound.studyPlanCourseNotFound`.
- **i18n keys** (backend `i18n/en.json` and `ar.json`, under `requisite`): `inheritedFromModuleMaster`, `inheritedFromCourseOffering`, `inheritedFromStudyPlan`, `overriddenAtThisLevel`, `resetToInherited`, `resetToInheritedConfirmTitle`, `resetToInheritedConfirmMessage`, `resetToInheritedSuccess`.
- **Shared DB objects:** the 9 marker columns; the rule tables of all three levels (unchanged shape). The GCET-line SQL routines read these tables (D-5 gap).
- **Existing contracts preserved:** all current requisite endpoints and payloads. The RC-2 guard is invisible to a correct client.
- **Ordering:**
  - Backend S1 to S4 must reach `base-sandbox-qa`/`base-qa` before or together with the frontend S4. Liquibase runs on backend deploy.
  - The backend alone is backward compatible: old UI plus new backend works.
  - The frontend must never be deployed without the backend (missing fields and 404 on reset).
  - Stage 2 (gcet/gutech sandboxes) follows D-1, only after base-qa is confirmed. Re-check changeset numbers against the customer sandbox heads then.

## Change

### sis-product-sis-admin-backend

Files / modules (paths under `src/main/java/com/ubs/sis/` unless stated):

- **S1**
  - `administration/util/RequisiteRequestIdGuard.java` (new static util: null the IDs not owned by the parent)
  - `administration/service/impl/CourseOfferingCourseCoRequisiteServiceImpl.java`, `CourseOfferingCoursePreRequisiteServiceImpl.java`, `StudyPlanCourseCoRequisiteServiceImpl.java`, `StudyPlanCoursePreRequisiteServiceImpl.java`
  - `student/service/impl/StudentStudyPlanCourseCoRequisiteServiceImpl.java`, `StudentStudyPlanCoursePreRequisiteServiceImpl.java`. Same defect class, API-reachable; the named paths are offering co-req and study-plan co/pre-req, and the other three get the guard as defence.
- **S2**
  - Liquibase `V2/1-table_modifications/002026-add-requisite-override-markers-to-course-level-tables.xml` and `002027-backfill-requisite-override-markers.xml`
  - Domain `administration/domain/CourseOfferingCourse.java`, `StudyPlanCourse.java`, `student/domain/StudentStudyPlanCourse.java`
  - Enum `administration/domain/enums/RequisiteRuleType.java`
  - Repositories `CourseOfferingCourseMasterRepository`, `StudyPlanCourseMasterRepository`, `student/repository/StudentStudyPlanCourseRepository` (`@Modifying(clearAutomatically = true)` flag updates by ID list)
  - The 3 response DTOs
  - `administration/service/RequisiteInheritanceService.java` plus `impl/RequisiteInheritanceServiceImpl.java` (canonical snapshot and `markOverriddenIfChanged`)
  - Marking hooks in:
    - offering: co/pre `createList`, `CourseOfferingCourseAdvancedPreReqConditionServiceImpl.replaceAdvancedPreReqConditionsByCourseOfferingCourse`, `CourseOfferingMutuallyExclusiveServiceImpl.replaceMutuallyExclusiveCourses`
    - study plan: co/pre `createList`, `StudyPlanCourseAdvancedPreReqConditionServiceImpl.replace…`, `StudyPlanMutuallyExclusiveServiceImpl.replace…`
    - student: co/pre `createList`, `StudentStudyPlanCourseAdvancedPreReqConditionServiceImpl.replace…`, `StudentStudyPlanMutuallyExclusiveServiceImpl.replace…`
- **S3**
  - `RequisiteInheritanceServiceImpl` push and copy
  - Master hooks in `CourseCoRequisiteServiceImpl.createList`, `CoursePreRequisiteServiceImpl.createList`, `CourseMasterServiceImpl.saveCoursePreAndCoRequisite` (delete-all branches), `CourseAdvancedPreReqConditionServiceImpl.replaceAdvancedPreReqConditionsByCourse`, `CourseMutuallyExclusiveServiceImpl.replaceMutuallyExclusiveCourses`
  - Seed move: `CourseOfferingCourseServiceImpl.seedRequisitesFromCourseMaster`, `StudyPlanCourseServiceImpl.seedRequisitesFromCourseOfferingCourse` and the `StudentStudyPlanCourseRequisiteSeedHelper` private seeds delegate to the service. The helper keeps its public signature and try/catch (D-14).
  - Child lookup and bulk-load repository methods
  - Liquibase `002028-sync-inherited-requisites.xml`
- **S4**
  - `EntityAssignmentCourseOfferingCourseController`, `EntityAssignmentStudyPlanCourseController`, `student/academics/StudentStudyPlanCourseController` (reset endpoints)
  - `administration/dto/request/RequisiteInheritanceResetRequestDto.java`, `administration/dto/response/RequisiteInheritanceResponseDto.java`
  - `src/main/resources/i18n/en.json`, `ar.json`

Steps:

**S1: RC-2 (commit `GSIS-28778 S1: never reuse foreign requisite row ids on create`)**
1. Write the characterization tests (see Tests), run them on unchanged code, and record the result.
2. Write the RC-2 regression tests, run them, and record that they **fail**.
3. In each listed `createList`:
   - load the live rows of `requestDto`'s parent once;
   - null every posted `id` not in that set (`RequisiteRequestIdGuard.clearForeignIds(rows, ownedIds)`);
   - then run the existing delete-unlisted and `saveAll` logic unchanged.
   - Add `@org.springframework.transaction.annotation.Transactional` to the method, so delete and insert are atomic.
4. Re-run the tests: regression tests pass, characterization tests are unchanged.

**S2: marker (commit `GSIS-28778 S2: requisite override marker per rule type per level`)**
1. `002026`: `addColumn` for the 3 columns on each of the 3 tables, `BOOLEAN`, `defaultValueBoolean="false"`, `NOT NULL`. Precondition: the tables exist and the columns do not. On PostgreSQL 11+ this is metadata-only, with no table rewrite.
2. Entities: `@Column(name=…, updatable=false) private boolean preRequisiteOverridden;` and the same for co-req and ME. Response DTOs get the same names. MapStruct maps entity to response by name; request DTOs are unchanged.
3. `RequisiteInheritanceService`:
   - `RequisiteSnapshot snapshot(RequisiteLevel level, Long recordId, RequisiteRuleType type)`
   - `void markOverriddenIfChanged(level, recordId, type, RequisiteSnapshot before)`
   - `RequisiteLevel {COURSE_MASTER, COURSE_OFFERING, STUDY_PLAN, STUDENT_STUDY_PLAN}` is internal.
   - Canonical form per D-9. Mutually Exclusive marking resolves the anchor course through the existing `resolveCourse…` logic and flags every record of that course in the scope.
4. Hook every level entry point listed above: snapshot, existing write, `markOverriddenIfChanged`. Master services are not marked.
5. `002027` backfill (D-6 via D-11), one `DO $$` block with `ON COMMIT DROP` temp tables, per rule type:
   - a. Compute `canon` in SQL exactly as in D-9. SM-ID arrays are JSON text (`VARCHAR(1000)` via `LongArrayConverter`); parse them with `json_array_elements_text(col::json)`, skip rows whose value is null or not an array, keep active rows only.
   - b. Offering course `oc` parent = `sis_admin_course c` where `c.structure_master = oc.structure_master_course` and `c.tenant_id = oc.tenant_id`. Study-plan course `spc` parent = `oc` via `spc.course_master_id`. Student course `sspc` parent = the `spc` with `spc.study_plan_semester_id = sspc.study_plan_semester_id`, `spc.course_master_id = sspc.course_master_id`, the semester's `study_plan_id` equal to `sis_student_study_plan.study_plan_id`, and the same tenant. Mutually Exclusive scopes: `course_offering_id`, `study_plan_id`, `student_study_plan_id`.
   - c. `deliberate(record, type)` per D-11.
   - d. `effective(record) = CASE WHEN canon='' AND NOT deliberate THEN effective(parent) ELSE canon END`, with master effective = master canon.
   - e. `overridden = (canon<>'' AND canon<>effective(parent)) OR (canon='' AND deliberate AND effective(parent)<>'')`.
   - f. `UPDATE … SET <type>_overridden = true` for those rows; level order Offering → Study Plan → Student. Records with no parent stay `false`.
6. Unit tests for marking (see Tests).

**S3: push, sync, AC-5 (commit `GSIS-28778 S3: push requisite rules down on save, skip overrides`)**
1. Characterization tests for the three seed families, written before moving them.
2. Service API (public methods `@Transactional`):
   - `pushFromCourseMaster(Long courseId, RequisiteRuleType type, RequisiteSnapshot before)`
   - `pushFromCourseOfferingCourse(Long id, type)`
   - `pushFromStudyPlanCourse(Long id, type)`
   - `copyFromParent(level, recordId, type)` (used by the seeds)
3. Algorithm per push:
   - a. Return if `before` equals the current canonical content.
   - b. Load children in bulk: offering courses by `course` SM ID and tenant; study-plan courses by `courseMaster.id IN (…)`; student courses by `(courseMaster, semester, studentStudyPlan.studyPlan)` via one JPQL per study-plan course set.
   - c. For each child not overridden for `type` whose canonical content differs from the parent: soft-delete its rows of that type (JPQL `UPDATE … SET deleted = true WHERE <parent>.id IN :ids`; advanced conditions through the existing derived `deleteAllBy…`); insert copies with `id = null`, the child's `tenant_id`, the source `active_status` and a copied `Long[]`.
   - d. Mutually Exclusive: in the child scope, recompute the pairs involving the anchor from the parent scope. Remove or add pairs only where neither the anchor nor the partner course is overridden in that scope, using the existing hard `deleteAllPairsInvolvingCourse`-style query narrowed to non-overridden partners. De-duplicate by pair key.
   - e. Recurse into that child's children (only for children that were not skipped).
4. Hook the pushes:
   - Master: end of `CourseCoRequisiteServiceImpl.createList` and `CoursePreRequisiteServiceImpl.createList` (snapshot at start); the delete-all branches of `CourseMasterServiceImpl.saveCoursePreAndCoRequisite`; `CourseAdvancedPreReqConditionServiceImpl.replace…` and `CourseMutuallyExclusiveServiceImpl.replace…`.
   - Offering and study-plan entry points push after marking. Student entry points do not push.
5. Replace the bodies of `seedRequisitesFromCourseMaster`, `seedRequisitesFromCourseOfferingCourse` and the helper's private seeds with `copyFromParent` for the 3 rule types. Behaviour must match the characterization tests, with one intended difference: Mutually Exclusive copies at offering and study-plan level now de-duplicate pairs, as the student helper already does. Record that difference in the test.
6. `002028` sync: per rule type, top-down, `INSERT … SELECT` copies of the (now effective) parent rows into records where `<type>_overridden = false`, `canon = ''` and the parent canon is not empty. Offering first, then study plan (from post-insert offering rows), then student. Mutually Exclusive: insert the missing pairs involving the course, skipping partners overridden in scope. Set `created_by='GSIS-28778-sync'` and `created_at=updated_at=now()`. Precondition: the marker columns exist.
7. AC-5 regression tests on the three validators; no production change.

**S4: reset (backend part of commit `GSIS-28778 S4: reset requisite rules to inherited`)**
1. `RequisiteInheritanceService.resetToInherited(level, recordId, type)`:
   - resolve the parent, or throw `CUSTOM_MESSAGE_ERROR "admin.error.requisiteInheritance.parentNotFound"`;
   - replace the rows from the parent (Mutually Exclusive: pairs involving the anchor in scope, respecting partner overrides);
   - clear the flag (all records of the course in scope for Mutually Exclusive);
   - push down to non-overridden children;
   - return the flags.
2. The 3 controller methods delegate to it; `@Valid @RequestBody RequisiteInheritanceResetRequestDto`.
3. Add the i18n keys to `en.json`/`ar.json`: English text as named in the contracts, Arabic authored with the change.

### sis-product-sis-frontend

Files / modules (S4 only; `src/app/` prefix):
- Models: `shared/models/course-offering-course.ts`, `shared/models/study-plan-course.ts`, `shared/models/student/student-study-plan-course.ts` (3 optional booleans); new `shared/models/requisite-inheritance.ts` (`RequisiteRuleType` union, response interface)
- Services: `shared/services/course-offering-course.service.ts`, `shared/services/study-plan-course.service.ts`, `shared/services/student/student-study-plan-course.service.ts`: `resetRequisiteInheritance(id: number, ruleType: RequisiteRuleType)` posting to `<apiBaseUrl>/<getContextPath()>/{id}/requisite-inheritance-resets` with `ObjectUtils.getFilterJson()` params, following `course-offering-advanced-pre-requisite.service.ts`
- New `shared/components/requisite-inheritance-status/requisite-inheritance-status.component.{ts,html,spec.ts}`, declared and exported in `shared/shared.module.ts`
- Hosts:
  - `modules/admin/masters/course-offering-master/add-view-edit-course-offering-course/add-view-edit-course-offering-course.component.{ts,html}`
  - `modules/admin/masters/study-plan-master/add-view-edit-study-plan-course-list/add-view-edit-study-plan-course-list.component.{ts,html}`
  - `modules/student/student-portal/academics/student-study-plan/study-plan-course/study-plan-course.component.{ts,html}`
- Tabs, each gains `@Output() saved = new EventEmitter<void>()` emitted on save success:
  - `course-master/requisite/course-co-requisite` (in `validateSave` success)
  - `course-offering-master/course-offering-advanced-pre-requisite`
  - `course-offering-master/course-offering-mutually-exclusive`
  - `study-plan-master/study-plan-advanced-pre-requisite`
  - `study-plan-master/study-plan-mutually-exclusive`
  - `student-study-plan/study-plan-course/student-study-plan-advanced-pre-requisite`
  - `student-study-plan/study-plan-course/student-study-plan-mutually-exclusive`

Steps:
1. **Shared component.**
   - Inputs: `overridden: boolean`, `parentLabelKey: string` (`requisite.inheritedFromModuleMaster` / `…FromCourseOffering` / `…FromStudyPlan`), `readOnly: boolean`, `component: string`.
   - Output: `resetConfirmed`.
   - Renders a status line: translated inherited text, or `requisite.overriddenAtThisLevel`.
   - When `overridden && !readOnly`, shows a `gears-button` `requisite.resetToInherited`. The button opens `_gearsDialogService.openWarnDialog(translate(confirmTitle), translate(confirmMessage))` and emits only on `'confirmed'`.
2. **Hosts.**
   - Render the status component above each tab body, bound to the active tab's flag, and only when the record exists: offering in VIEW/EDIT (`courseOfferingCourseId > 0`), study plan when `studyPlanCourseId` is set, student when `studentStudyPlanCourseId` is set.
   - Offering host: `parentLabelKey = inheritedFromModuleMaster`. Study-plan host: `inheritedFromCourseOffering`. Student host: `inheritedFromStudyPlan`.
   - On `resetConfirmed`: call the service; on success show `requisite.resetToInheritedSuccess`, update the flags from the response and reload the tabs with the host's existing re-initialisation (offering: `courseRequisiteState(this.data, true)`; study plan and student: the existing drawer re-open / row reload). On error: `_gearsAlertService.onError(error)`.
   - On a tab's `saved`: re-fetch the record with `getById` and refresh the flags.
3. The offering co-requisite tab saves with the header Save; flags refresh from the existing post-update reload of `data`.

## Acceptance Criteria Coverage

| AC | Delivered by (repo → change) | Proven by (test or manual step) |
|---|---|---|
| RC-2 (D-2) | backend → S1 guard in 6 `createList` methods | Unit: `CourseOfferingCourseCoRequisiteServiceImplTest.createList_postedForeignRowId_isInsertedAsNewRow_foreignRowUntouched`, same in `StudyPlanCourseCoRequisiteServiceImplTest` and `StudyPlanCoursePreRequisiteServiceImplTest`. **Fails before S1.** DB check on PostgreSQL: the analysis falsifiable scenario (row N on offering course A; create an offering course for X whose master row is N; A keeps N). |
| AC-1 Master save pushed to Offering | backend → S3 `pushFromCourseMaster` plus master hooks; `002028` sync for existing data | Unit (parameterised over PRE incl. advanced, CO, ME): `RequisiteInheritanceServiceImplPushTest.masterSave_updatesNonOverriddenOfferingCourses`. DB: after `002028`, the fixture offering course that was empty and inherited has master rows. Manual: save a co-requisite on Module Master, open an existing Dept/Module Offering course, see the rule. |
| AC-2 Programme Study Plan shows inherited rules; override per rule type | backend → S2 marking in study-plan entry points; S3 `pushFromCourseOfferingCourse`; S4 reset. frontend → status component on the study-plan conditions drawer. | Unit: `studyPlanSave_changedCoReq_marksOnlyCoReqOverridden`; `offeringPush_skipsStudyPlanCoReqOverride_butDeliversPreReq`; `reset_studyPlanCoReq_recopiesFromOffering_clearsFlag_cascadesToStudents`. Frontend: `requisite-inheritance-status.component.spec.ts`. Manual: study-plan course shows "Inherited from Dept/Module Offering"; edit Co-Req → "Overridden"; the Pre-Req tab still shows inherited; reset → inherited again. |
| AC-3 Student Study Plan inherits effective programme rules; override per student | backend → student entry-point marking (S2); cascade study plan to student (S3); seed via `copyFromParent` for the 4 creation paths; reset (S4). frontend → status component on the student screen. | Unit: `studyPlanPush_updatesStudentCourses_skipsOverriddenStudent`; `studentSave_marksOnlyThatStudentCourse`; `StudentStudyPlanCourseRequisiteSeedHelperTest` (characterization, still green after S3). Manual: enrol (or run the CT study plan) for a student whose study plan has a co-requisite → the student tab shows it inherited; override one student → the other student is unchanged; a study-plan change reaches only the non-overridden student. |
| AC-4 Master rule in force without override | backend → cascade skips only overridden rule types and stops below them; D-6 backfill keeps pre-existing edits as overrides | Unit: `masterSave_noOverrides_reachesStudentCourse`; `masterSave_offeringCoReqOverridden_offeringAndDescendantsUntouched`; `push_childIdentical_writesNothing` (idempotency). DB: `002027` fixture matrix (identical → false; differs → true; empty without later deletion → false; empty with a soft-deleted row created later than 10 minutes after the record → true; Mutually Exclusive empty → false). |
| AC-5 Validation reads only the final Student Study Plan | backend → no production change (already met); pushes keep student tables current | Unit (regression): `StudentCourseCoRequisiteValidationServiceImplTest.studentLevelGroupDiffersFromMaster_usesStudentGroup` and `studentLevelEmpty_noMessage`; `StudentCoursePreRequisiteValidationServiceImplTest.usesStudentAdvancedConditionsOnly`; `StudentCourseMutuallyExclusiveValidationServiceImplTest.usesStudentPairsOnly`. Manual: pre-registration of a student whose student-level override removed a co-requisite → no violation, while the master still has the rule. |

## Regression Surface

Direct:
- 6 per-level `createList` methods (row-ID handling, transaction).
- 12 level save entry points (marking): offering, study plan and student co/pre `createList`, advanced `replace*`, Mutually Exclusive `replace*`.
- 5 master save entry points (push).
- The 3 seed families (moved).
- 3 record tables (new columns) and all 12 per-level rule tables (data written by push and sync).

Indirect:
- Offering course create/update (`CourseOfferingCourseServiceImpl.postCreateEntity/postUpdateEntity`, including legacy lists and the recursive `create` in `saveOtherEntities`).
- Study-plan course create (`StudyPlanCourseServiceImpl.postCreateEntity`).
- Course master create/update (`CourseMasterServiceImpl`).
- Both study plan PDFs (`StudentStudyPlanCourseServiceImpl.getList:214-229`, `StudyPlanMasterServiceImpl:752`) will now show requisites for synced students.
- Offering course delete (`postDelete` removes Mutually Exclusive pairs).
- Javers/entity audit volume from pushes.

Dependent:
- Pre-registration and registration validators (`CoursePreRegisterOfferController:193-217`, `CourseRegisterOfferController:232-256`).
- The 4 student-plan creation paths (enrolment `StudentCustomizedStudyPlanServiceImpl:456-471`, transition `StudentTransitionServiceImpl:255`, programme change `ProgramChangeAcceptanceServiceImpl:225`, CT/APL `CTStudyPlanServiceImpl:474-497`), all via the seed helper.
- UI: Course Master, Offering course, Programme Study Plan list and drawer, Student Study Plan screens; student graduation plan (`student-graduation-plan/study-plan-course`) reads the same tables.
- **Stage 2, GCET line (D-5 known gap):** `fn_forecast_process_cs_v19` and `fn_get_course_per_student_by_ay_aysem_v28` still fall back to Module Master for co-requisites, read master ∪ offering for pre-requisites and ignore student overrides. After the sync, student rows exist, so the co-requisite fallback fires less often. Student-level pre-requisite overrides remain ignored there, contrary to AC-5.

Existing behaviour to preserve:
- Edit flows that post their own row IDs update in place.
- Unlisted rows are soft-deleted.
- Creation seeds from the parent.
- The Mutually Exclusive replace semantics per anchor.
- Validator messages and keys.
- The seed helper stays non-throwing for creation paths.
- Course delete is still blocked while offering courses exist (`MasterBaseService.preDelete` usage check, `CourseMasterServiceImpl.preDelete:350-357`).
- Header updates never reset markers.

Regression scenarios:
- A header update rebuilt from the request clears markers (guarded by `updatable=false`; unit test on the offering update path).
- A header save posts an empty co-requisite list before the tab loads (race in `course-co-requisite.component.ts` init plus `setTimeout` in `courseRequisiteState`). At offering level this becomes a persistent empty override. At master level it already deletes the master co-requisites (`CourseMasterServiceImpl:330-341`) and now **cascades that loss** to every non-overridden level.
- Create-time programme filter marks many study-plan courses overridden (intended per D-9/D-13, but visible).
- Mutually Exclusive pushes delete pairs owned by an overridden partner (guard plus test).
- Duplicate pairs from old seeds make "identical" comparisons fail, so records are classified overridden (canonical form uses the distinct pair set).
- Tenant leakage in the cascade or sync (test plus SQL fixture with 2 tenants).
- Push timeout for a module in many programmes with many students.
- Backfill misclassifies an empty record whose rows were deleted soon after creation (documented D-11 limitation).
- ArchUnit violations from new service wiring.

High-risk paths:
- The `002027`/`002028` SQL on real data volumes, and its idempotency on re-run (changesets run once; the preconditions must be safe).
- Synchronous push from Module Master save to student plans (performance and transaction size).
- Mutually Exclusive partner-override logic.
- Offering course create via UI (seed plus posted rows plus marker).
- Registration validation after sync for students with previously empty rows. A group containing a course outside the programme can now block a student (D-13).

## Tests

### sis-product-sis-admin-backend

Existing infrastructure:
- JUnit 5, Mockito and `spring-boot-starter-test` (`build.gradle:125-127`); ArchUnit (`src/test/java/com/ubs/sis/archunit/`).
- H2 1.3.148 `@SpringBootTest` with Liquibase disabled (`src/test/resources/application.yml`).
- No existing tests for requisites or validators. CI skips tests.
- Pattern to follow: `src/test/java/com/ubs/sis/student/service/impl/CourseRegistrationAddDropServiceImplTest.java` (`@ExtendWith(MockitoExtension.class)`).

Levels:
1. **Characterization, before any production change** (names prefixed `characterization_`):
   - `CourseOfferingCourseCoRequisiteServiceImplTest`, `StudyPlanCourseCoRequisiteServiceImplTest`, `StudyPlanCoursePreRequisiteServiceImplTest`: owned IDs kept, unlisted rows deleted, rows without ID inserted.
   - `StudentStudyPlanCourseRequisiteSeedHelperTest`: copies all 4 rule sets; Mutually Exclusive de-duplication; swallow on exception.
   - `CourseOfferingCourseServiceImplSeedTest` and `StudyPlanCourseServiceImplSeedTest` (via `@InjectMocks`, `postCreateEntity`): copies master/offering rows with `id == null`, same SM IDs, same active status.
2. **RC-2 regression** (fails before S1, passes after): as in the AC table.
3. **S2 marking:** `RequisiteInheritanceServiceImplMarkerTest`.
   - Changed content → flag set; identical re-save → unchanged.
   - Creation payload equal to the seed → not flagged; filtered payload → flagged.
   - A pre-requisite change via advanced conditions only → PRE flagged.
   - Mutually Exclusive flags all records of the course in scope.
   - Offering header update path does not touch flags.
4. **S3 push:** `RequisiteInheritanceServiceImplPushTest`. AC-1, AC-2, AC-3 and AC-4 tests from the AC table, plus: tenant isolation, Mutually Exclusive partner override, write only when different, soft-deleted records skipped, student course without a study-plan parent skipped.
5. **AC-5:** the three validator tests.
6. **S4 reset:** `RequisiteInheritanceServiceImplResetTest` (re-copy, clear, cascade, `parentNotFound`).
7. **DB verification (D-15),** against an isolated container. Seed a fixture (2 tenants; master, offering, study-plan and student records covering the D-6 matrix for PRE incl. advanced, CO and ME; the RC-2 row-N case).
   - Run changesets `002026` to `002028` by starting the app with its Liquibase against that DB, or apply them via the Liquibase CLI on a schema-only restore.
   - Record SQL result snapshots before and after in the implementation report.
   - Re-start the app to confirm the changesets are not re-applied.
   - Container: `docker run --name gsis28778-pg -e POSTGRES_PASSWORD=<local> -p 55432:5432 -d postgres:14`.
8. **Performance (manual):** on a DB copy with realistic volume, time a Module Master co-requisite save for the module with the most study-plan and student courses. Record the count of touched rows and the duration. If it exceeds 10 s, stop and raise a superseding decision (async) instead of shipping.

Commands (the checkout lacks `gradle/wrapper/gradle-wrapper.jar`, so use the cached Gradle 8.14.5 found on this machine; JDK 11 is on PATH):
- `C:/Users/Dell/.gradle/wrapper/dists/gradle-8.14.5-bin/690y85m0j9nfaub7xoiayko8a/gradle-8.14.5/bin/gradle -p C:/Projects/sis-repos/sis-product-sis-admin-backend compileJava compileTestJava`
- `… gradle -p C:/Projects/sis-repos/sis-product-sis-admin-backend test --tests "com.ubs.sis.administration.service.impl.*Requisite*" --tests "com.ubs.sis.administration.service.impl.*SeedTest" --tests "com.ubs.sis.student.service.helper.*" --tests "com.ubs.sis.student.service.impl.StudentCourse*ValidationServiceImplTest"`
- `… gradle -p C:/Projects/sis-repos/sis-product-sis-admin-backend test --tests "com.ubs.sis.archunit.*"`
- Where a wrapper jar exists: `./gradlew test --tests "<same patterns>"`.
- Run the ArchUnit and targeted suites before S1 to record a baseline. The full suite has no known passing baseline, so failures unrelated to this change are recorded, not fixed.

Why this level: the logic is service-level and fully mockable, so Mockito unit tests give fast proof per AC. The SQL backfill and sync are PostgreSQL-specific and data-critical, so they need a real PostgreSQL instance rather than H2 mocks.

### sis-product-sis-frontend

Existing infrastructure: Karma 6 with Jasmine 3.10 (`karma.conf.js`, `src/test.ts`, `package.json` `"test": "ng test"`), Angular 13.0.1. 755 spec files, mostly generated "should create" shells with no known passing baseline. Node 16 required (`.nvmrc`); `nvm` has 16.20.2.

Plan:
- `requisite-inheritance-status.component.spec.ts`:
  - inherited text when `overridden=false`;
  - overridden text plus reset button when `overridden && !readOnly`;
  - no button when `readOnly`;
  - `resetConfirmed` emitted only after the dialog returns `'confirmed'` (mock `GearsDialogService`).
- Service spec (`HttpClientTestingModule`) for `StudyPlanCourseService.resetRequisiteInheritance`: POST to `…/entity-assignments/study-plan-courses/{id}/requisite-inheritance-resets` with `{ruleType}`.
- Build and lint, then the manual screen steps from the AC table for the three levels:
  - loading, success and error states;
  - read-only (the button is hidden);
  - reset confirmation cancel (no call).

Commands (from `C:/Projects/sis-repos/sis-product-sis-frontend`, after `nvm use 16.20.2`):
- `npx ng test --watch=false --browsers=ChromeHeadless --include="src/app/shared/components/requisite-inheritance-status/**/*.spec.ts" --include="src/app/shared/services/study-plan-course.service.spec.ts"`
- `npx ng lint`
- `npm run build`

### Cross-repo
- Contract check against the locally running backend with S4 applied and the frontend on `ng serve`:
  - For each level, call the reset endpoint from the UI and confirm the network response carries the 3 flags and the tab reloads.
  - Confirm `GET` record responses carry the 3 flags.
  - Confirm a user without `UPDATE` on the module gets the existing authorization error.
- Rollout check: old frontend (base-development) against the new backend performs offering and study-plan creation without error (backward compatibility).

## Implementation order and commits

| Phase | admin-backend commit | frontend commit |
|---|---|---|
| S1 | `GSIS-28778 S1: never reuse foreign requisite row ids on create` (characterization tests, RC-2 regression tests, guard) | none |
| S2 | `GSIS-28778 S2: requisite override marker per rule type per level` (002026, 002027, entities, DTOs, marking, tests) | none |
| S3 | `GSIS-28778 S3: push requisite rules down on save, skip overrides` (service, hooks, seed move, 002028, AC-1/3/4/5 tests) | none |
| S4 | `GSIS-28778 S4: reset requisite rules to inherited` (endpoints, DTOs, i18n, tests) | `GSIS-28778 S4: requisite inherited/overridden indicator and reset` |

Each commit compiles and passes its targeted tests on its own. Liquibase numbers are re-checked against `origin/base-sandbox-qa`, `origin/gcet-sandbox-qa` and `origin/gutech-sandbox-qa` immediately before the S2 commit.

## Findings (not fixed, out of scope)
- `StudentStudyPlanCourseRequisiteSeedHelper.java:76-77` swallows every exception at INFO (D-14). Inside its own `@Transactional`, a repository exception can still surface as `UnexpectedRollbackException`.
- A header save with the co-requisite tab not yet loaded can delete master co-requisites (`CourseMasterServiceImpl:330-341`); this is pre-existing, and after this change the deletion cascades.
- `admin.error.notFound.courseOfferingCourseNotFound` / `studentStudyPlanCourseNotFound` are thrown but missing from `i18n/en.json` (added here because the reset reuses them).
- The per-level requisite `createList` trusts each row's own parent ID (`studyPlanCourseId` etc.) from the client.

## Open Questions

All have defaults; the design proceeds on the defaults. None needs another team.
1. **Developer-only, D-13.** Should Programme Study Plan inherit offering rules unfiltered (default), or projected onto the courses offered to the programme/MMS? The default can make an inherited co-requisite group name a course outside the programme, which the validator treats as unsatisfiable (`StudentCourseCoRequisiteValidationServiceImpl:146-156`); the remedy is an SP override.
2. **Developer-only, D-11.** "Deliberately deleted after creation" tolerance: default 10 minutes after the record's `created_at`.
3. **Developer-only, D-10.** Should pushes reach completed, inactive and transition student plans and CT applicant plans? Default yes, because validators fall back to any plan.

## Risk

High. The change adds a schema change and set-based data migration over all offering, study-plan and student requisite tables across tenants. It adds a synchronous cascade from Module Master saves into student plans that feed registration validation, and it adds override semantics that change how existing edits propagate.

## Status

READY_FOR_IMPLEMENTATION. Two steps must come first: lock D-7 to D-16, and have the human confirm the repos to change (sis-product-sis-admin-backend, sis-product-sis-frontend). The open questions are developer-only and have stated defaults.