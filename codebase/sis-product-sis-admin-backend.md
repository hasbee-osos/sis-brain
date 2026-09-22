# sis-product-sis-admin-backend

The main SIS backend: one Spring Boot service serving the whole `/api/v1` REST API behind the frontend. It uses Spring Boot 2.7, Java 11, Gradle, PostgreSQL with Liquibase, and MongoDB for some documents. It also owns the UI's translations and menus.

## Where things live

| Looking for | Where |
|---|---|
| The endpoint behind a screen | `generated/api.md` (frontend service → controller), then `generated/sis-product-sis-admin-backend.endpoints.md` for the method, `file:line` and grant |
| Controllers | All under `src/main/java/com/ubs/sis/controller/v1/` (mostly `…/api/`), regardless of domain. Base paths are `/api/v1/<plural-noun>`, e.g. `/api/v1/courses` |
| Domain code | `src/main/java/com/ubs/sis/<domain>/{domain,dto,repository,service,…}`. Domains: administration, admission, finance, student, mainexam, timetable, attendance, hostel, … Course, programme and study-plan masters are in `administration` |
| Tables | `generated/sis-product-sis-admin-backend.tables.md`. Names come from `Globals.TABLE_PREFIX` (`sis_admin_`) + name, e.g. `sis_admin_course_co_requisite` |
| Authorization | `@PreAuthorizeGrant(module = ModuleType.X, permission = PermissionType.Y)` on controller methods (shown in the endpoints index). Changes here put a ticket on the full track |
| Liquibase | `src/main/resources/db/changelog/db.changelog-master.xml`, then `V2/`: `1-table_modifications` (schema), `2-headers/<NNN-domain>/` (grid column headers per form), `3-navigations` (menus, auth components and grants), `4-last_executions`, and `sql_files/` for SQL they include. Conventions: `engineering-standards` → database |
| Menus | Navigation rows in `3-navigations` (tables `sis_admin_auth_module`, `sis_admin_auth_component`, `sis_admin_auth_grant`); index in `generated/…menus.md` |
| Translations (for the frontend too) | `src/main/resources/i18n/en.json` / `ar.json` (shared: `navigation`, `component`, `validation`, …) and `i18n/<domain>/{en,ar}.json`. **Customer lines override labels** on their own branches; for example `gcet-sandbox-qa` renames `component.course` to "Module" |
| Calls to other services | `generated/sis-product-sis-admin-backend.clients.md` (nine classes) |
| Where a master's generated ID comes from (`CMP-`, `ATY-`, `ME-`, …) | Each `*ServiceImpl.preCreateEntity` mints it from a per-assignment `COUNT(*) + 1` native query. The UI's "Component ID" / "Assessment ID" columns are these `*_code` columns, not the DB `id` (`i18n/examination/en.json:915`) |
| A field's max length / required rule shown on a screen | `V2/2-headers/<NNN-domain>/…` Liquibase seeds (`field_validation.max_length`, `is_required`) — not enforced by the entity or DTO unless separately annotated, so the UI limit and the column limit can silently disagree |

## Build and test

- **JDK 11 and Gradle.** The checkout has **no Gradle wrapper jar**, so use a local Gradle 8.x (`gradle -p sis-product-sis-admin-backend …`). CI builds with tests skipped (`gradle build -x test`). **The test source set does not currently compile at all** — `gradle test` (even `--tests`-filtered) fails at `:compileTestJava` before any test runs, regardless of which test is targeted (confirmed 2026-09, GSIS-28779: 50 errors across 21 pre-existing files unrelated to finance, as of `base-development` `9b6f9e6d0267c`). Expect no executable test evidence from this repo until that drift is fixed.
- **Known problem (2026-09, GSIS-28778):** in this workspace, `compileJava` stalled in annotation processing (Lombok, MapStruct, Hibernate metamodel) with no compiler error. One attempt ran for hours. **Time-box a build to about 15 minutes.** If nothing finishes, stop and record it as an environment gap; don't leave it running.
- **Tests:** JUnit 5 (`useJUnitPlatform`), H2 as the test database, JaCoCo after tests. There are ArchUnit rules in `src/test/java/com/ubs/sis/archunit/` (auth, master). Run the ones that touch your change: `gradle -p <repo> test --tests "<Class>" --tests "com.ubs.sis.archunit.*"`.
- PostgreSQL-specific Liquibase checks need Docker (PostgreSQL 14). Check `docker ps` first, and say so if Docker is not available.
