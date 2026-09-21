# Plan

Ticket: GSIS-20755
Work type: bug
Track: **light** — the root cause is established with evidence (below); exactly **1 repo changes** (`sis-product-sis-admin-backend`); no REST contract change; no new entity, table, workflow, approval or notification; nothing touching authentication, `@PreAuthorizeGrant`, deletion checks, or existing row data (the only schema change is a metadata-only `VARCHAR` widening — no backfill).

# Part 1 — Understanding

## Problem

On Exam Controller → Administration → **GPA Scales Master** (`/#/examination/administration/gpa-scale`), saving an inline row whose **Description** is longer than 200 characters fails with the unrelated error toast "Some entities are assigned to this GPA Scales". The record is not saved.

## Expected / Observed

- Expected: a long description (the ticket says >500 chars; the UI input allows up to 1000) saves successfully.
- Observed: HTTP 500 with business status `5100` (`DATA_SAVING_ERROR`) and the misleading toast "Some entities are assigned to this GPA Scales". Nothing tells the user the description is too long.

## Attachments

| Attachment | Read | What it shows |
|---|---|---|
| `someentity.wmv` | frames (29 JPEGs, index.md) | `@ 00:00` GPA Scales Master list, env `sis-qa-base.gears-int.com/#/examination/administration/gpa-scale`, tenant "University Of Sri Lanka / Kandy Campus", admin user, DevTools open (QA environment, matches "Bug Environment: QA"). `@ 00:11` **Add** creates an **inline new row in the list table** (Description / Type / Degree Type / Applicable From / toggle) — not a separate Add page as the ticket's steps imply. `@ 00:44`–`00:54` the tester builds a long string in an external word counter: 101 chars, then **765 characters** (so the failing value is 765 chars, not "just over 500"). `@ 01:04`–`01:24` the long text is pasted into the Description cell; the input accepts all of it. `@ 01:32` toast "Please enter a valid value for required fields" (client-side required check, Degree Type/date not yet filled). `@ 01:39.8` **with the long description filled and rows in edit mode, save produces the toast "Some entities are assigned to this GPA Scales"** — the reported defect. `@ 01:47` a "Delete GPA Scales" confirm dialog with an "Internal Server Error" toast behind it (a second, separate failed request). `@ 01:49`–`02:06` the edited row is abandoned/reloaded and the list returns to its previous state — the long description was never persisted. |

Caveats: no audio and no network panel is visible, so the HTTP request/response bodies behind each toast are inferred from code, not read off screen; toasts shorter than ~1 s between frames could have been missed. The written repro says "Click on Add button and enter lengthy name for the description (more than 500 characters)"; the recording shows the same flow but also an existing row in edit mode at the moment of failure, so both the create (`POST`) and update (`PUT`) paths are implicated — both fail identically (same root cause, below).

## Repositories

| Repo | Role | Why (evidence) |
|---|---|---|
| sis-product-sis-admin-backend | **change** | Owns the entity/column that rejects the value: `src/main/java/com/ubs/sis/mainexam/domain/GPAScale.java` → `@Column(name = COL_DESCRIPTION, length = 200)`, and `src/main/resources/db/changelog/V2/1-table_modifications/000030-create-sis-exam-gpa-scale-table.xml` → `<column name="description" type="VARCHAR(200)"/>`. Also owns the form-header seed that lets the UI accept 1000 chars (`.../V2/2-headers/007-examination/000008-gpa-scale-form-headers.xml`, `field_validation.max_length = 1000` for key `description`). |
| sis-product-sis-frontend | context | Screen `src/app/modules/examination/administration/gpa-scale/gpa-scale-add-edit-delete/gpa-scale-add-edit-delete.component.ts` → `GPAScaleMasterService` (`src/app/shared/services/examination/gpa-scale-master-service.ts`, `getContextPath() = 'gpa-scale'`). The misleading text is produced here (`src/@gears-commons/services/gears-alert.service.ts`), but the mapping is shared by every screen — not changed by this ticket (see Alternatives). |
| all other product repos | context | No GPA-scale code path; `git grep GpaScale` matches only the admin backend and frontend. |

