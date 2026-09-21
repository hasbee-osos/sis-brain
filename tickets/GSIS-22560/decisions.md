### D-1 — Routing: bug on the base line
- **Stage:** routing, iteration 1
- **Decided by:** orchestrator · confirmed by human 2026-09-21T17:54:07Z
- **Options considered:** none — routing is fixed by `git-workflow` from the Jira Customer Name field
- **Why:** Jira issue type is Bug, so work type is bug and branch type is `bugfix`. Customer Name is 'Product Core Feature', so line is `base`.
- **Decision:** work type bug; line base; branch `base/bugfix/GSIS-22560-component-id-save-order` (same name in every changed repo); cut from `base-development`; PR against `base-sandbox-qa`.
- **Convention cited:** `git-workflow` → The routing decision, Branch naming
- **Evidence:** Jira GSIS-22560 (issue type Bug, Customer Name Product Core Feature)
- **Status:** LOCKED

### D-2 — Root cause: component code is numbered from a row count, not from the highest existing code
- **Stage:** plan, iteration 1
- **Decided by:** planner · human confirmation at repos and track (pending at 2026-09-21T18:11:17Z)
- **Options considered:** count-based generation (current); highest-code-based generation; DB sequence
- **Why:** `preCreateEntity` builds `CMP-%04d` from a non-atomic native `COUNT(*)` (no `deleted` filter, no lock) read once per request before the insert, and `component_code` has no unique constraint. Once two overlapping saves mint the same code, count exceeds the highest code and every later create skips a number. Row Save is already guarded by `aa7425dbb7`; `saveAll()` is not.
- **Convention cited:** n/a (root cause)
- **Evidence:** `sis-product-sis-admin-backend/src/main/java/com/ubs/sis/mainexam/service/impl/ComponentTypeServiceImpl.java:90-96`; `sis-product-sis-admin-backend/src/main/java/com/ubs/sis/mainexam/repository/ComponentTypeRepository.java:8-14`; `sis-product-sis-frontend/src/app/modules/examination/masters/component-type/component-type-list/component-type-list.component.ts` (`saveAll`)
- **Status:** LOCKED

### D-3 — Fix approach: next code = highest existing code in the assignment + 1; add the re-entry guard to Save All
- **Stage:** plan, iteration 1
- **Decided by:** planner · human confirmation at repos and track (pending at 2026-09-21T18:11:17Z)
- **Options considered:** (a) unique index on component_code + retry; (b) DB sequence / advisory lock / new @Transactional boundary; (c) frontend-only guard; (d) backfill existing codes; chosen: highest-code query + Save All guard
- **Why:** Smallest safe change: keeps the change in the existing `preCreateEntity` hook, no schema change, no contract change. (a) needs Liquibase and fails where duplicates already exist; (b) alters a shared base-class flow for a P4 bug; (c) cannot repair count/max divergence or cover another user; (d) touches existing rows (Q1). Soft-deleted rows stay in scope of the query so their numbers are not reused.
- **Convention cited:** `engineering-standards` → smallest safe change; existing precedent `RoleServiceImpl.generateRoleID` / `MiscUtils.extractNumericPart`
- **Evidence:** `sis-product-sis-admin-backend/src/main/java/com/ubs/sis/util/MiscUtils.java:328`; `RoleServiceImpl.java:164-190`
- **Status:** LOCKED

### D-4 — Test strategy: backend regression test on count > max, frontend spec for the Save All guard
- **Stage:** plan, iteration 1
- **Decided by:** planner · human confirmation at repos and track (pending at 2026-09-21T18:11:17Z)
- **Options considered:** integration test on H2; plain Mockito fallback; frontend-only test
- **Why:** Proves the ticket: an assignment whose row count exceeds the highest code must yield `max + 1` (current code yields `count + 1`, so the test fails before the fix). Also covers delete-then-create and the empty assignment. Frontend spec proves a second `saveAll()` during an in-flight save is ignored. Real commands and results are recorded; a runner that cannot execute is reported as not executed.
- **Convention cited:** `engineering-standards` → risk-based testing
- **Evidence:** Plan section Tests; `StructureMasterServiceIT` as the pattern
- **Status:** LOCKED

### D-5 — Accepted limitation: two truly simultaneous creates can still mint the same code
- **Stage:** plan, iteration 1
- **Decided by:** planner · human confirmation at repos and track (pending at 2026-09-21T18:11:17Z)
- **Options considered:** accept and follow up; add a unique constraint + retry now
- **Why:** The ordering defect reported in this ticket is removed either way; a durable guarantee needs a schema change (unique constraint + retry, or a shared sequence) that widens this P4 fix, and the same `count + 1` pattern exists in other masters (Q3). Proposed as a follow-up ticket.
- **Convention cited:** `engineering-standards` → smallest safe change
- **Evidence:** Plan Q3; `AssessmentGroupServiceImpl:89-95`, `CalculationMethodServiceImpl:101-107`, `AssessmentPlanningServiceImpl:138-140`
- **Status:** LOCKED
