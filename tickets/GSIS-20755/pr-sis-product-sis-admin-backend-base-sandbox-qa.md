## Jira

[GSIS-20755](https://gearsjira.atlassian.net/browse/GSIS-20755) — "Some entities assign to this program" message displayed when click on save by entering lengthy description for the GPA scale master description

## Summary

On Exam Controller → Administration → GPA Scales Master, saving a row with a description longer than 200 characters failed with the unrelated toast "Some entities are assigned to this GPA Scales" and the record was not persisted.

**Root cause:** `sis_exam_gpa_scale.description` was `VARCHAR(200)`, but the screen's own form definition (`field_validation.max_length`) tells the UI the field may hold 1000 characters. The browser accepted up to 1000 chars, PostgreSQL rejected anything over 200, and the commons `BaseService` catch-all turned that DB error into business status `5100 DATA_SAVING_ERROR`, which the shared Angular alert service renders as "Some entities are assigned to this GPA Scales" for any unclassified save failure on any screen — not an actual usage conflict.

## Implementation (this repo)

- `src/main/resources/db/changelog/V2/1-table_modifications/002018-increase-gpa-scale-description-length.xml` (new) — widens `sis_exam_gpa_scale.description` to `VARCHAR(1000)`, following the existing `002017-…` script's shape (`preConditions` guard, `modifyDataType`).
- `src/main/java/com/ubs/sis/mainexam/domain/GPAScale.java` — `@Column(length = 200)` → `@Column(length = 1000)`.

No DTO, mapper, service, controller, i18n or frontend change — the frontend already allows 1000-character input for this field.

## Tests (this repo)

- `src/test/java/com/ubs/sis/mainexam/service/GPAScaleDescriptionLengthIT.java` (new) — `@SpringBootTest` regression test: persists a 1000-character description through `GPAScaleMasterRepository` and asserts a full round-trip. Written to fail pre-fix and pass post-fix.
- `src/test/java/com/ubs/sis/mainexam/domain/GPAScaleTest.java` (new) — reflection fallback asserting the `@Column` annotation is `length = 1000`.
- Neither test could be executed in this repo: the whole backend test source set fails to compile due to **~50 pre-existing, unrelated compile errors** in other test files (e.g. `MmsMasterServiceUT.java`, `DateUtilsSemesterDateTest.java` — see Evaluator section). This is a pre-existing repo-wide issue, not something introduced by this change; recommend raising it as a separate ticket.

## Verification (actual evidence)

The evaluator independently proved the fix works, since the repo's own test suite cannot run:

- **Hibernate/H2 counterfactual** (bootstrapped over all 536 entity classes, `hbm2ddl.auto=create`, matching the test schema style): post-fix entity round-trips a 1000-char description; pre-fix entity (`length = 200`) fails with `Value too long for column "DESCRIPTION VARCHAR(200)"` — exactly the exception the app converts into the misleading toast.
- **Real PostgreSQL**: applied the actual `002018-…xml` changeset to a throwaway `postgres:16-alpine` container. Before: 1000-char insert → `ERROR: value too long for type character varying(200)`. After `liquibase update`: column is `VARCHAR(1000)`, same insert succeeds.
- Diff confirmed scoped to exactly the two production files plus the two new test files (`git diff origin/base-development...HEAD`).

**Still needed (human/QA step):** manual re-run of the ticket's UI steps on `base-sandbox-qa` — GPA Scales Master → Add/Edit → long description → Save → expect success and full persistence.

## Evaluator

**Verdict: PASS** (iteration 1 of 1, light track) — 0 blocking findings.

Non-blocking findings for the reviewer's awareness:
1. The implementor's own environment-gap diagnosis was imprecise — attributed to a `compileJava` stall (GSIS-28778), but the evaluator found `compileJava` completes in ~4 min; the real, unrelated blocker is the ~50 pre-existing test-compile errors above.
2. Liquibase changeset `author="claude"` — every other changeset in the folder uses a developer handle; please update to your own handle before merge.
3. `GPAScaleDescriptionLengthIT` sets `type` to `"PERCENTAGE"`, not a real `GPAScaleType` value (`MARKS`/`GRADE`). Harmless (plain `String` field) but should use a realistic value.
4. The plan's regression-surface note about `GET /api/v1/gpa-scale/basic-info-details` consumers turned out to be overstated — that method has no callers in the frontend, so the regression surface is smaller than described.

## Iterations

1 (light track — 1 evaluation round scheduled, PASS on the first round; no final fix round needed).

## Related PRs

None — single repo (`sis-product-sis-admin-backend`) changes; `sis-product-sis-frontend` and all other product repos are context-only, no change required.

## Notes — next human steps

- **Fix before merge (non-blocking, reviewer's call):** update the changeset `author` (Finding 2) and optionally the fixture's `type` value (Finding 3).
- **Manual QA re-run** on `base-sandbox-qa` after this PR is promoted: GPA Scales Master, create and edit paths, description > 200 chars.
- **Follow-ups out of scope for this ticket**, recorded for a future ticket if the team wants them: (a) the shared `gears-alert.service.ts` `DATA_SAVING_ERROR` → "Some entities are assigned to this X" mapping is misleading for every screen whenever an unclassified save exception occurs, not just this one; (b) a description longer than 1000 characters — reachable only by calling the API directly, bypassing the UI's own limit — would still surface the same misleading toast; (c) raise a separate defect for the ~50 broken test-compile errors blocking the whole backend test suite from running.
- Standard harness scope limits apply: this PR targets `base-sandbox-qa` only. Promotion to `base-qa`, any port onto GCET/GUTech lines, and the eventual merge back into `base-development` are human steps, not done by the harness.

---
*Prepared by the engineering harness (Planner → Implementor → Evaluator). Branch: `base/bugfix/GSIS-20755-gpa-scale-description-save-error` → `base-sandbox-qa`.*