Flow: `gpa-scale-add-edit-delete.component.ts` `save()`/`update()`/`saveAll()` → `POST /api/v1/gpa-scale`, `PUT /api/v1/gpa-scale/{id}`, `POST /api/v1/gpa-scale/bulk` → `sis-product-sis-admin-backend/src/main/java/com/ubs/sis/controller/v1/api/examination/GPAScaleMasterController.java` → `GPAScaleMasterServiceImpl` (`mainexam/service/impl`) → `MasterBaseService`/commons `BaseService.create|update` → `GPAScaleMasterRepository` → `sis_exam_gpa_scale.description VARCHAR(200)`.

## Root Cause (bug)

**`sis_exam_gpa_scale.description` is `VARCHAR(200)` while the screen's own form definition tells the UI the field may hold 1000 characters, so any description over 200 characters is rejected by PostgreSQL, and the commons `BaseService` catch-all turns that database error into business status `5100 DATA_SAVING_ERROR`, which the shared Angular alert service renders as "Some entities are assigned to this GPA Scales".**

Evidence, end to end:

1. Column/entity cap 200: `sis-product-sis-admin-backend/src/main/java/com/ubs/sis/mainexam/domain/GPAScale.java` — `@Column(name = COL_DESCRIPTION, length = 200)`; `.../db/changelog/V2/1-table_modifications/000030-create-sis-exam-gpa-scale-table.xml` — `<column name="description" type="VARCHAR(200)"/>`. No later changelog alters it (`git grep -l gpa_scale` over `1-table_modifications` reviewed).
2. UI cap 1000: `.../V2/2-headers/007-examination/000008-gpa-scale-form-headers.xml` inserts `field_validation (... max_length ...) VALUES (false, 1, true, 1000, 0, ...)` for `form_field.key = 'description'` of `GPA_SCALE_FORM`. That value reaches the browser: `FieldValidation.maxLength` → `FormHeaderDto.validations` → FE `FormHeader.validations` → `src/@gears-commons/component/inputs/generic-input/generic-input.component.ts` (`this.validations = header.validations`) → `src/@gears-commons/component/inputs/text-input/text-input.component.html` (`[maxlength]="validations?.maxLength"`). Hence the browser accepted 765 chars (frame `@ 00:54`).
3. No other guard in between: `GPAScaleMasterRequestDto` has no `@Size` on `description`; commons `BaseService.validateRequest` only performs duplicate/image validation (verified by decompiling `gears-commons-lib-0.0.33`); the inline-edit `FormArray` controls are created with **no validators** (`src/@gears-commons/component/data-table/base-data-table.ts`, `formGroup.addControl(key, new FormControl(...))`), and `validateInlineField` for `TEXT` checks only "required" and a leading-space regex (`src/@gears-commons/utils/base-list-view-page-with-add-view-edit.page.ts`) — maxLength is only applied to `NUMBER_*` types there.
4. Error mapping: commons `BaseService.create` / `createAndGetEntity` / `update` each `catch (Exception)` and rethrow `new GearsException(GearsResponseStatus.DATA_SAVING_ERROR, ex.getMessage())` (decompiled bytecode). `GearsResponseStatus.DATA_SAVING_ERROR` = business code **5100**, HTTP 500.
5. Text produced: `src/@gears-commons/services/gears-alert.service.ts` — `else if (errorCode === Response.DATA_SAVING_ERROR) { this.showErrorAlert(translate('message.delete.someEntitiesAssignedToThisComponent', {component: translate('component.' + component)})); }` with `Response.DATA_SAVING_ERROR = 5100` (`src/@gears-commons/models/response/response.ts`). The component passes `getComponent() = 'gpaScale'`; `component.gpaScale = "GPA Scales"` and `message.delete.someEntitiesAssignedToThisComponent = "Some entities are assigned to this {{component}}"` (`sis-product-sis-admin-backend/src/main/resources/i18n/en.json:502` and `:2834`) — exactly the observed toast.
6. Convention breach that caused it: `engineering-standards` → database — "`VARCHAR(1000)` for descriptions and remarks". Sibling exam masters follow it (`000197-create-sis-exam-credit-category.xml`, `000198`, `000199` all use `VARCHAR(1000)`); GPA scale at 200 is the outlier.

