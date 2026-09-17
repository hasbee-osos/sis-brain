# GSIS-28778 — Decisions

### D-1 — Work type bug, Flow A (base), branch base/bugfix/GSIS-28778-module-relationship-rule-propagation from base-development
- **Stage:** analyze, iteration 1
- **Decided by:** harness · confirmed by human 2026-09-17T05:16:24Z
- **Options considered:** Flow A base line with work type bug; Flow A with work type feature (the ACs restate the whole GSIS-20628 inheritance and override design); escalate as OSOS (recording made on OSOS staging, label SIS-OSOS-QA)
- **Why:** the ticket marks the customer as "Product Core Feature", so the fix belongs in the shared base product; the OSOS environment receives base images by commit SHA through DevOps, so no OSOS branch flow is needed. The Jira type Bug is kept; if the Analyzer finds the propagation was never built, the work type is revisited with a superseding record. Stage 1 PR → base-sandbox-qa; stage 2 → gcet-sandbox-qa and gutech-sandbox-qa after the human confirms stage 1 is on base-qa.
- **Convention cited:** git-workflow → Flow A for common tickets; work-types → Bug maps to bug / bugfix
- **Evidence:** Jira GSIS-28778 fields Issue Type = Bug, Customer Name = Product Core Feature, label SIS-OSOS-QA; C0_REQ_Consition_violation.mp4 @ 00:00 address bar shows the OSOS staging host
- **Status:** LOCKED
