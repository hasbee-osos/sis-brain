# Analysis

Ticket: GSIS-11010 — https://gearsjira.atlassian.net/browse/GSIS-11010
Code of record: `origin/base-development` (per D-1). Iteration 1. Analyzer output; key commit claims spot-checked by the harness (see Evidence).

## Problem

After an applicant accepts an Evaluation Schedule, neither cancelling the schedule nor removing that applicant in Edit sends its notification: "Exam interview canceled" (`SCHEDULE_EXAM_INTERVIEW_CANCELED`) and "Schedule exam interview applicant deleted" (`SCHEDULE_EXAM_INTERVIEW_APPLICANT_DELETED`). Neither the in-app message nor the email arrives.

## Expected

- **Cancel:** the students/applicants and the supervisors (the schedule's faculty members) get the notification, in-app and by email (GSIS-2701).
- **Remove applicant:** GSIS-2701 says "the removed user gets a notification". The ticket asks for more: the student and the supervisor.

## Observed

No notification on either channel for either action (QA, 2025-06-20, GCET/GUTech). The developer comment of 2025-06-27 says the cause is null values being passed for the notification users.

**`origin/base-development` no longer matches that comment.** Both callers now pass a user list. The fixes were merged under other tickets:
- `6c051d28c4` (GSIS-17509, 2026-06-19) for remove-applicant.
- `1b4f29ea57` (GSIS-25660, 2026-07-29) for cancel.
- `af70c0d6ed` (GSIS-26324, 2026-07-31) makes the notification service skip, rather than throw on, an empty in-app list.

According to the analyzer, all three are also on `origin/gcet-qa`, `gutech-qa`, `gcet-sandbox-qa`, `gutech-sandbox-qa` and `base-sandbox-qa`. Nobody has shown the defect still happens on a build that has them.

## Repositories

| Repo | Role | Why (evidence) |
|---|---|---|
| sis-product-sis-admin-backend | change (only if a fix is still needed) | Both dispatch sites and template resolution: `ScheduleExamInterviewServiceImpl.cancelScheduleInterviewExamById`, `ScheduleExamInterviewApplicationServiceImpl.postDelete`, `NotificationServiceImpl.sendNotifications`; template rows in Liquibase 000614 |
| sis-product-sis-frontend | context | Cancel calls `DELETE schedule-exam-interviews/{id}/cancel`; EDIT-mode remove goes through `BaseListViewPage.showDeleteDialog` to `DELETE schedule-exam-interview-applications/{id}`. Both URLs match the backend controllers; no defect found |
| sis-product-notification-handler-backend | context | Receives the finished APP/EMAIL `NotificationRequestDto`; recipients are chosen before this call |
| business-config, attachment-handler, keycloak, scheduler, workflow-engine | not involved | None references these events or endpoints |

**Flow, cancel:** `schedule-exam-interview-list.component.ts#cancelScheduleExamInterview` → `DELETE /api/v1/schedule-exam-interviews/{id}/cancel` → `ScheduleExamInterviewController.cancelScheduleExamInterviewId` → `ScheduleExamInterviewServiceImpl.cancelScheduleInterviewExamById`. That sets the status to CANCELLED and, unless the old status was DRAFTED, makes two `notificationService.sendNotifications(...CANCELED...)` calls (faculty members; scheduled applicants). The service (`@Async @Transactional`) resolves the template (campus row, falling back to master), sends in-app, then email, both via notification-handler.

**Flow, remove applicant:** `selected-application-list.component.ts#onActionPicked` (EDIT) → `showDeleteDialog` → `DELETE /api/v1/schedule-exam-interview-applications/{id}` → commons `BaseService.delete` → `ScheduleExamInterviewApplicationServiceImpl.postDelete` → `sendNotifications(...APPLICANT_DELETED...)`, sent to the removed applicant only.

**Working reference:** `ScheduleExamInterviewServiceImpl.sendNotification(entity, SCHEDULE_EXAM_SCHEDULED, …)` has always passed a non-null `List.of(applicant)`.

## Root Cause

Before `6c051d28c4` (remove) and `1b4f29ea57` (cancel), both callers passed `users = null` to `sendNotifications`. Both master templates have `inapp_enabled = true` (000614). Before `af70c0d6ed`, `NotificationServiceImpl.sendNotifications` threw `GearsException("'Notification To' user list is empty")` in the in-app branch, which runs before the email branch. The async call aborted, so neither in-app nor email was sent.

- **Cancel:** `28fd524be1` (2024-08-20) replaced the email-only `sendEmail` loop with `sendNotifications(..., null users, emails, ...)`. That change introduced the defect.
- **Remove applicant:** `postDelete` passed `null` users since GSIS-2701 (`b2965b3976`, 2023).
- **Current code:** cancel passes faculty-member users and applicants, filtered for non-null. `postDelete` passes `List.of(applicant)`. An empty in-app list now only logs a warning.

Established by reading the code and git history; nothing was executed.

**Ruled out:** missing templates (master rows exist and are active, 000614 l.168–169, with master fallback); event name mismatch (`Event.java:65–66`); frontend not calling the backend; lazy loading (`FacultyMember.user` is EAGER); the old status gate.

## Affected

- `ScheduleExamInterviewServiceImpl.cancelScheduleInterviewExamById`
- `ScheduleExamInterviewApplicationServiceImpl.postDelete`
- `NotificationServiceImpl.sendNotifications` / `resolveNotificationTemplate` (shared across modules)
- `sis_notification_template_master` / `sis_notification_template` rows for the two events

**Remaining gaps on base-development.** None stops delivery on its own:
1. Remove-applicant does not notify supervisors (meets GSIS-2701, not the ticket's expected result).
2. Cancel does not filter null email addresses (`getPrimaryEmail()`, `getApplicant().getEmail()`), which could fail that email batch.
3. Redirect URLs are malformed. Cancel uses `".../schedule-exam-interview" + id` with no `/view/`. `postDelete` appends `structureMaster.getId()` instead of the schedule id.
4. Master template content is placeholder text ("Please configure …") unless a campus has configured its own.
5. In-app needs a device token: `sendPushNotificationToUser` returns silently without a `NotificationUserToken`. This applies to every event.
6. Cancel notifies every scheduled application, whatever its status (e.g. REJECTED).

## Regression Surface

- `NotificationServiceImpl.sendNotifications` is shared product-wide. Don't reintroduce the empty-user-list throw for events with `requiredReceiver = false`, and keep the in-app-then-email order.
- Cancel must still skip notifications when the schedule was DRAFTED (GSIS-25660).
- SCHEDULED / CONDUCTED / MARKS_UPDATED / SCHEDULE_UPDATE notifications and their per-applicant placeholders (GSIS-25727, GSIS-17509) must stay as they are.
- Applicant delete must still check usages first (`preDelete` → `MiscUtils.checkUsagesBeforeDelete`). ADD mode must keep removing rows locally.
- Cancel returns success even if the async notification fails.
- Liquid variables for both events (`LiquidVariable.java:35–38, 68–70`) are template contracts.

## Evidence

In `sis-product-sis-admin-backend` at `origin/base-development`:
- `src/main/java/com/ubs/sis/admission/service/impl/ScheduleExamInterviewServiceImpl.java`: `cancelScheduleInterviewExamById` (~l.266–320); reference `sendNotification` (~l.795–905)
- `src/main/java/com/ubs/sis/admission/service/impl/ScheduleExamInterviewApplicationServiceImpl.java:916–935` (`postDelete`; harness verified l.929–930 passes `List.of(entity.getApplication().getApplicant())`), `preDelete` ~l.978
- `src/main/java/com/ubs/sis/notification/service/impl/NotificationServiceImpl.java`: `sendNotifications` l.497–620, `resolveNotificationTemplate` l.807, `sendPushNotificationToUser` l.236, `sendEmailToRecipients` l.339
- `src/main/java/com/ubs/sis/notification/domain/enums/Event.java:65–66`
- `src/main/resources/db/changelog/V2/1-table_modifications/000614-create-notification-template-master-tables-v3.xml:168–169`
- Git history:
  - `b2965b3976` (2023, GSIS-2701)
  - `28fd524be1` (2024-08-20)
  - `6c051d28c4` (2026-06-19, GSIS-17509)
  - `1b4f29ea57` (2026-07-29, GSIS-25660)
  - `af70c0d6ed` (2026-07-31, GSIS-26324)
  - The harness verified that the last three are in `origin/base-development` history.

In `sis-product-sis-frontend` at `origin/base-development`:
- `src/app/modules/admission/manage/schedule-exam-interview/schedule-exam-interview-list/schedule-exam-interview-list.component.ts`
- `.../selected-application-list/selected-application-list.component.ts`
- `src/@gears-commons/utils/base-list-view-page.ts`
- `src/app/shared/services/admission/schedule-exam-interview.service.ts`

No existing tests cover these notification paths, and none were run.

## Open Questions

1. **Can it still be reproduced?** Has QA seen it on a build containing `1b4f29ea57`, `6c051d28c4` and `af70c0d6ed`? If not, GSIS-11010 may already be fixed and only needs a retest. If yes, backend logs for the cancel or delete request are needed.
2. **Recipients for remove-applicant.** Should `postDelete` also notify the schedule's faculty members (the ticket's expectation), or only the removed applicant (GSIS-2701)?
3. **Who are the "supervisors"?** The schedule's faculty members, or another role (HOD, schedule creator)?
4. **Cancel recipients.** Should cancel notify only ACCEPTED/REQUESTED applicants rather than every application?
5. **Scope of the minor gaps.** Should null-email filtering, redirect URLs and placeholder template content be fixed here or logged separately?
6. **Campus template data.** In the GCET/GUTech QA databases, do active campus rows exist for both events with in-app and email enabled?

## Status

NEEDS_INPUT
