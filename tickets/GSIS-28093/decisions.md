# GSIS-28093 — Decisions

### D-1 — Routing: bug on the base line, cut from base-development
- **Stage:** plan, iteration 0
- **Decided by:** orchestrator · confirmed by human 2026-09-23T10:41:20Z
- **Options considered:** cut from `base-sandbox-qa` (the default for the base line); cut from `base-development`
- **Why:** Jira issue type is Bug; Customer Name is "Product Core Feature", which maps to the `base` line. The developer chose to cut the branch from `base-development` so it carries no unverified tickets; the PR still targets `base-sandbox-qa`. The ticket's label SIS-OSOS-QA does not change routing.
- **Convention cited:** routing decision by Customer Name (source branch overridden by the developer)
- **Evidence:** Jira GSIS-28093 issuetype = "Bug"; Customer Name = "Product Core Feature"
- **Status:** LOCKED

Work type: `bug` · Line: `base` · Branch: `base/bugfix/GSIS-28093-final-invoice-duplicate-fee-category` · Source branch: `base-development` · PR target: `base-sandbox-qa`
