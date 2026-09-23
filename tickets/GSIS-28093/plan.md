# Plan: GSIS-28093 (bug), Fee Category duplicated in the Final Sponsor Invoice

Revision 1 · Line base · per D-1: `base/bugfix/GSIS-28093-final-invoice-duplicate-fee-category` from `base-development`, PR to `base-sandbox-qa` · Status: READY_FOR_IMPLEMENTATION · Proposed track: light

## Part 1: Understand

### Attachments
Recording `bandicam 2026-09-08 12-08-35-002.mp4` (19 frames read in order, no audio). QA environment, route `#/finance/manage-fees-charges/sponsor…`.
- `@ 00:00–00:14`: Sponsor Invoices wizard, from pending interim invoices to a final-invoice draft row. No. of Interim Invoices = 2.
- `@ 00:19–00:21`: toast "Sponsor final invoice generated successfully".
- `@ 00:31–01:06`: View of the new final invoice.
  - Charge row 1 covers one interim invoice with two Module Registration Fee course charges, and its Fee Category shows **"Tuition Fee, Tuition Fee"**.
  - Row 2 has a single Application Fee charge and shows no duplicate.
  - The "Interim Invoice Details" grid shows the same duplication.
- `@ 01:15–01:22`: printed PDF. The duplication appears in both the charge table and the interim-details table.
- Conclusion: the defect shows on three surfaces (view charge table, view interim grid, PDF). The fee category of each row is built from the linked interim invoice's charges.

### Problem
- **Actual:** a row covering an interim invoice with N charges in the same category repeats the category name N times.
- **Expected:** each distinct category appears once.
- **Scope:** not Tuition-specific. Any category with 2+ charges in one interim invoice is affected. Mixed categories should still list each distinct name.

### Repositories
| Repo | Role | Evidence |
|---|---|---|
| sis-product-sis-admin-backend | **change** | Every fee-category string is composed here |
| sis-product-sis-frontend | context | `view-edit-sponsor-invoice.component.ts:205-207` and `manage-invoices-list.component.ts:1139` display `feeCategoryDescription` / `feeCategory` as received. No joining happens in the UI. |
| other 6 repos | context | No sponsor-invoice references, not in the flow |

### Root cause
A final sponsor invoice row's fee category is computed at read time. The code joins the fee category name of **every** charge on the linked interim invoice (`Collectors.joining(", ")` / `StringJoiner`) and does not de-duplicate.

Evidence (`sis-product-sis-admin-backend` @ `origin/base-development` `1b9c03888a`):
1. `src/main/java/com/ubs/sis/finance/service/impl/InvoiceServiceImpl.java` `getDtoById` ~L4566-4572: the View charge table.
2. Same file, `getList` ~L2857-2864: the PDF charge table (via `getModels` L564) and list consumers.
3. Same file, `mapEntityListToResponses` ~L524-531: charges with scholarship batches.
4. `src/main/java/com/ubs/sis/finance/service/impl/SponsorInvoiceServiceImpl.java` `buildInterimInvoiceResponseDto` L1460-1486: the interim grid on View and in the PDF.

**Stored data is not duplicated.**
- `generateSponsorFinalInvoice` (L458-495) persists one final charge per interim invoice.
- The invoice-level `feeCategoryDescription` is already de-duplicated with a `HashSet` (~L1201-1222).
- `InvoiceCharge` has no description column.
- So no data fix is needed, and existing invoices display correctly once the fix is deployed.

Ruled out:
- duplicate persisted charge rows (the recording shows 2 rows for 2 interim invoices);
- frontend concatenation;
- FreeMarker joining (`sponsor-final-invoice.ftl:148`, `:269` print the value as-is).

## Part 2: Plan

### Track: light
- Root cause is established with evidence.
- One repo changes.
- No contract change.
- No new entity, workflow or notification.
- No auth, deletion or data-fix involvement.

### Change (sis-product-sis-admin-backend)
1. Add `src/main/java/com/ubs/sis/finance/util/InvoiceFeeCategoryUtils.java`.
   - Follows the `EarlySettlementAllocationUtils` pattern: a `final` class, private constructor, a pure static method.
   - The method is `joinDistinctFeeCategoryNames(Collection<InvoiceChargeResponseDto>)`.
   - It skips a null charge, null category or blank name, removes duplicates keeping first-seen order, and joins with `", "`.
   - It returns `null` when nothing is left, so the existing null fallbacks still work.
2. `InvoiceServiceImpl`: replace the three inline joining expressions (`getDtoById`, `getList`, `mapEntityListToResponses`) with the helper.
3. `SponsorInvoiceServiceImpl.buildInterimInvoiceResponseDto`: set `feeCategory` from the helper, keeping `""` when it returns null (`Objects.toString(result, "")`). Leave description and batch-code joining untouched.

Side effect: this also avoids an NPE when an interim charge has no fee category. Call it out in the PR.

### Regression surface
- **Direct:** fee category text on the Sponsor Invoice View (charge table and interim grid), the sponsor final invoice PDF (both tables), and Manage Invoices rows showing `feeCategoryDescription`.
- **Preserve:**
  - single-category rows;
  - mixed categories (all distinct names, in charge order);
  - non-sponsor invoices, which fall back to null → `feeCategory.name`;
  - the draft/regenerated view;
  - the invoice-level description in the Excel/list export (untouched).
- **Likeliest regression:** the helper returning `""` instead of `null`, which would disable the fallback.

### Tests
- **Regression (unit):** new `src/test/java/com/ubs/sis/finance/util/InvoiceFeeCategoryUtilsTest.java`, plain JUnit 5 like `EarlySettlementAllocationUtilsTest`.
  - Two Tuition Fee charges give "Tuition Fee". This case fails against the old behaviour.
  - Mixed categories come out in first-seen order.
  - A single charge gives its name.
  - Null/empty input gives null or is skipped.
- **Optional:** a Mockito-only `SponsorInvoiceServiceImpl` interim-detail test, if it can be built without a Spring context. Otherwise, report the omission and the reason.
- **Commands:**
  - `gradle -p sis-product-sis-admin-backend test --tests "com.ubs.sis.finance.util.*"` with the repo's out-of-repo init script;
  - `gradle -p sis-product-sis-admin-backend build -x test`, time-boxed to about 15 minutes.
  - If either cannot run, report it as written but not executed.
- **Manual (QA env):**
  - Generate a final invoice from an interim invoice with 2+ Tuition Fee courses. View (charge row and interim grid) and the PDF should show "Tuition Fee" once.
  - Reopen an existing final invoice. It should also show a single value.
  - Check one mixed-category interim invoice.

### Open questions (non-blocking)
- Mixed-category rows keep listing all distinct categories (current behaviour, kept).

### Findings (out of scope)
- `generateSponsorFinalInvoice` stores only the last interim charge's `feeCategoryId` (SponsorInvoiceServiceImpl L481-483). With mixed categories the stored category is arbitrary.
- The invoice-level description uses the separator `" , "` (InvoiceServiceImpl ~L1213), not `", "`.
- The PDF/View fee category never uses `name2L`.

## Codebase map corrections
None.
