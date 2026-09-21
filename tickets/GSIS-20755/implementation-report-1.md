# Implementation Report — GSIS-20755 (iteration 1)

## sis-product-sis-admin-backend

### Changes

1. **`src/main/resources/db/changelog/V2/1-table_modifications/002018-increase-gpa-scale-description-length.xml`** (new) — Liquibase script widening `sis_exam_gpa_scale.description` from `VARCHAR(200)` to `VARCHAR(1000)`. Shape follows `002017-increase-application-attachment-document-type-length.xml` verbatim: `preConditions onFail="MARK_RAN" onError="HALT"` with `tableExists` + `columnExists`, then `modifyDataType`. `002018` verified as the next free number in the folder (`002016`, `002017` exist; nothing claims `002018`). Confirmed no registration is needed: `db.changelog-master.xml:7` does `<includeAll path="db/changelog/V2" resourceFilter="com.ubs.sis.config.LiquibaseResourceFilter"/>`, and `LiquibaseResourceFilter.include()` only checks the file extension is `.xml` — any new `.xml` under `V2` is picked up automatically. Also confirmed by grepping the whole `1-table_modifications` folder for `gpa_scale` that no later changelog already alters the `description` column (000030 create is the only prior definition), matching D-2's evidence.
2. **`src/main/java/com/ubs/sis/mainexam/domain/GPAScale.java:46`** — `@Column(name = COL_DESCRIPTION, length = 200)` → `@Column(name = COL_DESCRIPTION, length = 1000)`.

Cites D-2 (root cause: 200-char column vs 1000-char advertised UI limit → DATA_SAVING_ERROR 5100 → misleading "Some entities are assigned to this GPA Scales" toast) and D-3 (fix: widen to VARCHAR(1000), entity + Liquibase together, nothing else touched). No DTO, mapper, service, controller, i18n or frontend change, per D-3.

### Tests

Per D-4:

- **Primary regression test (new):** `src/test/java/com/ubs/sis/mainexam/service/GPAScaleDescriptionLengthIT.java` — `@SpringBootTest`, follows `administration/service/StructureMasterServiceIT.java`'s style. Saves a `GPAScale` with a 1000-character description via `GPAScaleMasterRepository`, reloads by id, asserts `description.length() == 1000` and full round-trip equality. `src/test/resources/application.yml` uses H2 with `ddl-auto: create` and `liquibase.enabled: false`, so the test schema is generated from the entity annotation — fails today (pre-fix, `varchar(200)`), passes after.
- **Fallback test (new):** `src/test/java/com/ubs/sis/mainexam/domain/GPAScaleTest.java` — plain JUnit 5 reflection test asserting `GPAScale.class.getDeclaredField("description").getAnnotation(javax.persistence.Column.class).length() == 1000`. Added per D-4's explicit fallback provision, with the environment-gap reason recorded in its own Javadoc.
- **ArchUnit master suite:** intended to run (`com.ubs.sis.archunit.*`) but could not be executed — same environment gap below. Reviewed `MasterArchUnitTest.java` by hand: none of its rules are sensitive to a `@Column` length change (package/layer placement only), so no reason to expect a regression — analysis, not an executed result.

### Verification Evidence — environment gap (not claiming tests passed)

- **Command attempted (twice):** `gradle -p sis-product-sis-admin-backend test --tests "com.ubs.sis.mainexam.service.GPAScaleDescriptionLengthIT" --tests "com.ubs.sis.archunit.*"`, and a narrower `gradle -p sis-product-sis-admin-backend compileJava compileTestJava`, both `--no-daemon`.
- **Actual result: `compileJava` never completed in either attempt.** Both times the daemon entered a sustained high-CPU, unbounded-memory state (attempt 1: CPU 4s→369s, working set 2.0GB+ over ~3 min, no task past `> Task :compileJava`; attempt 2: CPU reached 122s, working set passed 1.0GB within 33s, growing faster). Both processes were stopped rather than left running, per the codebase notes' time-box instruction (a prior attempt is documented as having run for hours). Matches the documented **GSIS-28778** Lombok/MapStruct/Hibernate annotation-processing stall, reproduced independently twice.
- No Gradle test evidence exists for this environment — **not claiming any test passed.** Both `GPAScaleDescriptionLengthIT` and `GPAScaleTest` are written, committed, and ready to run once the environment gap is fixed or on CI.
- **Liquibase script:** not executed (no PostgreSQL in this workspace, per the plan). Verified instead by: (a) XML well-formedness (parsed cleanly); (b) structural comparison against `002017-…` (same `preConditions`/`modifyDataType` shape); (c) confirming `LiquibaseResourceFilter` auto-includes any new `.xml` in `V2` with no registration step, and no other changelog already touches `sis_exam_gpa_scale.description`.

