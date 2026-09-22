### D-1 — Routing: bug on the base line
- **Stage:** plan, iteration 1
- **Decided by:** orchestrator · confirmed by human 2026-09-22T11:22:38Z
- **Options considered:** none — Customer Name maps deterministically per `git-workflow`
- **Why:** Jira issue type is Bug; Customer Name field is "Product Core Feature", which maps to the `base` line
- **Convention cited:** `git-workflow` → The routing decision
- **Evidence:** Jira GSIS-11642 fields.issuetype.name = "Bug"; customFields."Customer Name".value[0].value = "Product Core Feature"
- **Status:** LOCKED

Work type: `bug` · Line: `base` · Branch: `base/bugfix/GSIS-11642-attachment-expiry-notification` · Source branch: `base-development` · PR target: `base-sandbox-qa`
