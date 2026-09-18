# Evaluation

Ticket: GSIS-28778
Iteration: 1

## Verdict

FAIL

One-sentence reason: the locked, human-confirmed scope of D-4 (RC-2 **plus** AC-1…AC-5 as phases S1–S4) is only partly delivered — S2, S3, S4 and the AC-5 tests are absent with no superseding decision, so the Jira-reported symptom (no propagation from Module Master) is untouched — and separately no test was executed anywhere, so even the delivered slice (S1 + D-18) is unproven.

| Repo | Result | Note |
|---|---|---|
| sis-product-sis-admin-backend | FAIL | S1 guard + D-18 restructure are correct on inspection, but S2/S3/S4 of the locked scope are missing and zero tests ran (no `build/classes/java/test`, no `build/test-results`). |
| sis-product-sis-frontend | FAIL | D-18 `dataLoaded` guard is sound and `ng build` is corroborated, but the load-bearing method (`generateReq`) has no test, no spec executed, and S4 is not delivered. |
| Cross-repo consistency | PASS | D-18 both halves agree (backend: null list = untouched; frontend: sends the list only after load). No wire contract changed; old frontend with new backend unaffected; new frontend with old backend equals today's behaviour, so deploy order is not made worse. Context repos carry no ticket branch or ticket-related change. |
| Project conventions | PASS | Constructor injection kept, `@Slf4j` untouched, util placed in an existing package precedent (`administration/util/TeachingWeekSemesterOverlapUtil.java`), no schema change so no Liquibase needed, no authorization surface touched, no `console.log`, no commented-out code, comments cite the decision IDs. |
| Locked decisions | FAIL | D-4 contradicted without a superseding record; D-15 not satisfied (no execution, no container, no Karma run). |
| Ticket outcome | FAIL | Bug: the fix is not proven by an executed regression test, and per D-3 the reported symptom needs S2/S3, which were not built. |

## Blocking Findings

- **E-1 [both repos] D-4 is contradicted without a superseding record.** D-4 (LOCKED, human-confirmed) puts RC-2 *and* AC-1…AC-5 in this ticket as S1–S4. Iteration 1 delivers S1 and the D-18 guard only; the override marker (S2), push cascade and Liquibase 002026–002028 (S3), reset endpoints plus frontend indicator (S4) and the AC-5 validator regression tests do not exist in either diff. The implementation report calls this an "implementation-scope note" and states "Contradicted: none"; per the ground rules an unsuperseded departure from a locked decision is blocking. Since D-3 established that the reported propagation behaviour was never built, none of the five Jira ACs, and therefore not the user-visible defect in the ticket, is addressed by what was committed.
- **E-2 [admin-backend] No executed evidence for the RC-2 fix; the D-15 "fails before, passes after" flip was argued, not run.** The environment failure is genuine and is *not* caused by the new code: `build/classes/java/main` contains 0 class files, there is no `build/classes/java/test` and no `build/test-results`, and the orchestrator's background run was still regenerating annotation-processor sources with no compiler error — main sources never compiled in this workspace at all, before or after the change. Test-compilation status is therefore unknown. Static review supports the implementor's argument (the generated mapper line `courseOfferingCourseCoRequisite.setId(entityRequest.getId())` means the three `RC2_` tests would fail on `f0230d6ceb`), but that is reasoning, not evidence.
- **E-3 [frontend] The D-18 frontend behaviour has no test at all, and no spec was executed.** The guard that matters is `AddViewEditCourseComponent.generateReq()` (`req.courseCoRequisite = null` when `!coRequisiteComponent?.dataLoaded`). The new spec only tests the `dataLoaded` flag on `CourseCoRequisiteComponent`; nothing covers the host, and Karma reported "Executed 0 of 0". `ng build` (corroborated by `dist/fuse` written today) type-checks but proves no behaviour.

## Non-Blocking Findings