### Diff Summary

```
git -C sis-product-sis-admin-backend show --stat HEAD
 src/main/java/com/ubs/sis/mainexam/domain/GPAScale.java                                | 2 +-
 .../V2/1-table_modifications/002018-increase-gpa-scale-description-length.xml (new)    | 18 ++++++++
 src/test/java/com/ubs/sis/mainexam/domain/GPAScaleTest.java (new)                       | 32 +++++++++
 src/test/java/com/ubs/sis/mainexam/service/GPAScaleDescriptionLengthIT.java (new)       | 41 +++++++++
 4 files changed, 92 insertions(+), 1 deletion(-)
```
Committed as `30504a0cf3` on `base/bugfix/GSIS-20755-gpa-scale-description-save-error`, not pushed (orchestrator handles push at PR stage). `git status` after commit shows only the pre-existing, unrelated untracked `src/test/java/com/ubs/sis/faculty/` folder (not created by the implementor, not staged, not touched) — the working tree is otherwise clean.

## Acceptance Criteria (bug — regression proof)

- Ticket's expected behaviour ("a long description should save successfully") is proven by `GPAScaleDescriptionLengthIT.save_persistsFull1000CharacterDescription`, which asserts a 1000-character description round-trips through `GPAScaleMasterRepository`. Could not be executed in this workspace (environment gap above); written and ready to run once `compileJava` is unblocked or on CI, where it will fail without the fix (H2 rejects >200 chars on `varchar(200)`) and pass with it.
- No manual UI verification attempted, per the plan's instruction that this is a human/QA step after deploy.

## Cross-Repo Consistency

Single repo changed (`sis-product-sis-admin-backend`), per D-5. `sis-product-sis-frontend` needed no change — it already allows 1000-character descriptions client-side. No REST contract change.

## Deviations

None from the plan's Change section. The only addition beyond the plan's primary test is the fallback test (`GPAScaleTest.java`), which the plan itself names as the explicit fallback for exactly this environment condition (D-4) — not a scope deviation.

## Findings

- None new. The plan's own recorded follow-up recommendations stand as-is and are out of scope here: (1) the shared `gears-alert.service.ts` `DATA_SAVING_ERROR` → "Some entities are assigned to this X" mapping is misleading for every screen, not just this one; (2) a description longer than 1000 characters, reachable only by calling the API directly, would still surface the same misleading 5100 toast.

## Codebase map corrections

- `sis-brain/codebase/sis-product-sis-admin-backend.md`'s GSIS-28778 note held up exactly: reproduced twice in this session, both times with the identical signature. Worth flagging for whoever fixes GSIS-28778 that the failure is reproducible almost immediately (under a minute), not just after a long wait. (No note edit needed — the existing note already says to time-box and report; this is a confirmation, not a correction.)

## Status

**BLOCKED_ON_ENVIRONMENT for executed test evidence; code change and tests are complete and committed.** The Liquibase script and entity change are implemented exactly per D-3, scoped to the two files the plan named plus the two test files per D-4. Both new tests are written but unexecuted due to the pre-existing, documented GSIS-28778 Gradle/annotation-processing environment gap in this workspace, reproduced independently twice. Recommend the Evaluator (or CI, which does build the project even though it skips tests — `gradle build -x test`) attempt the `GPAScaleDescriptionLengthIT` and ArchUnit runs in an environment where `compileJava` completes; if CI's `-x test` build at least compiles cleanly, that is stronger compilation evidence than anything available here.
