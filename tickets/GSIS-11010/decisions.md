# Decisions — GSIS-11010

### D-1 — Flow A (base): branch base/bugfix/GSIS-11010-exam-interview-cancel-notifications from base-development, stage 1 → base-sandbox-qa, stage 2 → gcet-sandbox-qa and gutech-sandbox-qa
- **Stage:** analyze, iteration 1
- **Decided by:** harness · confirmed by human 2026-09-16T13:01:25Z
- **Options considered:** Flow A with stage 2 to both customer lines; Flow A with no stage 2; Flow A with a single customer line; Flow B (customer-specific)
- **Why:** the ticket is a Bug in a product core feature (Customer Name "Product Core Feature"), so the fix belongs to the base line; the SIS-GCET-QA and SIS-GUTECH-QA labels show both customer QA environments are affected
- **Convention cited:** `git-workflow` → Flow A (common/base ticket); branch naming `base/bugfix/<JIRA-ID>-<desc>`
- **Evidence:** Jira GSIS-11010 — issuetype Bug, Customer Name "Product Core Feature", labels SIS-GCET-QA, SIS-GUTECH-QA
- **Status:** LOCKED

### D-2 — Root cause: callers passed null users to sendNotifications, whose in-app branch threw before email was sent; base-development already contains fixes
- **Stage:** analyze, iteration 1
- **Decided by:** analyzer · confirmed by human: not required
- **Options considered:** null notification users aborting the async send (developer comment 2025-06-27); missing or inactive notification templates; event/enum name mismatch; frontend not calling the backend; lazy-loading failure on the async thread
- **Why:** before 6c051d28c4 (remove) and 1b4f29ea57 (cancel) both callers passed users = null; before af70c0d6ed an empty in-app list threw GearsException ahead of the email branch, so neither channel was sent. The templates exist with master fallback, the event names match, the endpoints match, and FacultyMember.user is EAGER, so the other options are ruled out. All three fix commits are now on origin/base-development, so whether GSIS-11010 still reproduces is unconfirmed.
- **Convention cited:** none
- **Evidence:** sis-product-sis-admin-backend commits 28fd524be1, b2965b3976, 6c051d28c4, 1b4f29ea57, af70c0d6ed; ScheduleExamInterviewApplicationServiceImpl.java:929–930 and NotificationServiceImpl.java:497–620 at origin/base-development; Liquibase 000614 l.168–169; Jira GSIS-11010 comment 2025-06-27
- **Status:** LOCKED

### D-3 — No code change: GSIS-11010 is already fixed by GSIS-17509, GSIS-25660 and GSIS-26324; close the ticket
- **Stage:** analyze, iteration 1 (answers to qa-packet.md)
- **Decided by:** developer · confirmed by human 2026-09-17T10:06:50Z
- **Options considered:** close as already fixed; also notify the schedule's examiners on applicant delete; keep the ticket blocked until QA re-confirms
- **Why:** QA's retest on 2026-09-17 did not reproduce the defect: the applicant received both the cancel email (06:23 UTC) and the applicant-deleted email (06:29 UTC), each right after its scheduled email. The three fixes named in D-2 are on every QA line (base-qa, gcet-qa, gutech-qa, osos-qa and the sandbox lines). QA's follow-up that the Schedule Exam templates are gone from the Letter Template page is not a regression: they were never letter templates (no Schedule Exam event has existed in the letter template events on any branch). They are notification templates, and on the GCET and OSOS lines GCET-395/GCET-338 renamed them to the Placement Test Schedule process ("Placement Test canceled", "Schedule Placement Test applicant deleted"), which is exactly what the cancel and applicant-delete code sends on osos-qa and gcet-qa. Adding the examiners to the applicant-deleted notification would go beyond the original requirement (GSIS-2701: the removed applicant), so it is not part of this bug; it would be a separate story if the product owner wants it.
- **Convention cited:** `work-types` → bug: the smallest change that delivers the ticket; here none is needed
- **Evidence:** Jira GSIS-11010 QA comment 2026-09-17 with attachments image-20260917-063431.png (applicant inbox) and image-20260917-064126.png (Letter Template event list on the OSOS QA environment); sis-product-sis-admin-backend `git branch -r --contains` for 6c051d28c4, 1b4f29ea57, af70c0d6ed; origin/osos-qa `src/main/resources/db/changelog/V2/1-table_modifications/000853-schedule-exam-interview-events-to-placement-test-events.xml` and `000854-…`, commit 92309cc0cc (GCET-395 & GCET-338); origin/osos-qa `ScheduleExamInterviewServiceImpl.java:302,311`, `ScheduleExamInterviewApplicationServiceImpl.java:1033–1034`; origin/*/`LetterTemplateEvent.java` history
- **Status:** LOCKED
