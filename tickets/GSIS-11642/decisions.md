### D-1 — Routing: bug on the base line
- **Stage:** plan, iteration 1
- **Decided by:** orchestrator · confirmed by human 2026-09-22T11:22:38Z
- **Options considered:** none — Customer Name maps deterministically per `git-workflow`
- **Why:** Jira issue type is Bug; Customer Name field is "Product Core Feature", which maps to the `base` line
- **Convention cited:** `git-workflow` → The routing decision
- **Evidence:** Jira GSIS-11642 fields.issuetype.name = "Bug"; customFields."Customer Name".value[0].value = "Product Core Feature"
- **Status:** LOCKED

Work type: `bug` · Line: `base` · Branch: `base/bugfix/GSIS-11642-attachment-expiry-notification` · Source branch: `base-development` · PR target: `base-sandbox-qa`

### D-2 — Root cause: `createAttachmentExpiryNotifications()` filters on a business-entity value that is never stored
- **Stage:** plan, iteration 1
- **Decided by:** planner
- **Options considered:** policy `Required Expired Date = No` suppresses it; expiry saved to a different table than the job reads; scheduler not enabled; notification template missing; notification-handler broken; GCET-line-specific defect — all ruled out with evidence
- **Why:** `CommonAttachmentServiceImpl.java:250` only sends when `getBusinessEntity().equalsIgnoreCase("Student")`, but every `setBusinessEntity(...)` call site in the repo writes a different literal (`ADMISSION` for application attachments); no row is ever `"Student"`, so the branch has never executed for anyone. The expiry date itself is correctly persisted and read (confirmed by the screenshot and the shared `sis_common_attachment.expiration_date` column) — only the filter rejects it.
- **Convention cited:** n/a (defect, not a convention deviation)
- **Evidence:** `sis-product-sis-admin-backend/src/main/java/com/ubs/sis/administration/service/impl/CommonAttachmentServiceImpl.java:241-273`; `.../admission/service/impl/ApplicationAttachmentServiceImpl.java:336-340,358-359,512-518`; `sis-product-sis-frontend/.../add-view-attachments.component.ts:352,453-455,547-548`; repo-wide `setBusinessEntity` grep on `origin/base-development`
- **Status:** LOCKED

### D-3 — Two additional defects on the same path must be fixed for the ticket to be verifiable
- **Stage:** plan, iteration 1
- **Decided by:** planner
- **Options considered:** fix only the business-entity filter and leave the window/dispatch-path bugs for a separate ticket — rejected: the window bug means the fix would still produce nothing on QA's own repro date, so the ticket could not pass verification; the dead dispatch path (`EventTriggerServiceImpl`) NPEs on first use since no admin screen can seed its lookup table
- **Why:** (a) the query window `expiration_date BETWEEN (now-7d) AND now` selects attachments that already expired in the past, not ones expiring soon, contradicting both the variable name and the seeded template's wording; (b) the current dispatch call `eventTriggerService.triggerEvent(...)` is backed by a near-empty lookup table with no `EXPIRE_ATTACHMENT` row and no screen to add one — switching business entity alone would just move the failure from "never called" to "NPE"
- **Convention cited:** `harness-core` → smallest change that *completely and safely* delivers the ticket
- **Evidence:** `CommonAttachmentServiceImpl.java:242-247,270`; `CommonAttachmentRepository.java:22-23`; `EventTriggerServiceImpl.java:156-158`; `NotificationTemplateCategoryTypeServiceImpl.java:54-56`; `000499-changelog-notification-lookup-records-and-validation-changes.xml:17,25-35`; `000614-…-notification-template-master-tables-v3.xml:146`
- **Status:** LOCKED

### D-4 — Fix approach: correct entity/window in `CommonAttachmentServiceImpl`, dispatch via the existing `NotificationService.sendNotifications` (not the legacy event-trigger path)
- **Stage:** plan, iteration 1
- **Decided by:** planner
- **Options considered:** extend the legacy `eventTriggerService.triggerEvent(...)` path — rejected, NPEs and duplicates the admin-maintained template (per D-3); move the job to `sis-product-sis-scheduler-service` — rejected as architectural, out of scope for a bug; add a `notified_at` dedupe column — rejected unless Q1 requires repeating reminders (schema change, would expand scope)
- **Why:** `NotificationService.sendNotifications(Process.APPLICATION, Event.EXPIRE_ATTACHMENT, …)` is the pattern every other working application notification already uses, resolves the campus template with a fallback to the seeded master row, and needs no schema, API or UI change
- **Convention cited:** `engineering-standards` → extend existing patterns, smallest safe change, constructor injection only
- **Evidence:** `ApplicationServiceImpl.java:651-656` (existing caller pattern); `NotificationServiceImpl.java:807-844` (template fallback)
- **Status:** LOCKED

### D-5 — Track proposed: full
- **Stage:** plan, iteration 1
- **Decided by:** planner (pending human confirmation)
- **Options considered:** light — rejected, fails one `harness-core` → Tracks criterion: the change touches existing rows in effect, because the notification has never fired and the first run after deploy evaluates every pre-existing attachment with an expiry date across all tenants, a backlog-notification blast radius the light track's single evaluation round doesn't cover
- **Why:** every other light criterion holds (root cause established, 1 repo, no new entity/table/workflow/notification event, no auth/deletion-check change, no schema change) but the never-fired-before backlog risk warrants a second evaluation round
- **Convention cited:** `harness-core` → Tracks
- **Evidence:** `plan.md` → Regression surface, Blast radius
- **Status:** LOCKED (pending human confirmation of repos/track)

### D-6 — Plan stopped NEEDS_INPUT: notification cadence and backlog handling are undetermined
- **Stage:** plan, iteration 1
- **Decided by:** planner
- **Options considered:** guess a reminder cadence from the ambiguous code/template wording — rejected, `harness-core` → never fabricate; guessing risks either spamming applicants with duplicate emails or silently notifying for QA's own repro window
- **Why:** the code's variable name/template wording implies a look-ahead reminder, but the actual query looks backward at already-expired attachments — genuinely ambiguous intent that only QA/product can resolve (packet Q1); and the first-deploy backlog-notification blast radius needs a product decision (packet Q2)
- **Convention cited:** `harness-core` → Evidence-based verification; never fabricate ticket content or intent
- **Evidence:** `qa-packet.md`
- **Status:** LOCKED
