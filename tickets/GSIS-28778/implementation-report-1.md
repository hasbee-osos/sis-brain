# Implementation Report

Ticket: GSIS-28778
Iteration: 1
Branch: base/bugfix/GSIS-28778-module-relationship-rule-propagation (cut from origin/base-development)
Status: **BLOCKED (partial)** — S1 and D-18 implemented and committed; S2, S3, S4 not implemented; no test was executed.

## sis-product-sis-admin-backend

Commits (verified by the orchestrator against `origin/base-development..HEAD`):
- `3144ba0553` GSIS-28778 S1: never reuse foreign requisite row ids on create
- `3b22bd5341` GSIS-28778: guard against empty Module Master co-requisite save wiping rules (D-18)

Diff: 12 files changed, 695 insertions(+), 46 deletions(-). No unrelated files.

### Changes
- `administration/util/RequisiteRequestIdGuard.java` (new): static `clearForeignIds(rows, ownedIds)` nulls any posted row id that is not one of the calling parent's own live row ids (per D-7).
- `createList` in `CourseOfferingCourseCoRequisiteServiceImpl`, `CourseOfferingCoursePreRequisiteServiceImpl`, `StudyPlanCourseCoRequisiteServiceImpl`, `StudyPlanCoursePreRequisiteServiceImpl`, `student/service/impl/StudentStudyPlanCourseCoRequisiteServiceImpl`, `StudentStudyPlanCoursePreRequisiteServiceImpl`: loads the parent's live rows once, calls the guard before the existing delete-unlisted / `saveAll` logic (otherwise unchanged), and is now `@Transactional`. This is the RC-2 defect of D-2: the generated mapper copies a posted row's id (`CourseOfferingCourseCoRequisiteMapperImpl.mapRequestDtoToEntity:124`), so with IDENTITY ids and no `@Version`, `saveAll` merged a foreign live row onto the new parent.
- `CourseMasterServiceImpl.saveCoursePreAndCoRequisite`: the co-requisite delete-all path is now nested inside the `requestDto.getCourseCoRequisite() != null` check, mirroring the pre-requisite branch above it (per D-18). Previously the delete-all branch could fire when `courseCoRequisite` was null — a pre-existing defect independent of any cascade.

### Tests written (none executed)
- `CourseOfferingCourseCoRequisiteServiceImplTest`, `StudyPlanCourseCoRequisiteServiceImplTest`, `StudyPlanCoursePreRequisiteServiceImplTest`: three `characterization_*` tests each (owned id updated in place; unlisted row soft-deleted; id-less row inserted) plus `RC2_createList_postedForeignRowId_isInsertedAsNewRow_foreignRowUntouched`.
- `CourseMasterServiceImplRequisiteGuardTest`: `characterization_loadedTabWithRows_updatesMasterCoRequisites`, `D18_tabNotLoaded_courseCoRequisiteNull_masterCoRequisitesUntouched`, `D18_loadedTabExplicitlyCleared_masterCoRequisitesDeleted`. Because `CourseMasterServiceImpl` has about 40 unrelated constructor dependencies, the instance is built with `Mockito.mock(..., CALLS_REAL_METHODS)` and the one needed collaborator injected by reflection.
- The guard was also applied to the offering pre-requisite and the two student services as defence, without dedicated tests (the design named only the three classes above).

### Verification evidence — NOT RUN
1. `gradle -p <repo> compileJava compileTestJava --console=plain` (cached Gradle 8.14.5, JDK 11): daemon compiled main sources through repeated Lombok/MapStruct/Hibernate metamodel rounds, then stalled with all execution workers at 0 ms CPU (confirmed with jstack). Not completed.
2. `gradle … compileJava --no-daemon --no-watch-fs`: one worker sustained at 80–90% CPU inside `JavacProcessingEnvironment$Round` for 13+ minutes without finishing; killed.
3. `gradle … test --tests "<the 4 classes>" --tests "com.ubs.sis.archunit.*" --no-daemon --no-watch-fs`: left running across a long pause; jstack showed elapsed about 9.75 hours with the worker idle and `gradle --status` reporting STOPREQUESTED. No `build/test-results` directory was ever produced, so test execution was never reached. Terminated.

No compiler error was produced by any attempt — only non-completion. This matches the design's note that the checkout has no Gradle wrapper jar, has no recorded test baseline, and that CI runs `gradle build -x test`.

Consequences:
- The RC-2 regression test was **not** demonstrated failing before the fix and passing after, as D-15 requires. The implementor's argument is static: on `f0230d6ceb` the pre-fix `createList` maps posted rows straight through the mapper, which sets the posted id, so the test's assertion that the saved entity's id is null would fail; after the guard it passes. That is reasoning from the unmodified code path, not an executed run.
- ArchUnit suite: NOT RUN (bundled into attempt 3).
- PostgreSQL 14 container verification of the Liquibase changesets: NOT ATTEMPTED — Docker's Linux engine is not running (`docker ps` fails with `open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified`). Not applicable this iteration anyway, since S2/S3 were not implemented.
- D-10 performance check (stop if a Module Master save exceeds 10 s): NOT RUN, needs realistic data volumes.