- **N-1 [frontend] New silent-discard failure mode.** On a co-requisite GET error `dataLoaded` stays false permanently, yet the tab still allows add and remove; a header Save then drops the user's rows with no message (previously they were posted). Same for a Save raced against a slow load after the user edited the tab.
- **N-2 [frontend] The identical race at Dept/Module Offering is unguarded.** `add-view-edit-course-offering-course.component.ts` re-posts co-requisites on every header save. D-18 is scoped to Module Master, so this is not a contradiction, but the design's own regression list says it becomes a persistent empty override once S2/S3 land.
- **N-3 [admin-backend] `CourseMasterServiceImplRequisiteGuardTest` is real but brittle.** `mock(CourseMasterServiceImpl.class, CALLS_REAL_METHODS)` plus `Field.set` on the private final `courseCoRequisiteService` plus reflective invocation of the private method does execute production code, but a rename of either member breaks it silently and it never exercises the public create/update path that receives the request. `@InjectMocks` would resolve the about-40-argument constructor.
- **N-4 [admin-backend] The RC-2 test name overstates what it asserts.** It only asserts the saved entity's id is null. Add a verification that the foreign row is never deleted, and assert the new row's parent.
- **N-5 [admin-backend] Three of the six guarded `createList` methods have no test** (offering pre-requisite, student co and pre). This matches the design, but those paths also gained `@Transactional` with no coverage.
- **N-6 [admin-backend] Tests instantiate generated MapStruct `*MapperImpl` classes directly.** Honest for reproducing the id-copy defect, but it couples test compilation to annotation-processor output, the step that does not complete here.
- **N-7 [admin-backend, pre-existing] The ArchUnit safety net is vacuous.** `MasterArchConstant.BASE_PACKAGE = "com.ubs.sis.admin.master"` does not exist in this codebase (packages are `com.ubs.sis.administration`), so the rules import an empty class set and cannot fail. The design's "new code must pass ArchUnit" gives no protection.

## Required Changes

1. Resolve E-1: either implement S2, S3, S4 and the AC-5 regression tests per the design, **or** write a decision superseding D-4 with a reason, get the human confirmation D-4 required, and re-scope this ticket to RC-2 plus D-18 with a stated route for AC-1…AC-5. Do not leave the gap recorded only as a report note.
2. Resolve E-2: execute, on a machine or CI runner where this module builds, the four named test classes on the branch, and a run of the three `RC2_` tests against `f0230d6ceb` showing them fail. Paste actual output into the report.
3. Resolve E-3: add a test that proves `AddViewEditCourseComponent.generateReq()` sends `courseCoRequisite = null` before the tab loads and the real list after; if Karma cannot be started, replace it with an exactly scripted manual step on a running app and record the observed network payload.

## Recommended Changes

- N-1: gate on `dataLoaded || isCoRequisiteChange`, or tell the user the tab failed to load, so co-requisite edits are never silently dropped.
- N-3 and N-4: restructure the D-18 backend test toward `@InjectMocks` and the public save path, and tighten the RC-2 assertions.
- Record N-2 and N-7 as findings in the brain so they are not rediscovered in S3.

## Decisions Checked

| ID | Decision | Followed? | Note |
|---|---|---|---|
| D-1 | Bug, Flow A, branch from base-development | YES | Both repos on the ticket branch, clean trees, 2 backend and 1 frontend commit off `origin/base-development`. |
| D-2 | RC-2 root cause: createList re-uses foreign row ids | YES | Confirmed independently: the generated mapper copies the posted id; pre-fix `createList` mapped straight to `saveAll`. |
| D-3 | Propagation and override marker were never built | YES (as analysis) | And therefore untouched by this iteration — see E-1. |
| D-4 | Scope = RC-2 plus AC-1…AC-5 as S1–S4, one branch | **CONTRADICTED** | Only S1 and D-18 delivered; no superseding record. |
| D-5, D-6, D-8, D-9, D-11, D-12, D-13, D-14, D-16 | S2/S3/S4 design | N/A | Not reached this iteration; nothing in the diff contradicts them. |
| D-7 | Guard in the six per-level `createList`, owned ids kept, `@Transactional` added | YES | All six services changed exactly as specified; existing rows loaded once from the parent (soft-deleted excluded), foreign ids nulled before the unchanged delete-unlisted and `saveAll` logic. Delete-unlisted unaffected. Edit flows keep owned ids. All six callers set the parent id, so no orphan or duplicate insert. The offering co and pre `createList` is not exposed by any controller, so the guard cannot be reached with a null parent id from outside. Frontend untouched in S1, as D-7 requires. |
| D-10 | Cascade synchronous and transactional | N/A | Not built. The new `@Transactional` on `createList` is consistent with it and does not change rollback semantics for the seed-helper callers. |
| D-15 | Characterization first, RC-2 flip executed, PostgreSQL 14 container, Karma spec | **NOT FOLLOWED** | Tests written but none executed; no container (Docker down, not needed this iteration); Karma "Executed 0 of 0". |
| D-17 | Only admin-backend and frontend change | YES | The six context repos have no ticket branch and no ticket-related change. |
| D-18 | Empty master co-requisite save must not wipe rules | YES (code), unproven (test) | Backend: the delete-all branch now sits inside the null check, mirroring the pre-requisite branch; null leaves rows untouched, explicitly empty still deletes; the pre-requisite branch is unchanged. Frontend: `dataLoaded` set in create mode and in the success callback of all five load methods, left false on error; the tab is rendered with `[hidden]`, so the ViewChild always exists. See E-3 and N-1. |

