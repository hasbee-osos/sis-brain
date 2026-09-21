# Evaluation

Ticket: GSIS-20755
Iteration: 1

## Verdict

**PASS**

| Repo | Result | Note |
|---|---|---|
| sis-product-sis-admin-backend | PASS | Diff is exactly the 2 production files the plan named plus 2 test files; fix independently proven by executed evidence (below) |
| Cross-repo consistency | N/A | Single `change` repo per D-5; `sis-product-sis-frontend` working tree clean, no stray changes in any other workspace repo; REST contract unchanged |
| Project conventions | PASS | `engineering-standards` → database: `VARCHAR(1000)` for descriptions, script in `V2/1-table_modifications`, next free 6-digit number, no "changelog" in the filename, `preConditions` guard, no Hibernate auto-update. One cosmetic nit (changeset `author="claude"`) |
| Locked decisions | PASS | D-1…D-5 all followed; none contradicted, none needed superseding |
| Ticket outcome | PASS | Root cause re-derived and confirmed end to end; fix proven to work pre/post by the evaluator's own executed counterfactual and by applying the real changeset to a real PostgreSQL. The committed regression test itself is written but unexecuted — see Non-Blocking Finding 1 |

## Blocking Findings

- None.

## Non-Blocking Findings

1. **[sis-product-sis-admin-backend] The implementation report's environment-gap diagnosis is wrong, though its conclusion ("tests written, not executed") is right.** The evaluator could not reproduce a `compileJava` stall: `./gradlew test --tests com.ubs.sis.mainexam.service.GPAScaleDescriptionLengthIT --tests com.ubs.sis.mainexam.domain.GPAScaleTest --no-daemon` completed `:compileJava` and reached `:compileTestJava FAILED` in **3 m 46 s** (the implementor killed attempt 1 at ~3 min and attempt 2 at 33 s — before the compile's normal finish time). The real blocker is **50 pre-existing compile errors in unrelated test sources** (e.g. `MmsMasterServiceUT.java:86` `setCreditPoints(float)` — the DTO has no such field; `DateUtilsSemesterDateTest.java:30` `ZonedDateTime.toZonedDateTime()`; ~30 `constructor … cannot be applied to given types` in `*UT`/`*Test`/`UserServiceFacadeIT`). Because Gradle compiles the whole test source set, **no test in this repo can run** until those are fixed — which is out of scope here. Consequence: the report's recommendation "run on CI" would not help, and `gradle build -x test` would hit the same `compileTestJava` failure. Neither new test file appears in the error list, i.e. both new tests compile cleanly.
2. **Liquibase changeset `author="claude"`** (`…/002018-increase-gpa-scale-description-length.xml:7`). Every other changeset in `1-table_modifications` uses a developer handle (`thusitha`, `nifrad`, `kasun`, `reshan`…). `author` is part of the changeset identity, so change it before the PR rather than after it is applied anywhere.
3. **`GPAScaleDescriptionLengthIT` uses `setType("PERCENTAGE")`**, which is not a `GPAScaleType` value (`MARKS`, `GRADE` — `com/ubs/sis/mainexam/domain/enums/GPAScaleType.java`). Harmless (the entity field is a plain `String`), but unrealistic fixture data.
4. **Plan inaccuracy, in the safe direction:** the plan lists `GET /api/v1/gpa-scale/basic-info-details` consumers (Study Plan, Assessment Planning) as dependent readers. `getBasicInfoList()` in `sis-product-sis-frontend/src/app/shared/services/examination/gpa-scale-master-service.ts:27` has **no callers** anywhere in `src/app`, and the backend mapping is a plain pass-through (`GPAScaleMasterServiceImpl.java:296`). The regression surface is therefore even smaller than claimed.
5. The codebase-map note on GSIS-28778 (`sis-brain/codebase/sis-product-sis-admin-backend.md`) is misleading for this repo today: `compileJava` is slow and memory-hungry (~4 min, >2 GB) but does finish; what actually blocks `gradle test` is the broken test source set.

## Required Changes

- None blocking. If the final fix round runs, it should (a) correct the "Verification Evidence" section of `implementation-report-1.md` per Finding 1, and (b) set the changeset `author` to the developer's handle per Finding 2. Neither was re-evaluated.

## Recommended Changes

- Raise a separate defect for the 50 broken test sources in `sis-product-sis-admin-backend` — the whole backend test suite has been unrunnable (`MmsMasterServiceUT` last touched 2024-07-09, `DateUtilsSemesterDateTest` 2026-05-27). Do not fix it inside this ticket.
- Use `"MARKS"` in the IT fixture (Finding 3).
- Carry the plan's two follow-ups into the PR description: the shared `gears-alert.service.ts` `DATA_SAVING_ERROR → "Some entities are assigned to this X"` mapping is misleading app-wide, and a >1000-char description (API-only) still produces the same misleading toast.
- Keep the planned manual QA re-run on `base-sandbox-qa` as the acceptance evidence for the UI path (create and edit), since no automated test can execute in this repo.