## sis-product-sis-frontend

Commit: `0ed3c50a42` GSIS-28778: guard against empty Module Master co-requisite save wiping rules (D-18). Diff: 3 files changed, 83 insertions(+), 1 deletion(-).

### Changes
- `course-master/requisite/course-co-requisite/course-co-requisite.component.ts`: new `dataLoaded` field, set true immediately in `setHeaders` when `id === 0` (create mode) and in the success callback of all five `loadData*` methods; left false on a load error.
- `course-master/add-view-edit-course/add-view-edit-course.component.ts` `generateReq()`: calls the co-requisite component's save (and so sends a co-requisite list) only when `dataLoaded` is true; otherwise sets `req.courseCoRequisite = null`. This is the frontend half of D-18.

### Tests written (none executed)
- `course-co-requisite.component.spec.ts`: a new describe block with `D18_createMode_hasNothingToLoad_dataLoadedImmediately`, `D18_editMode_dataLoadedStaysFalseUntilTheTabsOwnResponseArrives`, `D18_editMode_loadError_dataLoadedStaysFalse`. The component is instantiated directly with jasmine spies, because the existing spec shell has no providers configured.
- No spec for `AddViewEditCourseComponent.generateReq()`: it extends a heavy base page class whose own spec shell is also broken. Covered only by a manual step, which was not performed.

### Verification evidence
- `ng build --build-optimizer=false` (Node 16.20.2): **PASSED**, exit 0, hash 785097c1d360f880, 266620 ms. Only pre-existing CommonJS warnings. This type-checks both changed components through the AOT compiler but does not run any spec.
- `ng test --watch=false --browsers=ChromeHeadless --include="…/course-co-requisite/**/*.spec.ts"`: **NOT RUN** — "Executed 0 of 0". The Karma/webpack TypeScript compile fails on about 22 pre-existing broken spec files elsewhere in the app (for example a missing module import in an admission eligibility-criteria spec, generic type argument errors in a shared assign-component spec, a default-export mismatch in an examination model spec). None are files this ticket touches.
- `ng lint`: NOT RUN (not attempted).

## Acceptance criteria

| AC | Implemented | Test | Result |
|---|---|---|---|
| RC-2 (D-2) | yes, backend S1 guard in 6 `createList` methods | `RC2_…_foreignRowUntouched` in 3 classes | written, **not executed** |
| AC-1 master save pushed to offering | **no** (S2+S3 not built) | — | not delivered |
| AC-2 programme study plan inherited display and override | **no** (S2+S4 not built) | — | not delivered |
| AC-3 student study plan inheritance and override | **no** (S2+S3+S4 not built) | — | not delivered |
| AC-4 master rule in force without override | **no** (S2+S3 not built) | — | not delivered |
| AC-5 validation reads only the student plan | no production change needed per design | the three named validator regression tests were not written | not evidenced |
| D-18 guard | yes, both repos | `CourseMasterServiceImplRequisiteGuardTest` (3), frontend spec block (3) | written, **not executed** |

## Cross-repo consistency

D-18 is delivered on both sides: the backend leaves master co-requisites untouched when the list is absent (null), and the frontend sends the list only once the tab has loaded. Old frontend with new backend is unaffected, because the old frontend always sent a list. No contract changed on the wire; the marker fields and reset endpoints of D-12 were not built.

## Decisions

- Followed: D-1, D-2, D-7, D-17, D-18 (and D-4's phase order as far as it went).
- Contradicted: none.
- Proposed: none. The implementor records as an implementation-scope note that S2, S3 and S4 were not attempted.

## Deviations from design

1. **S2 (override marker), S3 (push cascade and Liquibase 002026–002028) and S4 (reset endpoints plus the frontend indicator) are not implemented.** The implementor's stated reason: with the backend build never completing and Docker unavailable, none of that code could be compiled, tested or debugged in this environment, so writing it would have produced a large volume of unverified code against the ground rule that compilation is not verification. It delivered the two self-contained pieces instead: S1 (the reported defect) and the D-18 guard.
2. The AC-5 validator regression tests were not written, on the same reasoning. Carried to iteration 2.

## Findings (not fixed)

- `StudentStudyPlanCourseRequisiteSeedHelper.java:76-77` swallows every exception at INFO inside its own transaction (out of scope per D-14).
- `admin.error.notFound.courseOfferingCourseNotFound` and `studentStudyPlanCourseNotFound` are thrown but missing from `i18n/en.json`; only relevant once S4's reset endpoints reuse them.
- **Environment:** the backend Gradle build does not complete in this workspace (three attempts, including one left for about 9.75 hours), always stalling in annotation processing with no compiler error. The frontend Karma suite cannot start because of roughly 22 pre-existing broken specs unrelated to this ticket. Both block the evidence this ticket's design requires, and both need a machine or CI runner where this project is known to build and test.
