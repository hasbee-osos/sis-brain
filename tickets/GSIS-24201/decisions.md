### D-1 — Work type, flow and branch: bug, Flow A (base), `base/bugfix/GSIS-24201-corequisite-required-validation`
- **Stage:** plan (pre-planning), iteration 0
- **Decided by:** orchestrator (`/work`) · confirmed by human 2026-09-18T14:45:00Z
- **Options considered:** Flow A (base/common) vs Flow B (customer-specific gcet/gutech)
- **Why:** the bug is a general Module-admin co-requisite validation gap, not customer-specific behavior; `SIS-GCET-QA`/`SIS-GUTECH-QA` labels mark both customer lines as QA-relevant, not that the code is customer-specific
- **Convention cited:** `git-workflow` → Flow A (common/base ticket)
- **Evidence:** GSIS-24201 description ("Administration → Master → Module → Co-Requisite section"); no customer-specific field/module referenced
- **Status:** LOCKED