## Acceptance Criteria Checked

Included because D-4 pulled the ticket's ACs into this bug's scope.

| AC | Met? | Evidence |
|---|---|---|
| RC-2 (D-2) | NOT EVIDENCED | Guard implemented and correct on inspection in all six `createList` methods; three `RC2_` tests written; never executed, no pre-fix failing run. |
| AC-1 Master save pushed to Offering | NO | S2 and S3 absent from the diff. |
| AC-2 Programme Study Plan inherited display and per-rule override | NO | S2 and S4 absent. |
| AC-3 Student Study Plan inheritance and per-student override | NO | S2, S3 and S4 absent. |
| AC-4 Master rule in force without override | NO | S2 and S3 absent; no backfill. |
| AC-5 Validation reads only the student plan | NOT EVIDENCED | Design says no production change is needed; the three named validator regression tests were not written. |
| D-18 guard | NOT EVIDENCED | Code correct on inspection in both repos; 6 tests written, none executed; the host `generateReq` path untested. |

## Evidence

Read-only commands run by the evaluator (no competing Gradle build started):
- Commit and status checks in both repos: the two backend commits and one frontend commit off `origin/base-development`, clean working trees, ticket branch checked out.
- Diff stats matching the implementation report: 12 files (+695/-46) backend, 3 files (+83/-1) frontend; no unrelated files.
- Full diffs read for both repos, plus the current sources of `CourseMasterServiceImpl.saveCoursePreAndCoRequisite` (279–347), `CourseOfferingCourseCoRequisiteServiceImpl` (25–105), `CourseOfferingCourseServiceImpl.saveCoursePreAndCoRequisite` (405–435), `StudyPlanCourseServiceImpl` (302–324), `StudentTransitionServiceImpl` (300–338), `course-co-requisite.component.ts` (40–252), `add-view-edit-course.component.ts` (300–350, 504–507), `add-view-edit-course.component.html:97`, all four new backend test classes and the frontend spec.
- Compile-safety spot checks (nothing compiles here): the six row DTOs extend `BaseAssignedRequestDto extends BaseRequestDto`; `javap` on gears-commons-lib 0.0.33 confirms `BaseRequestDto.getId()/setId(Long)` and `Response.ok(T)`; the three generated mapper impls referenced by the tests exist; the three service constructors match the test constructor calls; the injected field is a private final instance field (reflection legal on JDK 11).
- Environment corroboration: `build/classes/java/main` has 0 class files; no `build/classes/java/test`; no `build/test-results`; two java processes alive with generated sources rewritten and still no class output twelve minutes later. Frontend `dist/fuse` written today, corroborating `ng build` exit 0. Karma and `ng build` were not re-run, and the "about 22 pre-existing broken specs" claim could not be independently verified.
- Guideline basis: ground-rules, testing, characterization-testing, sis-development-guidelines.md, java-code-review-guidelines.md, and the ArchUnit test and constant (see N-7).

**Evidence that cannot be produced in this environment.** The admin-backend module does not compile here at all — not because of this change (0 class files existed before it too) — so no JVM test can be executed, and Docker's Linux engine is down, so the PostgreSQL checks D-15 requires are impossible. A human or CI runner must run, on a machine where this project is known to build: (1) `gradle compileJava compileTestJava`; (2) the four named test classes on the branch; (3) the three `RC2_` tests against `f0230d6ceb` to record the pre-fix failure; (4) `npx ng test` for `course-co-requisite` plus the new `generateReq` proof (which first requires the unrelated broken specs to be excluded or repaired). Items 2–4 are what E-2 and E-3 need and cannot be closed by another iteration in this workspace; E-1, by contrast, is actionable here and by itself justifies the FAIL.
