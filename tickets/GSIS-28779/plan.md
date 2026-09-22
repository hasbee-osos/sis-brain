# Plan

Ticket: GSIS-28779
Work type: bug
Track: **light** — root cause established with code evidence (below); **1 repo changes** (`sis-product-sis-admin-backend`), frontend is context only; the change is one JPA predicate inside an existing `if` block, gated by an existing request flag; no contract change, no new entity/table/workflow/notification, no `@PreAuthorizeGrant` or deletion-check change, no data backfill or touching of existing rows. Meets every light criterion in `harness-core` → Tracks.

# Part 1 — Understanding

## Problem

On Finance → Manage Fees & Charges → Manage Invoices, selecting a single value in the **Status** filter still lists invoices whose displayed Status is different (e.g. "Pending" selected, "Cancelled" rows shown).

## Expected / Observed

- **Expected:** the grid (and its record count / exports) show only invoices whose Status — as displayed in the Status column — equals the selected filter value.
- **Observed:** with Status = Pending, the list mixes red "Pending" rows (invoice type FINAL) with grey "Cancelled" rows (invoice type SPONSOR), and the counter reads "1 - 68 of 68", so the extra rows are counted server-side too.

## Attachments

| Attachment | Read | What it shows |
|---|---|---|
| `image-20260916-115948.png` | image (single screenshot, no recording) | Manage Invoices grid on `sis-qa-osos.gears-int.com`, URL query `…manage-invoices?pageSize=100&sortDirection=DESC&invoiceTypes=SPONSOR&invoiceTypes=FINAL&invoiceTypes=SYSTEM_CHANGEOVER&isManageInvoice=true&paidStatu…` (truncated). Status filter dropdown = "Pending". Result rows interleave "Pending" badges (all rows of type **FINAL**) and "Cancelled" badges (all rows of type **SPONSOR**); pager "1 - 68 of 68". Admin-type user session. |

Two things the screenshot establishes beyond the written steps: (a) the request does carry `isManageInvoice=true` and a `paidStatu…` parameter, so the filter *is* sent; (b) the mis-matching rows are exclusively invoice type SPONSOR — no PAID/PARTIALLY PAID rows leak in, which rules out "the filter is ignored entirely".

## Repositories

| Repo | Role | Why (evidence) |
|---|---|---|
| `sis-product-sis-admin-backend` | **change** | The Status filter is applied server-side in `sis-product-sis-admin-backend/src/main/java/com/ubs/sis/finance/repository/specification/InvoiceSpecification.java:97-100`; that predicate is where the defect is. |
| `sis-product-sis-frontend` | context | Screen and the Status column's display rule (`…/manage-invoices-list/manage-invoices-list.component.ts:129-136`); it sends the filter but needs no change. |

Flow: `sis-product-sis-frontend/src/app/modules/finance/manage-fees-charges/manage-invoices/manage-invoices-list/manage-invoices-list.component.ts:166,820-827` (sets `filter.isManageInvoice = true`; filter item `field: 'paidStatus'`, `valueField: 'id'`, options from `/paid-statuses`) → `GET /api/v1/invoices?…&isManageInvoice=true&paidStatus=<id>` → `sis-product-sis-admin-backend/src/main/java/com/ubs/sis/controller/v1/api/finance/InvoiceController.java:89-93` (`getList(InvoiceFilterDto)`) → `finance/service/impl/InvoiceServiceImpl.java:2754` → `createSpecification` (`InvoiceServiceImpl.java:3859-3861`) → `InvoiceSpecification` → `sis_finance_invoice` join `sis_finance_paid_status`.

## Root Cause (bug)

**The Manage Invoices grid displays an invoice's status as CANCELLED whenever `invoice.sponsorInvoiceStatus = CANCELLED` (regardless of its `paidStatus`), but the server-side Status filter matches only `invoice.paidStatus.id`, so sponsor invoices that were cancelled without their `paidStatus` ever changing (it stays PENDING) are returned by the "Pending" filter and rendered as "Cancelled".**

Evidence:

