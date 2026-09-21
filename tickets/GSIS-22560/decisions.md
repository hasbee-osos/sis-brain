### D-1 — Routing: bug on the base line
- **Stage:** routing, iteration 1
- **Decided by:** orchestrator · confirmed by human 2026-09-21T17:54:07Z
- **Options considered:** none — routing is fixed by `git-workflow` from the Jira Customer Name field
- **Why:** Jira issue type is Bug, so work type is bug and branch type is `bugfix`. Customer Name is 'Product Core Feature', so line is `base`.
- **Decision:** work type bug; line base; branch `base/bugfix/GSIS-22560-component-id-save-order` (same name in every changed repo); cut from `base-development`; PR against `base-sandbox-qa`.
- **Convention cited:** `git-workflow` → The routing decision, Branch naming
- **Evidence:** Jira GSIS-22560 (issue type Bug, Customer Name Product Core Feature)
- **Status:** LOCKED
