# Analysis

Ticket: GSIS-11010 — https://gearsjira.atlassian.net/browse/GSIS-11010
Code of record: `origin/base-development` (per D-1). Revision 2 of the analysis. It supersedes `analysis.md` and adds the Jira attachments (two screen recordings, read as frames). Code findings are unchanged from revision 1; key commit claims were spot-checked by the harness (see Evidence).

## Problem

After an applicant accepts an Evaluation Schedule, neither cancelling the schedule nor removing that applicant in Edit sends its notification: "Exam interview canceled" (`SCHEDULE_EXAM_INTERVIEW_CANCELED`) and "Schedule exam interview applicant deleted" (`SCHEDULE_EXAM_INTERVIEW_APPLICANT_DELETED`). Neither the in-app message nor the email arrives.

## Expected

- **Cancel:** the students/applicants and the supervisors (the schedule's faculty members) get the notification, in-app and by email (GSIS-2701).
- **Remove applicant:** GSIS-2701 says "the removed user gets a notification". The ticket asks for more: the student and the supervisor.

## Observed

No notification on either channel for either action. The developer comment of 2025-06-27 says the cause is null values being passed for the notification users.

The recordings (see Attachments) narrow this down:
- **Email:** confirmed missing for both actions, for both the applicant and the examiner. In the same session, the "scheduled" and "status update by student" emails do arrive, so the mail path works and only these two events fail.
- **In-app:** not specific to this bug. The applicant's notification panel shows only two older notifications (19 Jun) throughout. The "scheduled" notification is missing there too, even though its email arrived.
- **Environment:** `sis-qa-base` (GUtech tenant), 2025-06-20 ≈ 08:15–08:38 UTC. No GCET environment is shown.

**`origin/base-development` no longer matches that comment.** Both callers now pass a user list. The fixes were merged under other tickets:
- `6c051d28c4` (GSIS-17509, 2026-06-19) for remove-applicant.
- `1b4f29ea57` (GSIS-25660, 2026-07-29) for cancel.
- `af70c0d6ed` (GSIS-26324, 2026-07-31) makes the notification service skip, rather than throw on, an empty in-app list.

According to the analyzer, all three are also on `origin/gcet-qa`, `gutech-qa`, `gcet-sandbox-qa`, `gutech-sandbox-qa` and `base-sandbox-qa`. Nobody has shown the defect still happens on a build that has them.

## Attachments

| Attachment | Read | What it shows |
|---|---|---|
| `bandicam 2025-06-20 13-45-42-868.mp4` (2:24, Issue 1 cancel) | 30 frames | See below |
| `bandicam 2025-06-20 14-06-27-425.mp4` (1:25, Issue 2 remove applicant) | 21 frames | See below |
| `10315` (SVG, 1.2 KB) | not read: Jira status icon, skipped by size rule | none |

**Cancel recording (Issue 1)**
- **@ 00:00–00:38:** HOD, logged in to `sis-qa-base` (GUtech), creates "Ev9" (Interview, Online). The **Examiner is a faculty record linked to the HOD's own account.** One applicant is added.
- **@ 00:51:** Submit → "Evaluation Schedule saved successfully", status Scheduled.
- **@ 00:58:** The Jira ticket as it was then: titled only "Exam interview canceled", parent **GSIS-10461 "notification version bump"**.
- **@ 01:01–01:22:** The applicant logs in, opens Ev9 (Scheduled) and accepts → "Evaluation Schedule saved successfully". The bell shows 2 unread.
- **@ 01:37–01:43:** HOD cancels Ev9 → "Successfully canceled the Evaluation Schedule", status Cancelled.
- **@ 01:55–02:23:**
  - The applicant's inbox has the Ev9 "New Admission Entrance/Eligibility Exam Schedule" email (08:17 UTC, the submit) and **no cancellation email**.
  - The HOD/examiner inbox has "Schedule Exam/Interview Status Update by Student" (08:18 UTC, the acceptance) and **no cancellation email**.
  - An older schedule email body reads "missing (applicant, exam title) liquid variables" and shows the date in GMT-08:00.
- The applicant's notification panel is not shown after the cancel.

**Remove-applicant recording (Issue 2)**
- **@ 00:00–00:22:** HOD opens "Ev11" (Scheduled; same examiner linked to the HOD) → Edit. One applicant, Response Status **Accepted**, with a delete action.
- **@ 00:22–00:37:** The confirm dialog, the Update click and any toast fall between frames and are not captured. The list reloads with Ev11 still Scheduled.
- **@ 00:41–01:05:**
  - The applicant's inbox: the newest email is the Ev11 schedule email (08:35 UTC). **No deletion email.**
  - The HOD/examiner inbox: the newest is the acceptance status update (08:36 UTC). **No deletion email.**
- **@ 01:11:** A separate Jira ticket, **GSIS-11012** "User does not receive the 'Schedule exam interview applicant deleted' Notification", also under GSIS-10461. Its content now lives in GSIS-11010 as Issue 2.
- **@ 01:18–01:24:**
  - The applicant's list first shows Ev11, then "No Records Available" after reload, so the removal took effect.
  - The notification panel holds only the two 19 Jun notifications: **no in-app deletion notification, and no in-app "scheduled" notification either.**

**What the recordings change**
- The "supervisor" QA checked is the **examiner (faculty member)**, whose account is also the HOD. This matches the recipients the cancel code uses today (faculty members + applicants).
- For remove-applicant, QA expected the examiner/HOD to be notified as well.
- Email is the reliable signal for this bug. In-app delivery is missing even for the working SCHEDULED event, which points to the in-app channel for this applicant (e.g. no device token, gap 5) rather than to these two events.
- The recordings were made on 2025-06-20, a year before `6c051d28c4`, `1b4f29ea57` and `af70c0d6ed`. They show the defect as reported, not whether it remains.

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

Established by reading the code and git history; nothing was executed. **The recordings are consistent with it:** for both events every recipient's email is missing, while the SCHEDULED and status-update emails from the same schedules arrive. The in-app symptom has a separate, event-independent explanation (see Attachments).

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
5. In-app needs a device token: `sendPushNotificationToUser` returns silently without a `NotificationUserToken`. This applies to every event. **The recordings show it happening:** the applicant's panel has no in-app notification for the SCHEDULED event either, even though its email arrived.
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

Jira attachments (read locally as frames, not stored in the brain):
- `bandicam 2025-06-20 13-45-42-868.mp4` @ 00:38, 00:51, 00:58, 01:22, 01:43, 01:55–02:23
- `bandicam 2025-06-20 14-06-27-425.mp4` @ 00:22, 00:41, 00:54, 01:11, 01:18–01:24

## Open Questions

1. **Can it still be reproduced?** Has QA seen it on a build containing `1b4f29ea57`, `6c051d28c4` and `af70c0d6ed`? If not, GSIS-11010 may already be fixed and only needs a retest. If yes, backend logs for the cancel or delete request are needed. **Judge the retest by email.** The in-app channel did not deliver even the working SCHEDULED notification to the recorded applicant.
2. **Recipients for remove-applicant.** Should `postDelete` also notify the schedule's faculty members, or only the removed applicant (GSIS-2701)? The recording shows QA checking the examiner/HOD inbox as well.
3. **Who are the "supervisors"?** *Partly answered by the recordings:* the inbox QA checked belongs to the examiner, a faculty member linked to the HOD's account. That matches the faculty-member recipients of the current cancel code. Please confirm it is the intended rule, and not "HOD" or "creator" as separate recipients.
4. **Cancel recipients.** Should cancel notify only ACCEPTED/REQUESTED applicants rather than every application?
5. **Scope of the minor gaps.** Should null-email filtering, redirect URLs and placeholder template content be fixed here or logged separately?
6. **Campus template data.** In the GCET/GUTech QA databases, do active campus rows exist for both events with in-app and email enabled?
7. **In-app channel for applicants.** Is a missing in-app notification for applicants (no device token) expected, or tracked elsewhere? It affects every event, so it is out of scope for this ticket unless you say otherwise.

## Status

NEEDS_INPUT. The recordings support D-2 and narrow Open Question 3, but whether the defect remains still depends on a retest (Question 1).