1. Display rule (frontend override, exists only on this screen):
   `sis-product-sis-frontend/src/app/modules/finance/manage-fees-charges/manage-invoices/manage-invoices-list/manage-invoices-list.component.ts:129-136`
   ```ts
   paidStatusId: (invoice: Invoice): StatusDataItem => {
       if (invoice?.sponsorInvoiceStatus === SponsorInvoiceStatus.CANCELLED) {
           return this.paidStatusList?.find(paidStatusValue => paidStatusValue?.code === InvoicePaymentStatus.CANCELLED);
       }
       return this.paidStatusList?.find(valueOfPaidStatus => valueOfPaidStatus?.code === invoice?.paidStatus?.code);
   },
   ```
   `git grep SponsorInvoiceStatus.CANCELLED` over `sis-product-sis-frontend/src` returns only this component — no other screen has this override.
2. Filter rule (backend), `sis-product-sis-admin-backend/src/main/java/com/ubs/sis/finance/repository/specification/InvoiceSpecification.java:97-100`:
   ```java
   if (filterDto.getPaidStatus() != null) {
       Join<Invoice, PaidStatus> paidStatusJoin = root.join(Invoice.FIELD_PAID_STATUS);
       predicates.add(criteriaBuilder.equal(paidStatusJoin.get(BaseEntity.FIELD_ID), filterDto.getPaidStatus()));
   }
   ```
   `sponsorInvoiceStatus` is never consulted here.
3. The two states really can diverge: cancelling a sponsor invoice sets only the sponsor status —
   `finance/service/impl/SponsorInvoiceServiceImpl.java:914` (`cancelDraftedSponsorInvoice`) and `:1560` (`regenerateSponsorInvoice`) both call `setSponsorInvoiceStatus(SponsorInvoiceStatus.CANCELLED)` and save, leaving `paidStatus` untouched (it is PENDING from creation, `InvoiceServiceImpl.java:4175-4176`). By contrast the ordinary invoice-cancel path *does* set the paid status: `InvoiceServiceImpl.java:3306-3312` (`updateInvoiceToCancelled` → `paidStatusRepository.findByCode(FinanceUtils.INVOICE_CANCELLED_STATUS)`). So only sponsor-cancelled invoices carry the mismatch — matching the screenshot, where every mismatched row is type SPONSOR.
4. Those rows are in the list deliberately: `InvoiceSpecification.java:181-201` includes sponsor invoices with `sponsorInvoiceStatus in (SUBMITTED, APPROVED, CANCELLED)` when `isManageInvoice = true`.
5. `PaidStatus` has a CANCELLED row (`src/main/resources/db/changelog/V2/1-table_modifications/000491-init-paid-status-lookup.xml:21`), so "Cancelled" is a selectable option in the same dropdown — the bug is symmetric: selecting **Cancelled** today *omits* sponsor-cancelled invoices that the grid shows as Cancelled.

Alternatives ruled out:

- *The frontend sends the wrong parameter / the filter is dropped.* Ruled out: the filter item's `field` is `paidStatus` (`manage-invoices-list.component.ts:821`) and the common filter writes `filter[filterItem.field] = value` (`src/@gears-commons/component/filter/filter-component.html:25`), matching `InvoiceFilterDto.paidStatus` (`finance/dto/filter/InvoiceFilterDto.java:26`); and the screenshot shows no PAID/PARTIALLY PAID rows, which a dropped filter would show.
- *Client-side paging shows a stale page.* Ruled out: the list is paged in the DB (`InvoiceServiceImpl.getList:2754` → `InvoiceService.super.getList`/`findAll(filterDto, pageRequest)`), and the total (68) is the server count.
- *The status column is bound to the wrong field.* Ruled out: the column binds `field: 'paidStatus'` (`manage-invoices-list.component.ts:820-821`) with the override above; the value shown is deliberate.
- *A second, broken status filter (`paidStatusIdList`) is in play.* Ruled out: the screen never sets it; `paidStatusIdList` is a separate predicate (`InvoiceSpecification.java:356-359`) not sent by this screen.

## Open Questions

None blocking. One product decision is recorded as an assumption in Part 2: after the fix, "Cancelled" also returns sponsor-cancelled invoices (i.e. the filter matches exactly what the Status column shows, in both directions). This follows the ticket's Expected Result; if Finance wants "Cancelled" to keep meaning "paid status cancelled only", say so and the second OR-branch is dropped.

# Part 2 — Plan

## Decisions

- **Following:** D-1 (bug on the base line; branch `base/bugfix/GSIS-28779-invoice-status-filter`, source `base-development`, PR target `base-sandbox-qa`).
- **New:** root cause (D-2), fix approach (D-3), test strategy (D-4) — see `decisions.md`.
- **Superseding:** None.

