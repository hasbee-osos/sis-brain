### D-1 — Routing: bug on the base line
- **Stage:** plan, iteration 1
- **Decided by:** orchestrator · confirmed by human 2026-09-22T02:15:00Z
- **Options considered:** none — Customer Name maps deterministically per `git-workflow`
- **Why:** Jira issue type is Bug; Customer Name field is "Product Core Feature", which maps to the `base` line
- **Convention cited:** `git-workflow` → The routing decision
- **Evidence:** Jira GSIS-28779 fields.issuetype.name = "Bug"; customFields."Customer Name".value[0].value = "Product Core Feature"
- **Status:** LOCKED

Work type: `bug` · Line: `base` · Branch: `base/bugfix/GSIS-28779-invoice-status-filter` · Source branch: `base-development` · PR target: `base-sandbox-qa`

### D-2 — Root cause: Status filter ignores the sponsor-cancelled override the grid displays
- **Stage:** plan, iteration 1
- **Decided by:** planner
- **Options considered:** filter ignored/dropped entirely; client-side stale paging; status column bound to wrong field; a second broken filter (`paidStatusIdList`) in play — all ruled out with evidence
- **Why:** the Manage Invoices grid renders an invoice's Status as CANCELLED whenever `invoice.sponsorInvoiceStatus = CANCELLED`, overriding `paidStatus` (frontend-only rule), but the server-side Status filter matches only `invoice.paidStatus.id` and never consults `sponsorInvoiceStatus`. Sponsor invoices cancelled via `cancelDraftedSponsorInvoice`/`regenerateSponsorInvoice` never get their `paidStatus` updated (stays PENDING from creation), so they pass the "Pending" filter but render as "Cancelled" — matching the screenshot, where every mismatched row is type SPONSOR.
- **Convention cited:** n/a (defect, not a convention deviation)
- **Evidence:** `sis-product-sis-frontend/.../manage-invoices-list.component.ts:129-136`; `sis-product-sis-admin-backend/src/main/java/com/ubs/sis/finance/repository/specification/InvoiceSpecification.java:97-100`; `SponsorInvoiceServiceImpl.java:914,1560`; `InvoiceServiceImpl.java:3306-3312,4175-4176`
- **Status:** LOCKED

### D-3 — Fix approach: match the effective status in `InvoiceSpecification`, gated by `isManageInvoice`
- **Stage:** plan, iteration 1
- **Decided by:** planner
- **Options considered:** (a) also set `paidStatus = CANCELLED` when a sponsor invoice is cancelled, plus a backfill of existing rows — rejected: overloads a payment-status column with invoice lifecycle, touches existing rows (pushes the ticket to full track), and changes branching in payment/GL/add-drop paths that read the paid-status code; (b) filter client-side after load — rejected: breaks server-side paging/count/exports; (c) remove the frontend display override — rejected: hides that a sponsor invoice is cancelled, contradicts the ticket's Expected Result; (d) post-filter in `InvoiceServiceImpl.getList` — rejected: same paging/count problem
- **Why:** smallest change that makes the filter match exactly what the Status column already shows, with no contract, schema or existing-row change; gating on the existing `isManageInvoice` flag (set only by this screen) keeps every other `paidStatus` consumer unchanged
- **Convention cited:** `engineering-standards` → extend the existing `*Specification` pattern; smallest safe change; preserve the existing REST contract
- **Evidence:** `InvoiceSpecification.java:97-100,181-201,341-345,356-419`; `InvoiceFilterDto.java:26,53`; `Invoice.java:137,317-319`
- **Status:** LOCKED

### D-4 — Test strategy: repository-level IT against H2, plus a pinning case for unrelated consumers
- **Stage:** plan, iteration 1
- **Decided by:** planner
- **Options considered:** mock-only unit test — rejected as primary since the defect is in a JPA Criteria predicate, which mocks would not exercise realistically; noted as a fallback if the Spring context cannot boot within the environment's ~15-minute time box
- **Why:** the regression must run the real predicate against a real DB to catch the NULL-semantics hazard (`sponsorInvoiceStatus` nullable) and confirm the fix without breaking the default `paidStatus` predicate used by every other caller
- **Convention cited:** `engineering-standards` → Testing: repository/SQL behaviour needs a DB-backed test, not mocks alone
- **Evidence:** new `InvoiceSpecificationIT.java` (pattern: `StructureMasterServiceIT.java`); fallback pattern `BatchMasterSpecificationTest.java`
- **Status:** LOCKED
