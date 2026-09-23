### D-1 — Routing: bug on the base line, cut from base-development
- **Stage:** plan, iteration 0
- **Decided by:** orchestrator · confirmed by human 2026-09-23T10:19:27Z
- **Options considered:** cut from `base-sandbox-qa` (the `git-workflow` default for the base line); cut from `base-development`
- **Why:** Jira issue type is Bug; Customer Name is "Product Core Feature", which maps to the `base` line. The developer chose to cut the branch from `base-development` so it carries no unverified tickets; the PR still targets `base-sandbox-qa`.
- **Convention cited:** `git-workflow` → The routing decision (source branch overridden by the developer)
- **Evidence:** Jira GSIS-26592 issuetype = "Bug"; Customer Name = "Product Core Feature"
- **Status:** LOCKED

Work type: `bug` · Line: `base` · Branch: `base/bugfix/GSIS-26592-configure-fee-stale-credit-point` · Source branch: `base-development` · PR target: `base-sandbox-qa`
