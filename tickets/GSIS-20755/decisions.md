### D-1 — Routing: base line, bugfix, base-development → base-sandbox-qa
- **Stage:** plan, iteration 1
- **Decided by:** harness (from Jira Customer Name) · confirmed by human 2026-09-21T05:24:00Z
- **Options considered:** none — Customer Name field maps unambiguously per `git-workflow`
- **Why:** Jira issue type is Bug; Customer Name field is `Product Core Feature`, which per `git-workflow` → The routing decision maps to line `base`, cut from `base-development`, PR raised against `base-sandbox-qa`
- **Convention cited:** `git-workflow` → The routing decision, → Branch naming
- **Evidence:** Jira GSIS-20755 fields.customFields["Customer Name"] = "Product Core Feature"; fields.issuetype.name = "Bug"
- **Status:** LOCKED

### D-2 — Root cause: GPA scale description column (200 chars) narrower than its own declared UI limit (1000 chars)
- **Stage:** plan, iteration 1
- **Decided by:** planner
- **Options considered:** DB constraint mismatch (this); `MasterBaseService.preUpdateEntity` active→inactive guard; a real "entity in use" check (`RECORD_IN_USE_ERROR`); `createBulk`'s own error wrapper; bean-validation rejection
- **Why:** `sis_exam_gpa_scale.description` is `VARCHAR(200)` (entity + Liquibase) but the GPA_SCALE form-header seed advertises `max_length = 1000` to the UI, so the browser accepts up to 1000 chars, PostgreSQL rejects anything over 200, and the commons `BaseService` catch-all rethrows it as `DATA_SAVING_ERROR` (business status 5100), which `gears-alert.service.ts` renders as "Some entities are assigned to this GPA Scales" for every screen, not just this one. Falsifiable: a 201-char description fails today; ≤200 chars succeeds.
- **Convention cited:** n/a (root cause, not a convention)
- **Evidence:** `sis-product-sis-admin-backend/src/main/java/com/ubs/sis/mainexam/domain/GPAScale.java` (`@Column(length = 200)`); `.../db/changelog/V2/1-table_modifications/000030-create-sis-exam-gpa-scale-table.xml`; `.../V2/2-headers/007-examination/000008-gpa-scale-form-headers.xml` (`max_length = 1000`); `sis-product-sis-frontend/src/@gears-commons/services/gears-alert.service.ts` (`DATA_SAVING_ERROR` → `message.delete.someEntitiesAssignedToThisComponent`); `sis-product-sis-admin-backend/src/main/resources/i18n/en.json:502,2834`
- **Status:** LOCKED

### D-3 — Fix: widen `sis_exam_gpa_scale.description` to VARCHAR(1000) (entity + new Liquibase script)
- **Stage:** plan, iteration 1
- **Decided by:** planner
- **Options considered:** widen the column to 1000 (chosen); cap the UI/`field_validation` at 200 instead; change the shared `gears-alert.service.ts` `DATA_SAVING_ERROR` mapping; add `@Size` to `GPAScaleMasterRequestDto`
- **Why:** Aligns storage with the field's own declared UI limit and the team's DB convention for description columns; the two rejected schema-side alternatives either contradict the ticket's expected result or touch a shared service used by every screen, which is out of scope for this bug (recorded as a follow-up recommendation, not fixed here)
- **Convention cited:** `engineering-standards` → database: `VARCHAR(1000)` for descriptions and remarks; every DB modification needs a new Liquibase script, never Hibernate auto-update
- **Evidence:** sibling exam masters already use `VARCHAR(1000)` (`000197-create-sis-exam-credit-category.xml`, `000198`, `000199`); template script `V2/1-table_modifications/002017-increase-application-attachment-document-type-length.xml`
- **Status:** LOCKED

### D-4 — Test strategy: backend regression test persisting a 1000-char description through the repository (H2), plus ArchUnit master suite, plus manual QA re-run on base-sandbox-qa
- **Stage:** plan, iteration 1
- **Decided by:** planner
- **Options considered:** repository-level `@SpringBootTest` IT (chosen primary); fallback plain JUnit reflection test on the `@Column` annotation if the Spring context cannot boot in this environment (known GSIS-28778 `compileJava` stall)
- **Why:** A test that fails before the fix (H2 rejects >200 chars on `varchar(200)`) and passes after is the most direct proof of the fix; ArchUnit master suite is re-run because an entity changed; the frontend has no code change so only needs a manual QA re-run of the ticket's steps, recorded as evidence
- **Convention cited:** `engineering-standards` → testing (risk-based; regression test for a bug fix)
- **Evidence:** `sis-product-sis-admin-backend/src/test/resources/application.yml` (H2, `ddl-auto: create`, Liquibase disabled in tests); existing IT style `administration/service/StructureMasterServiceIT.java`
- **Status:** LOCKED
