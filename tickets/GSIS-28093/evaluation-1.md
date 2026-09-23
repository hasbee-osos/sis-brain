# Evaluation: GSIS-28093 (bug), iteration 1, light track

## Verdict
**FAIL**. One blocking finding, three recommendations.

| Scope | Result |
|---|---|
| sis-product-sis-admin-backend (HEAD `bb03d3fe96`) | Passes on its own: the four composition sites are fixed, the regression test is proven fail-before/pass-after, and there is no convention breach |
| Cross-repo / completeness | FAIL (E-1) |

## Blocking findings
**E-1. A frontend composition site of the same defect was missed, and D-5's evidence is wrong.**
- **Where:** `sis-product-sis-frontend/src/app/modules/finance/master/sponsor/steps/sponsor-interim-invoice-list/sponsor-interim-invoice-list.component.ts:49-51` @ `origin/base-development`.
- **What it does:** `overriddenValues.feeCategory` maps `invoiceChargeList` to `feeCategory.name` (or `name2L`) and calls `.join(', ')` with no de-duplication.
- **Where it shows:** the visible "Fee Category" column in the child grid of Sponsor master → Invoices. That grid lists the interim invoices of a selected final sponsor invoice (`getInterimInvoicesByFinalInvoiceId`).
- **Effect:** an interim invoice with two Tuition Fee courses still shows "Tuition Fee, Tuition Fee" there.
- **Why the backend fix doesn't cover it:** the value is built client-side, so fixing it needs a change in the frontend, which D-5 marked as context.
- The recording doesn't show this grid. That doesn't make it out of scope.

## Non-blocking findings
- **Fallback preserved.**
  - The interim grid still shows `""`.
  - At the `InvoiceServiceImpl` sites, an empty interim charge list now gives `null`, which falls back to the final charge's `feeCategory.name` (intentional).
  - A charge with no fee category no longer throws an NPE.
- **Other backend sites searched and ruled out:** description, receipt and code joins; `InvoiceChargeServiceImpl:470`; the FreeMarker templates, which print values as-is; no `string_agg`.
- **Test hygiene:** the Javadoc cites a non-existent `InvoiceFeeCategoryOldJoinCharacterizationTest`, and the regression test name ends in `_AC` on a bug.
- **Service wiring:** it has no unit test, for the reason the report gives. Acceptable.

## Required changes
1. A new decision that supersedes D-5, adding `sis-product-sis-frontend` as a change repo, confirmed by the human. Two repos with no contract change still fits light (D-6).
2. De-duplicate the names in `sponsor-interim-invoice-list.component.ts` `feeCategory`, keeping first-seen order and the `name2L` switch.
3. A spec case where two same-category charges give the name once, executed.
4. Add this grid to the manual QA steps: Sponsor master → Invoices → select a final invoice → Fee Category column.

## Recommendations
- R-1: fix the stale Javadoc reference and the `_AC` suffix in `InvoiceFeeCategoryUtilsTest`.
- R-2: call out the empty-interim fallback change and the NPE removal in the PR.
- R-3: correct the codebase note: the frontend composes the fee category for sponsor interim lists.

## Decisions checked
- **D-1:** followed.
- **D-2:** followed for the backend, but the same composition also exists client-side (E-1).
- **D-3:** followed.
- **D-4:** followed; manual QA is pending.
- **D-5:** contradicted by E-1 and not superseded.
- **D-6:** followed.

## Evidence
- Evaluator re-run of `gradle -p sis-product-sis-admin-backend test --rerun --tests "com.ubs.sis.finance.util.InvoiceFeeCategoryUtilsTest" --tests "com.ubs.sis.archunit.*" --init-script <scratchpad init script> -Dorg.gradle.jvmargs="-Xmx3g -XX:MaxMetaspaceSize=1g"`:
  - BUILD SUCCESSFUL.
  - InvoiceFeeCategoryUtilsTest 7/7; AuthArchUnitTest 11/11; MasterArchUnitTest 11/11.
- Independent fail-before check with an out-of-repo program on two "Tuition Fee" charges: the old expression gives "Tuition Fee, Tuition Fee"; the helper gives "Tuition Fee".
- Frontend join confirmed with `git show origin/base-development:<path>`, L51. The orchestrator re-checked it too.
- **Not verified:** manual QA; `@SpringBootTest` (pre-existing context failure).