## Decisions Checked

| ID | Decision | Followed? | Note |
|---|---|---|---|
| D-1 | Routing: base line, bugfix, `base-development` → `base-sandbox-qa` | YES | Branch `base/bugfix/GSIS-20755-gpa-scale-description-save-error`, commit `30504a0cf329c7651a1eda9186d7448303a7ef43` on top of `origin/base-development` |
| D-2 | Root cause: description column 200 vs advertised 1000 → 5100 → misleading toast | YES | Re-derived independently by the evaluator from `000030-create-sis-exam-gpa-scale-table.xml`, `000008-gpa-scale-form-headers.xml`, decompiled commons `BaseService`, and `gears-alert.service.ts` |
| D-3 | Widen to `VARCHAR(1000)`: entity + new Liquibase script, nothing else | YES | `GPAScale.java` `length = 1000`; new `002018-…xml`; diff contains no DTO/service/controller/i18n/frontend change |
| D-4 | Regression IT on H2 + reflection fallback + ArchUnit + manual QA | YES (partly unexecuted) | Both tests written and committed; ArchUnit irrelevant here (`MasterArchConstant.BASE_PACKAGE` doesn't exist in this repo, no rule sensitive to `@Column` length) |
| D-5 | Single repo `sis-product-sis-admin-backend`, light track | YES | Only that repo has commits/changes; all other repos clean |

## Evidence

Commands the evaluator actually ran (Windows, JDK 17, Gradle wrapper 8.14.5), in `E:\Projects\sis-product-sis-admin-backend` unless stated:

1. `git -C E:/Projects/sis-product-sis-admin-backend diff origin/base-development...HEAD` → exactly 4 files, 92 insertions, 1 deletion. `git status`: only the pre-existing untracked `src/test/java/com/ubs/sis/faculty/`.
2. Liquibase script review: byte-for-byte same shape as `002017-increase-application-attachment-document-type-length.xml`; `002018` is free; XML parses; `db.changelog-master.xml` `includeAll` + `LiquibaseResourceFilter` means no registration needed.
3. `./gradlew test --tests "…GPAScaleDescriptionLengthIT" --tests "…GPAScaleTest" --no-daemon --console=plain` → `BUILD FAILED in 3m 46s`; `:compileJava` **succeeded**, `:compileTestJava FAILED` with 50 errors, all in pre-existing unrelated test files.
4. `./gradlew compileJava compileTestJava --no-daemon --console=plain` → `BUILD FAILED in 1m 32s`, same 50 errors; none in the two new test files.
5. **Fallback test's assertion, executed against the compiled artifact** — reflection over `build/classes/java/main`: `compiled GPAScale.description @Column(name=description, length=1000)` → ASSERT PASS.
6. **Regression test replicated and executed at the persistence layer** — Hibernate 5.6 bootstrapped over all 536 entity classes against H2 1.3.148 with `hbm2ddl.auto=create` (same schema-from-annotations model as `src/test/resources/application.yml`):
   - post-fix entity: save + reload of a 1000-char description → round-tripped at full length.
   - pre-fix counterfactual (classpath shadowed with a locally recompiled `GPAScale` carrying `length = 200`): `org.h2.jdbc.JdbcSQLException: Value too long for column "DESCRIPTION VARCHAR(200)"` — save fails, exactly the exception commons `BaseService` converts to `DATA_SAVING_ERROR` (5100). So `GPAScaleDescriptionLengthIT` is a genuine, non-tautological regression test that would fail before the fix and pass after.
7. **The actual Liquibase changeset applied to a real PostgreSQL** (throwaway `postgres:16-alpine` container, created and removed by the evaluator): pre-state `VARCHAR(200)` + 1000-char insert → `ERROR: value too long for type character varying(200)`; then `liquibase … update` → success; `information_schema.columns` confirms `VARCHAR(1000)`; the same 1000-char insert then succeeds. Widening a varchar in PostgreSQL is catalogue-only (no rewrite, no backfill), matching the plan's regression analysis.
8. Regression surface re-checked: `GPAScale.getDescription()` has exactly one backend reader (pass-through into `GPAScaleBasicInfoDto`), and the frontend `getBasicInfoList()` has no callers at all.

Evidence gaps that remain (none blocking): the committed `@SpringBootTest` IT has never been executed anywhere, because the repo's test source set does not compile (Finding 1) — it can only run after those 50 unrelated test-compile errors are fixed, out of scope here. The ticket's UI behaviour still needs the planned manual QA re-run on `base-sandbox-qa` after deploy. The evaluator did not modify any source, test or configuration file in any product repo.
