# Plan — GSIS-11642: "Application attachment expire" notification is not triggering to application

**Work type:** bug · **Line:** base (per D-1) · **Source:** `origin/base-development`

---

## Part 1 — Understanding

### Attachments

- `image-20250715-075409.png` — Admission application wizard, step 4 "Attachments", URL `https://sis-qa-gcet.gears-int.com/#/admission/manage/application/list/view/980?step=1` (GCET QA env). One card: attachment label **NIC**, file `bird.png`, `Last modified: 15/07/2025`, `Expires on: 16/07/2025`, status badge **APPROVED**. An expiry date *was* successfully persisted against the application attachment — the screen renders it back.
- `image-20250715-075521.png` — Admin > Administration > Policy Parameters > `APPLICATION_ATTACHMENT_LIST`. One template row: Allowed Document Types `pdf,png,jpg`, Attachment Label `NIC`, Degree Type `Foundation`, Mandatory `No`, **Required Expired Date `No`**, Status Active.
- Neither is a recording; no timestamps apply beyond what's shown. Both were readable.

**The "Required Expired Date: No" hypothesis is disproved.** `isRequiredExpiredDate` is only a UI validation flag: the frontend uses it solely to decide whether the wizard step may be completed (`sis-product-sis-frontend/src/app/modules/admission/manage/application/steps/add-view-attachments/add-view-attachments.component.ts:547-548`). It plays no part in persistence and no part in the notification job: the expiry setter is unconditional (`:453-455`), and the job's query does not read the policy at all.

### Expected vs actual

- **Expected:** when an application attachment carries an expiry date, the "Application attachment expire" notification reaches the applicant.
- **Actual:** nothing is sent — ever, for any attachment, on any line.

### Root cause (one falsifiable sentence)

`CommonAttachmentServiceImpl.createAttachmentExpiryNotifications()` only builds a notification when `attachment.getBusinessEntity().equalsIgnoreCase("Student")`, but no code path in the product ever writes that value — application attachments are persisted with `business_entity = "ADMISSION"` — so the loop body never executes and no `EXPIRE_ATTACHMENT` event is ever triggered.

**Evidence**

1. The job exists and runs. `sis-product-sis-admin-backend/src/main/java/com/ubs/sis/controller/v1/api/SchedulerController.java:22-25` — `@Scheduled(cron = "0 0 * * * *")` → `commonAttachmentService.createAttachmentExpiryNotifications()`; scheduling enabled at `.../SisAdminServiceApplication.java:30` (`@EnableScheduling`). The failure is inside the job, not a missing trigger.
2. The filter. `.../administration/service/impl/CommonAttachmentServiceImpl.java:250` — `if (allNearExpireAttachmentList.get(i).getBusinessEntity().equalsIgnoreCase("Student"))`. Everything that sends the notification (lines 251-270) is inside that `if`.
3. Application attachments are `"ADMISSION"`, not `"Student"`. The wizard uploads with `formData.append('attachment.businessEntity', 'ADMISSION')` (`add-view-attachments.component.ts:352`); backend stores it verbatim (`.../admission/service/impl/ApplicationAttachmentServiceImpl.java:358-359`, re-read at `:336-340`).
4. **No row anywhere gets `"Student"`.** Every `setBusinessEntity(...)` call site writes `STUDENT_PROFILE`, `AUTH_USER`, `SPONSOR`, `ADMISSION`, `APPLICATION`, `APPLICATION_ELIGIBILITY_DETAIL`, `HEAC_REGISTRATION_ATTACHMENT`, `FACULTY_MEMBER`, `NOTIFICATION_TEMPLATE`, `CRS`, `AC_EVNT`, … `"STUDENT_PROFILE"` does not `equalsIgnoreCase("Student")`. The `"Student"` branch is dead code — this notification has never fired for anyone.
5. The screenshot's expiry value is in the table the job queries. `PUT /api/v1/application-attachments/common-attachment-expiry-date/{commonAttId}` (`ApplicationAttachmentController.java:97-104`) → `ApplicationAttachmentServiceImpl.java:512-518` writes `CommonAttachment.expirationDate` (`sis_common_attachment.expiration_date`, `common/domain/CommonAttachment.java:52-53`). The job reads the same column (`CommonAttachmentRepository.java:22-23`). Only the filter rejects it.

