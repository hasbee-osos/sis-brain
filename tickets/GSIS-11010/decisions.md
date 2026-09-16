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