Falsifiable: create/update a GPA scale with a 201-character description against a DB built from these changelogs — it fails today with `statusCode 5100`; with ≤200 chars it succeeds.

Alternatives ruled out:

- **`MasterBaseService.preUpdateEntity` "N campuses are assigned to this"** (`administration/service/MasterBaseService.java`, `validateForActiveChildren` throws `DATA_SAVING_ERROR`, same 5100 → same toast). Ruled out: that branch runs only when the record's active status changes **active → inactive**; the recording shows the status toggle staying ON for a record already Active (`@ 01:39.8`), and the ticket reproduces on **create** too, where the branch cannot run. It does explain why the toast text is so misleading — it is the message written for that case.
- **A real "entity assigned" / in-use check** (`RECORD_IN_USE_ERROR` 5555, `MiscUtils.getEntityUsages`): a different code path with different text ("This record cannot be updated due to the following usages: …") and it would fire regardless of description length.
- **`createBulk`'s own wrapper** (`GPAScaleMasterServiceImpl.createBulk` catches `Exception` → `DATA_SAVING_ERROR`): only reachable from **Save All**; the `saveAll()` error handler in the component does not call `onError`, so it cannot have produced this toast. Same underlying column limit either way.
- **Bean-validation rejection** (`@Valid @RequestBody` in `GPAScaleMasterController`): would return `BAD_REQUEST` 4000 with `fieldErrors`, which the alert service deliberately ignores — no toast at all. Not what was seen.
- **Frontend-only fix (cap the input at 200)**: contradicts the ticket's expected result ("should allow to save successfully"), contradicts the product's own seeded `max_length = 1000` for this field, and contradicts the DB convention for description columns.

## Open Questions

None blocking. One item to confirm in the PR (not a blocker): the team convention and this screen's own form definition both put the description limit at 1000 characters, so the fix adopts 1000; if the PO wants a different business limit, only the changelog constant and the `field_validation` row change.

# Part 2 — Plan

## Decisions

- **Following:** D-1 (routing — base line, bugfix, `base-development` → `base-sandbox-qa`).
- **New:**
  - **D-2 (root cause):** `sis_exam_gpa_scale.description` is `VARCHAR(200)` while the GPA_SCALE form definition advertises `max_length = 1000` to the UI, so descriptions over 200 chars fail at the database and the commons `BaseService` catch-all surfaces the failure as `DATA_SAVING_ERROR` (5100), which `gears-alert.service.ts` renders as "Some entities are assigned to this GPA Scales".
  - **D-3 (fix approach):** Align the storage with the declared field limit and the team's DB convention — widen the column to `VARCHAR(1000)` with a new Liquibase script and set the entity `@Column(length = 1000)`. Rejected: capping the UI/`field_validation` at 200 (contradicts the ticket's expected result and the convention "`VARCHAR(1000)` for descriptions"); changing the shared `DATA_SAVING_ERROR → "Some entities are assigned…"` mapping in `gears-alert.service.ts` (a common service used by every screen in the app — out of scope for this bug, recorded as a recommendation); adding `@Size` to `GPAScaleMasterRequestDto` (the inline-edit UI silently swallows `BAD_REQUEST` field errors, so it would trade a wrong message for no message).
  - **D-4 (test strategy):** A backend regression test that persists a 1000-character description through `GPAScaleMasterRepository` on the H2 test schema (generated from the entity, `ddl-auto: create`), which fails before the fix and passes after; plus the ArchUnit master suite because an entity is touched; plus a manual QA re-run of the ticket's steps on `base-sandbox-qa`.
- **Superseding:** None.

## Conventions That Apply