**Alternatives ruled out**

| Hypothesis | Ruled out by |
|---|---|
| Policy `Required Expired Date = No` suppresses it | `isRequiredExpiredDate` is UI-only (`add-view-attachments.component.ts:547-548`); job never reads the policy |
| Expiry saved to a different table than the job reads | UI calls `updateCommonAttachmentExpiryDate`, which writes `sis_common_attachment` — same table as the query |
| Scheduler not enabled / job not deployed | `@EnableScheduling` at `SisAdminServiceApplication.java:30`; cron active at `SchedulerController.java:22` |
| Notification template missing | `sis_notification_template_master` is seeded with exactly this template (`000614-…xml:146`): title 'Application attachment expire', process `APPLICATION`, event `EXPIRE_ATTACHMENT`, `email_enabled = true`, active |
| Notification-handler service broken | Not reached — nothing is ever dispatched. Handler is a generic dispatcher, unchanged |
| GCET-line-specific defect (screenshots are from a GCET env) | Defect is in shared `base-development` code; no line-specific override involved |

### Two further defects on the same path (must be fixed for the ticket to be verifiable)

**(a) The date window is inverted.** `CommonAttachmentServiceImpl.java:242-247` computes `date = now`, `todate1 = now - 7 days`, then queries `expiration_date BETWEEN (now-7d) AND now` — that selects attachments that expired *in the past 7 days*, despite the variable name (`allNearExpireAttachmentList`) and the seeded template body ("Your document will expire soon, please update it asap.") implying a look-ahead window. QA's repro (test day, expiry next day) falls outside that window.

**(b) The dispatch path is the dead legacy one.** The job calls `eventTriggerService.triggerEvent(...)` (`:270`), which looks up `sis_notification_template_of_email_category_lookup` by `(tenantId, "EXPIRE_ATTACHMENT", "EMAIL")` — that table is truncated and re-seeded with a single unrelated row (`APPLICATION_SUBMITTED / EMAIL`), and no screen can add to it (`NotificationTemplateCategoryTypeServiceImpl.java:54-56` stubs the save to `return null`). The lookup returns `null` → NPE. It also hardcodes `tenantId = 1L`. Every working application notification instead calls `notificationService.sendNotifications(Process.APPLICATION, Event.X, …)`, which resolves the campus template and falls back to `sis_notification_template_master` by `(process, event)` — i.e. onto the seeded row this ticket needs.

### Repositories

| Repo | Verdict | Evidence |
|---|---|---|
| `sis-product-sis-admin-backend` | **change** | Owns the job, the defective filter and window, the query, and the working dispatch API |
| `sis-product-sis-frontend` | context | Only supplies `businessEntity='ADMISSION'` and the expiry setter — both correct. No UI change |
| `sis-product-notification-handler-backend` | context | Generic dispatcher, reached via the shared `NotificationClient`. Contract unchanged |
| `sis-product-sis-scheduler-service` | context | No attachment-expiry job on `base-development`. Moving it there is an architectural change, out of scope |
| `sis-product-sis-attachment-handler-backend` | context | Stores files only; no expiry/notification logic |
| `sis-product-business-config-service-backend` | context | Serves `APPLICATION_ATTACHMENT_LIST`; disproved as a cause |
| `sis-product-workflow-engine-backend`, `sis-product-sis-keycloak` | context | Not on the path |

Linked **GSIS-10461** (notification version bump) is unrelated: client library versions only.

---

## Part 2 — The plan

### Track: proposed **full**

Most light criteria hold (root cause established; 1 repo; no new entity, table, workflow or notification event — `Event.EXPIRE_ATTACHMENT` and its template row already exist; no auth/`@PreAuthorizeGrant`/deletion-check change; no schema change). It fails on blast radius over **existing rows**: this notification has never fired, so the first run after deploy evaluates every pre-existing attachment with an expiry date across all tenants and campuses and emails real applicants — warrants the second evaluation round.

