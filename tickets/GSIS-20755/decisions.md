### D-1 — Routing: base line, bugfix, base-development → base-sandbox-qa
- **Stage:** plan, iteration 1
- **Decided by:** harness (from Jira Customer Name) · confirmed by human 2026-09-21T05:24:00Z
- **Options considered:** none — Customer Name field maps unambiguously per `git-workflow`
- **Why:** Jira issue type is Bug; Customer Name field is `Product Core Feature`, which per `git-workflow` → The routing decision maps to line `base`, cut from `base-development`, PR raised against `base-sandbox-qa`
- **Convention cited:** `git-workflow` → The routing decision, → Branch naming
- **Evidence:** Jira GSIS-20755 fields.customFields["Customer Name"] = "Product Core Feature"; fields.issuetype.name = "Bug"
- **Status:** LOCKED