- `engineering-standards` → database: `VARCHAR(1000)` for descriptions and remarks; **every DB modification needs a new Liquibase script** (never Hibernate auto-update — production runs `ddl-auto: validate`); scripts go in `V2/1-table_modifications`, named with the next free 6-digit number and **no "changelog" in the file name**; guard with `preConditions`.
- `engineering-standards` → backend: entities extend `MasterEntity` (unchanged), constructor injection, `@Slf4j` — nothing in this fix deviates.
- Code hygiene: no commented-out code, no stray whitespace.

## Change

### sis-product-sis-admin-backend

Files:
- new `src/main/resources/db/changelog/V2/1-table_modifications/002018-increase-gpa-scale-description-length.xml`
- `src/main/java/com/ubs/sis/mainexam/domain/GPAScale.java`
- new test (see Tests)

Steps:
1. Add the Liquibase script, following `002017-increase-application-attachment-document-type-length.xml` verbatim in shape: `changeSet id="increase-gpa-scale-description-length" author="<dev>"`, `preConditions onFail="MARK_RAN" onError="HALT"` with `<tableExists tableName="sis_exam_gpa_scale"/>` + `<columnExists tableName="sis_exam_gpa_scale" columnName="description"/>`, then `<modifyDataType tableName="sis_exam_gpa_scale" columnName="description" newDataType="VARCHAR(1000)"/>`. 002018 is the next free number in that folder; the file is picked up automatically (no registration).
2. Change `GPAScale.description` to `@Column(name = COL_DESCRIPTION, length = 1000)`. Both changes must ship in the same commit/PR because startup runs Liquibase then `ddl-auto: validate`.
3. Nothing else: no DTO, mapper, service, controller, i18n or frontend change.

## Cross-Repo Contracts

None — single repo. The REST contract (`/api/v1/gpa-scale` request/response shape) is unchanged; the frontend already permits 1000 characters, so no coordinated deploy is needed. Ordering: none.

## Regression Surface

- Direct: `sis_exam_gpa_scale.description` 200 → 1000. In PostgreSQL, increasing a `varchar` length is a catalogue-only change (brief `ACCESS EXCLUSIVE` lock, no table rewrite, existing rows untouched, no backfill).
- Preserve: description still required (`field_validation.is_required = true` + `validateInlineField`), the type-change guard in `GPAScaleMasterServiceImpl.update` ("gpaScaleTypeCannotChange"), program auto-assignment on create/update, delete/soft-delete behaviour.
- Dependent readers of the description, worth an eye on the PR (cosmetic only): the GPA Scales list column (already truncates with an ellipsis — visible in the recording), `GET /api/v1/gpa-scale/basic-info-details` → `GPAScaleBasicInfoDto.description`, consumed by `GPAScaleMasterService.getBasicInfoList()` on the Study Plan and Assessment Planning screens (dropdown labels may now show long text).
- Likeliest regression: startup failure if the entity change ships without the Liquibase script (or vice versa) under `ddl-auto: validate`. Mitigation: one PR, both files.
- Still true after the fix: a description longer than 1000 characters (only reachable by calling the API directly — the input caps at 1000) still returns the misleading 5100 toast. Recorded as a follow-up recommendation, not fixed here.

## Tests

### sis-product-sis-admin-backend
- **Regression test (proves the ticket):** new `src/test/java/com/ubs/sis/mainexam/service/GPAScaleDescriptionLengthIT.java` — `@SpringBootTest` (the repo's IT style, e.g. `administration/service/StructureMasterServiceIT.java`; `src/test/resources/application.yml` uses H2 with `ddl-auto: create` and Liquibase disabled, so the test schema comes from the entity annotation): save a `GPAScale` with a 1000-character description via `GPAScaleMasterRepository` and read it back, asserting the value round-trips at full length. **Fails before the fix** (H2 rejects >200 for `varchar(200)`), passes after. Command: `gradle -p sis-product-sis-admin-backend test --tests "com.ubs.sis.mainexam.service.GPAScaleDescriptionLengthIT"`.
- **Fallback if the Spring context cannot boot in this environment** (the codebase map records a known `compileJava`/annotation-processing stall, GSIS-28778): a plain JUnit unit test asserting `GPAScale.class.getDeclaredField("description").getAnnotation(Column.class).length() == 1000`. It is weaker (pins the mapping, not the behaviour) — use it only with the reason recorded in the implementation report.
- **Existing suites for the touched area:** `gradle -p sis-product-sis-admin-backend test --tests "com.ubs.sis.archunit.*"` (an entity changed). Time-box the build to ~15 minutes per the map's note and report an environment gap rather than claiming an unrun result.
- **Liquibase:** the script cannot be executed locally (no PostgreSQL in the workspace); it is verified by XML validity plus review against `002017-…`, and by the service starting on `base-sandbox-qa`.

### sis-product-sis-frontend
- No change, so no spec change. Manual check after deploy to `base-sandbox-qa`, on the ticket's own steps: GPA Scales Master → Add → paste a ~700-character description → fill Type, Degree Type, Applicable From → Save → expect the success toast and the row persisted with the full description (re-open in Edit to confirm it was not truncated); repeat via Edit on an existing row (the recording's path). Record the result as evidence.