### Change — `sis-product-sis-admin-backend` (only repo changed)

All edits in `src/main/java/com/ubs/sis/`:

1. **`common/repository/CommonAttachmentRepository.java:22-23`** — replace `findAllByExpirationDate` with a named-parameter query filtering in SQL: `WHERE deleted = false AND business_entity = :businessEntity AND expiration_date BETWEEN :fromDate AND :toDate` (drop the meaningless `GROUP BY id`; fixes soft-deleted rows currently bypassing `@Where(deleted = false)`).
2. **`administration/service/impl/CommonAttachmentServiceImpl.java:241-273`** — rewrite `createAttachmentExpiryNotifications()`:
   - Query with `businessEntity = "ADMISSION"` and the window per **Open Question Q1**.
   - Per row: load the application via `ApplicationRepository.findById(attachment.getReferenceId())`; skip with `log.warn` when the application or applicant is absent.
   - Dispatch through `notificationService.sendNotifications(Process.APPLICATION, Event.EXPIRE_ATTACHMENT, placeholdersMap, List.of(application.getApplicant()), List.of(applicant.getEmail()), …, application.getTenantId(), …, "/admission/manage/application/list/view/" + application.getId())` — mirrors `ApplicationServiceImpl.java:651-656`.
   - Add `EXPIRE_ATTACHMENT_ATTACHMENT_TYPE` and `EXPIRE_ATTACHMENT_EXPIRY_DATE` to `notification/domain/enums/LiquidVariable.java` (append only, ordinals stay stable), format the date with `DateUtils.convertTimeBasedCampusTimeZone(...)`.
   - Wrap each row's dispatch in `try/catch (Exception)` + `log.error` so one bad row cannot abort the batch.
