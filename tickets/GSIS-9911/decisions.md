### D-1 — Routing: bug on the base line, cut from base-development
- **Stage:** plan, iteration 0
- **Decided by:** orchestrator · confirmed by human 2026-09-23T06:28:06Z
- **Options considered:** cut from `base-sandbox-qa` (the `git-workflow` default for the base line); cut from `base-development`
- **Why:** Jira issue type is Bug; Customer Name is "Product Core Feature", which maps to the `base` line. The developer chose to cut the branch from `base-development` instead of `base-sandbox-qa` so the branch carries no unverified tickets; the PR still targets `base-sandbox-qa`.
- **Convention cited:** `git-workflow` → The routing decision (source branch overridden by the developer)
- **Evidence:** Jira GSIS-9911 issuetype = "Bug"; Customer Name = "Product Core Feature"
- **Status:** LOCKED

Work type: `bug` · Line: `base` · Branch: `base/bugfix/GSIS-9911-approval-matrix-missing-workflows` · Source branch: `base-development` · PR target: `base-sandbox-qa`