## Conventions That Apply

- `engineering-standards` → backend: extend the existing `*Specification` pattern; no new service boundary; keep the existing `FinanceUtils.INVOICE_CANCELLED_STATUS` constant instead of a literal (`src/main/java/com/ubs/sis/util/FinanceUtils.java:13`); no commented-out code.
- `engineering-standards` → Changing the code: smallest safe change; preserve the existing REST contract (`InvoiceFilterDto` gains no field — the fix uses the `isManageInvoice` flag that already exists, `InvoiceFilterDto.java:53`).
- `engineering-standards` → Testing: repository/SQL behaviour is material here, so the proving test must run the predicate against a real DB (H2 is what this repo's ITs use), not mocks alone.
- Database: no schema change, no Liquibase script, no data change.

## Change

### sis-product-sis-admin-backend

Files:
- `src/main/java/com/ubs/sis/finance/repository/specification/InvoiceSpecification.java` (the `filterDto.getPaidStatus() != null` block, lines 97-100).
- New test `src/test/java/com/ubs/sis/finance/repository/specification/InvoiceSpecificationIT.java`.

Steps:
1. In the `getPaidStatus()` block, keep the existing predicate `paidStatusJoin.id = filterDto.getPaidStatus()` as the default path (used by every non-manage-invoice caller).
2. When `Boolean.TRUE.equals(filterDto.getIsManageInvoice())`, replace it with the OR of two branches:
   - `sponsorInvoiceStatus` is **not** CANCELLED **and** `paidStatus.id = <selected>`;
   - `sponsorInvoiceStatus = CANCELLED` **and** the selected id is the CANCELLED paid status.
   For the second branch resolve the selected id's code with a criteria subquery over `PaidStatus` (the class already uses subqueries — `InvoiceSpecification.java:341-345`), e.g. `select ps.code from PaidStatus ps where ps.id = :paidStatus` compared to `FinanceUtils.INVOICE_CANCELLED_STATUS`; this avoids parsing the String filter value to a Long and keeps the same String-to-id coercion the current line already relies on.
3. **`sponsorInvoiceStatus` is nullable** (`finance/domain/Invoice.java:317-319`, `@Enumerated(EnumType.STRING)`), so the "not cancelled" branch must be `isNull(sponsorInvoiceStatus) OR notEqual(sponsorInvoiceStatus, CANCELLED)` — a bare `notEqual` evaluates to NULL for every non-sponsor invoice and would empty the grid. This is the single highest-risk detail of the change.
4. Use the existing constants `Invoice.FIELD_SPONSOR_INVOICE_STATUS` (`Invoice.java:137`) and `Invoice.FIELD_PAID_STATUS`; do not add a new join on `root` (avoid duplicate rows).
5. No frontend change.

## Cross-Repo Contracts

None — single repo. The request contract (`paidStatus`, `isManageInvoice` query params) is unchanged, so no deploy ordering.

## Regression Surface

- **Changed directly:** the `paidStatus` predicate, and only when `isManageInvoice = true`. That flag is set in exactly one place in the product (`manage-invoices-list.component.ts:166`; `git grep isManageInvoice` finds no other setter), so the blast radius is the Manage Invoices grid plus its own PDF/Excel exports, which reuse the same filter and specification (`InvoiceController.java:300-314` → `InvoiceServiceImpl.exportInvoiceListAsPdf:1454` / `exportInvoiceListAsExcel:1591` → `getInvoiceList:1437` → `findAll`).
- **Must stay unchanged** (none of these set `isManageInvoice`): student View Invoices (`controller/v1/api/student/finance/ViewInvoicesController`), mobile app (`MobileAppServiceImpl.java:334`, `MobileAppCourseRegistrationServiceImpl.java:873`), payment receipts (`PaymentReceiptServiceImpl.java:4043`), account statement (`AccountStatementServiceImpl.java:154`); and the other paid-status predicates in the same class — `paidStatusIdList` (`:356-359`), `isExcludeCancelledInterim` (`:361-366`), `isExcludeFullyPaid` (`:368-373`), the keyword search on paid-status name (`:416-419`).
- **Likeliest regressions:** (1) NULL handling as in step 3 — non-sponsor invoices vanish from every status filter on the screen; (2) filtering a status other than Pending/Cancelled (PAID, PARTIALLY PAID, ON-HOLD) accidentally excluding sponsor invoices that are *not* cancelled; (3) the total count diverging from the rows if the predicate behaves differently in the count query (the subquery must work there too); (4) Owner Type + Status combined — when `ownerType` is set, the `isManageInvoice` block at `:181` is skipped but the flag is still true, so the new predicate must still be correct in that combination.
- **Related defects found, deliberately out of scope** (report as findings, do not fix here): the Excel/PDF export writes `paidStatus.getName()` (`InvoiceServiceImpl.java:1792`) without the sponsor override, so an exported sponsor-cancelled row still reads "Pending"; and the "Search Keywords" box matches the paid-status name only (`InvoiceSpecification.java:416-419`), so those rows are not found by searching "cancel".

## Tests

### sis-product-sis-admin-backend

- **The test that proves the ticket** — new `src/test/java/com/ubs/sis/finance/repository/specification/InvoiceSpecificationIT.java`, `@SpringBootTest` + H2 (pattern: `src/test/java/com/ubs/sis/administration/service/StructureMasterServiceIT.java`; test datasource `src/test/resources/application.yml`, `ddl-auto: create`, Liquibase off). Seed `PaidStatus` PENDING and CANCELLED plus three invoices: A = paidStatus PENDING, non-sponsor; B = paidStatus PENDING, `isSponsorInvoice = true`, `sponsorInvoiceStatus = CANCELLED`; C = paidStatus CANCELLED, non-sponsor. Then `invoiceRepository.findAll(new InvoiceSpecification(dto))`:
  - `{isManageInvoice=true, paidStatus=PENDING.id}` → contains A, **excludes B** (this assertion fails on current `base-development`), excludes C.
  - `{isManageInvoice=true, paidStatus=CANCELLED.id}` → contains B and C, excludes A.
  - **Pinning:** `{paidStatus=PENDING.id}` with `isManageInvoice` unset → contains A **and** B (other consumers unchanged).
  Command: `gradle -p sis-product-sis-admin-backend test --tests "com.ubs.sis.finance.repository.specification.InvoiceSpecificationIT"`.
- **Fallback if the Spring context cannot boot in this environment within the ~15-minute time box** noted in `sis-brain/codebase/sis-product-sis-admin-backend.md`: write the same cases as a mock-based `InvoiceSpecificationTest` in the style of `src/test/java/com/ubs/sis/administration/repository/specification/BatchMasterSpecificationTest.java` (set `ownerType` to a non-SPONSOR value so the `:181` block is skipped and only the new code touches `sponsorInvoiceStatus`), and record in the implementation report that the behavioural DB-level assertion was not executed and why. Do not silently swap the stronger test for the weaker one.
- Also run the ArchUnit suites: `gradle -p sis-product-sis-admin-backend test --tests "com.ubs.sis.archunit.*"`.
- **Manual check (QA/dev, on the ticket branch):** Manage Invoices → Status = Pending → no "Cancelled" badge in the list and the pager total drops accordingly; Status = Cancelled → the sponsor-cancelled rows appear; Status = Paid and Owner Type = Sponsor → unchanged; Export to Excel with Status = Pending → same row count as the grid. Also spot-check student View Invoices and the receipt invoice picker for unchanged lists.

### sis-product-sis-frontend

No code change. No spec exists for `ManageInvoicesListComponent` and none is added — the component's display rule is unchanged.

## Risk

**Low** — one predicate, gated by a flag set on a single screen, no schema or contract change; the only real hazard is the NULL semantics of `sponsorInvoiceStatus`, which the regression test's pinning case covers.

## Codebase map corrections

None — the map was accurate for this ticket: `generated/screens.md` gave `ManageInvoicesListComponent` and its path directly, and `…endpoints.md:1416` gave `InvoiceController#getList` at `InvoiceController.java:90` (the method is at :92, the annotation at :89 — within normal drift). One useful addition for `sis-brain/codebase/sis-product-sis-admin-backend.md` → "Where things live": *list/grid filters are `<Entity>Specification` classes in `src/main/java/com/ubs/sis/<domain>/repository/specification/`, driven by `<Entity>FilterDto` whose field names are exactly the query params the common frontend filter emits (`filterItem.field`)* — that one line is the whole path from "a filter misbehaves on screen X" to the code, and it is not in the notes today.

## Status

READY_FOR_IMPLEMENTATION