3. **`controller/v1/api/SchedulerController.java:21-25`** — enable a daily cron (`@Scheduled(cron = "0 0 12 * * *", zone = "UTC")`, matching the other daily jobs' `zone = "UTC"` convention); delete the commented-out line and `//TODO`.
4. **Constructor injection only** — add `ApplicationRepository`, `NotificationService`, `AuthApplicationRepository` to `CommonAttachmentServiceImpl`'s constructor.

**No Liquibase, no schema, no seed data, no API, no UI, no permission change.**

### Alternatives rejected

| Option | Why not |
|---|---|
| Add an `"ADMISSION"` branch to the existing `eventTriggerService.triggerEvent(...)` call | NPEs — the lookup table has no `EXPIRE_ATTACHMENT` row and none can be created; duplicates the admin-maintained template; keeps `tenantId` hardcoded |
| Move the job to `sis-product-sis-scheduler-service` | Architectural change, out of scope for a bug — recorded as a recommendation |
| Add a `notified_at` column to dedupe reminders | New column + backfill on a shared table; only needed if Q1 resolves to a repeating reminder — fallback recorded |
| Also fix student-document attachments | `StudentDocumentServiceImpl.java:138` writes the wrong business entity for student documents — separate bug, separate ticket |

### Conventions applied

Constructor injection; `GearsException` + `log.error` handling; no new bean or service boundary; `NotificationService` extended by a new caller, not modified. Dates: GMT+0 storage, `DateUtils.getStartOfDay`/`getEndOfDay` for the range, `convertTimeBasedCampusTimeZone` for the emailed value. Hygiene: remove the commented cron and `//TODO`.

### Cross-repo contracts

None change. `POST /api/v1/notifications` on notification-handler is called through the unchanged shared `NotificationClient`; `sis_common_attachment` is read, never altered; admin-backend ships alone.

### Regression surface

- **Changed directly:** `createAttachmentExpiryNotifications()` (sole caller `SchedulerController.java:24`), `findAllByExpirationDate` (sole caller `CommonAttachmentServiceImpl.java:247`), the scheduler cron, and `LiquidVariable` (additive).
- **Blast radius (main risk):** first daily run after deploy notifies for every application attachment whose expiry falls in the window, across all tenants and campuses, in one batch. Must be confirmed with QA before merging to a customer line (Q2).
- **Shared code touched by a new caller only:** `NotificationService.sendNotifications` — used by application submit, status update, offer letter, credit transfer. We add a caller, we do not modify it.
- **Preserve:** `LiquidVariable` ordinals stable (append only); no existing placeholder key changes; `EXPIRE_ATTACHMENT` enum constant, seeded master row, and every other business-entity value unchanged. Student, faculty, sponsor and HEAC attachments must keep receiving nothing.
- **Likeliest regressions:** duplicate/repeat emails if the window overlaps successive runs (Q1); NPE on missing applicant/structure for staff-created or orphan applications aborting the batch; one misconfigured campus template throwing and killing the loop; soft-deleted rows re-entering scope if the `deleted = false` clause is dropped.

### Tests

Pure service logic plus one native query → unit tests for the logic, review + manual check for the query.

**Environment constraint** (per codebase notes, to be re-confirmed by the Implementor): `:compileTestJava` does not compile clean on `base-development` (pre-existing, unrelated), and `@SpringBootTest` fails at context startup (duplicate `restTemplate` bean). New test must be **plain Mockito, no Spring context**. If it still cannot run, report as written-but-not-executed with the exact command and failure.

1. **Regression test proving the ticket** — new `CommonAttachmentServiceImplTest` (JUnit 5 + Mockito): one `CommonAttachment` with `businessEntity = "ADMISSION"`, expiry inside the window; `ApplicationRepository` returns an application with an applicant. Assert `sendNotifications(Process.APPLICATION, Event.EXPIRE_ATTACHMENT, …)` called exactly once. **Fails on `base-development`** (zero interactions today), passes after the fix.
2. **Characterization / preserved behaviour:** non-ADMISSION rows produce no notification; a row missing its applicant is skipped and the batch continues; one row's send throwing doesn't abort the batch; placeholders include attachment type and a campus-timezone-formatted expiry date.
3. **Window boundaries** — parameterised per Q1's answer.
4. **Query change** — SQL predicate reviewed manually (and against a local Postgres if available); no `@SpringBootTest`/H2 test given the broken context.
5. **Existing suites for the affected area**, before and after the change; build check `-x test`.
6. **Manual verification (QA):** create an application, upload an attachment, set an expiry inside the window; trigger/await the job; confirm exactly one email with the "Application attachment expire" template reaches the applicant, and a second run the same day sends no duplicate. Confirm a soft-deleted attachment sends nothing.

---

## Codebase map corrections

- `sis-brain/codebase/sis-product-sis-admin-backend.md` has no entry for **scheduled jobs**. Admin-backend runs its own `@Scheduled` jobs (`@EnableScheduling`, `SisAdminServiceApplication.java:30`) in several places, separately from `sis-product-sis-scheduler-service` — worth a "Where things live" row.
- Worth recording: admin-backend has **two** notification dispatch paths. The live one, `NotificationService.sendNotifications(Process, Event, …)`, falls back to `sis_notification_template_master`. The legacy one, `EventTriggerServiceImpl.triggerEvent(...)`, is backed by a near-empty lookup table that cannot be extended through any screen — any new caller of it NPEs.

## Findings (not fixed here)

- `student/service/impl/StudentDocumentServiceImpl.java:138` sets `businessEntity = BusinessEntity.SPONSOR` on every student document's common attachment — likely a copy-paste defect. Affects stored data; needs its own ticket.
- `EventTriggerServiceImpl` hardcodes `tenantId = 1L` and does raw string surgery on templates — fragile, multi-tenant-unsafe. Recommend retiring the path.
- Moving the job to `sis-product-sis-scheduler-service` would align it with other schedulers — separate ticket.

---

## Open questions (QA / product) — see `qa-packet.md`

- **Q1** — When should the notification fire, and how often (reminder window vs. single reminder vs. on-expiry)?
- **Q2** — Should the first run after deploy catch up on the existing backlog of already-expiring attachments, or only notify going forward?

Neither answer changes the root cause, the repo set, the dispatch mechanism or the test structure — only the window predicate, the cron and the boundary assertions.