## Risk

**Low** — one metadata-only column widening plus the matching entity attribute, no contract change, no data migration, no behaviour change for existing records; the main risk is deploy-time (both files must ship together under `ddl-auto: validate`).

## Codebase map corrections

- `sis-product-sis-frontend` — `generated/screens.md:250` lists the GPA Scales list screen with an empty menu label (`—`), so searching the index by the ticket's own words ("GPA scale master") finds it only via the route. The menu label exists in the backend seed: `sis-product-sis-admin-backend/src/main/resources/db/changelog/V2/3-navigations/000104-insert-sis-exam-gpa-scale.xml` (`navigation_id = 'gpa-scale'`, `module_name = 'GPA Scale'`) and `000105-sis-exam-update-gpa-scale-link.xml` (`title_label = 'navigation.examination.administration.gpaScale.title'`).
- `sis-product-sis-admin-backend` — `generated/sis-product-sis-admin-backend.menus.md` lists only the GPA Scale **Configuration** navigation row (`000121-…`), not the GPA Scales menu row seeded by `000104-insert-sis-exam-gpa-scale.xml`.
- (Applied to hand-written notes, not a build.js gap): a screen's per-field `maxlength` and "required" on list/inline-edit pages come from the backend **form-header Liquibase seeds** (`V2/2-headers/…`, `field_validation.max_length`), not from the Angular component; and business status `5100 DATA_SAVING_ERROR` is rendered by `src/@gears-commons/services/gears-alert.service.ts` as "Some entities are assigned to this <component>" for **every** screen, so that toast usually means "the save threw something the backend did not classify", not an assignment conflict.

## Status

READY_FOR_IMPLEMENTATION

---

Key file paths (absolute):
- `E:\Projects\sis-product-sis-admin-backend\src\main\java\com\ubs\sis\mainexam\domain\GPAScale.java`
- `E:\Projects\sis-product-sis-admin-backend\src\main\resources\db\changelog\V2\1-table_modifications\000030-create-sis-exam-gpa-scale-table.xml`
- `E:\Projects\sis-product-sis-admin-backend\src\main\resources\db\changelog\V2\1-table_modifications\002017-increase-application-attachment-document-type-length.xml` (template for the new 002018 script)
- `E:\Projects\sis-product-sis-admin-backend\src\main\resources\db\changelog\V2\2-headers\007-examination\000008-gpa-scale-form-headers.xml`
- `E:\Projects\sis-product-sis-admin-backend\src\main\java\com\ubs\sis\mainexam\service\impl\GPAScaleMasterServiceImpl.java`
- `E:\Projects\sis-product-sis-frontend\src\@gears-commons\services\gears-alert.service.ts`
- `E:\Projects\sis-product-sis-frontend\src\app\modules\examination\administration\gpa-scale\gpa-scale-add-edit-delete\gpa-scale-add-edit-delete.component.ts`

The load-bearing line for the misleading message (`gears-alert.service.ts`):
```ts
} else if(errorCode === Response.DATA_SAVING_ERROR) {
    this.showErrorAlert(translate('message.delete.someEntitiesAssignedToThisComponent', {component: translate('component.' + component)}));
}
```
