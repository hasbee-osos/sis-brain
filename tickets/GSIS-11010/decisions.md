# Decisions — GSIS-11010

### D-1 — Flow A (base): branch base/bugfix/GSIS-11010-exam-interview-cancel-notifications from base-development, stage 1 → base-sandbox-qa, stage 2 → gcet-sandbox-qa and gutech-sandbox-qa
- **Stage:** analyze, iteration 1
- **Decided by:** harness · confirmed by human 2026-09-16T13:01:25Z
- **Options considered:** Flow A with stage 2 to both customer lines; Flow A with no stage 2; Flow A with a single customer line; Flow B (customer-specific)
- **Why:** the ticket is a Bug in a product core feature (Customer Name "Product Core Feature"), so the fix belongs to the base line; the SIS-GCET-QA and SIS-GUTECH-QA labels show both customer QA environments are affected
- **Convention cited:** `git-workflow` → Flow A (common/base ticket); branch naming `base/bugfix/<JIRA-ID>-<desc>`
- **Evidence:** Jira GSIS-11010 — issuetype Bug, Customer Name "Product Core Feature", labels SIS-GCET-QA, SIS-GUTECH-QA
- **Status:** LOCKED
