**Title:** GSIS-28093: de-duplicate fee category in final sponsor invoice

## Jira
[GSIS-28093](https://gearsjira.atlassian.net/browse/GSIS-28093): Fee Category Is Duplicated in Final Sponsor Invoice for Multiple Tuition Fee Courses (Bug, base line)

## Summary
A final sponsor invoice showed "Tuition Fee, Tuition Fee" when an interim invoice had several charges in the same fee category.
- **Cause:** the per-row fee category is composed at read time by joining every interim charge's category name with no de-duplication.
- **Scope:** display only. Stored data is correct, so no data fix is needed and existing invoices display correctly after deploy.
- **Categories affected:** every category with 2+ charges on one interim invoice, not just Tuition Fee.

## Implementation (this repo)
- New `finance/util/InvoiceFeeCategoryUtils.joinDistinctFeeCategoryNames(...)`:
  - distinct names in first-seen order, joined with `", "`;
  - skips null charges, null categories and blank names;
  - returns `null` when nothing is left.
- Used at the four composition sites:
  - `InvoiceServiceImpl.getDtoById`: View charge table.
  - `InvoiceServiceImpl.getList`: PDF charge table and list.
  - `InvoiceServiceImpl.mapEntityListToResponses`.
  - `SponsorInvoiceServiceImpl.buildInterimInvoiceResponseDto`: Interim Invoice Details grid and PDF. It keeps `""` when empty.
- No API or schema change.

**Behaviour notes for the reviewer (R-2):**
- On the three `InvoiceServiceImpl` sites, an interim invoice with an **empty charge list** now gives `null` instead of `""`, so the row falls back to the final charge's own `feeCategory.name`.
- A charge with **no fee category** no longer throws an NPE; it is skipped.

## Tests (executed in this repo)
New `InvoiceFeeCategoryUtilsTest` (JUnit 5, 7 tests): duplicate, mixed, single, null, empty, and null or blank category.

Commands used a local Gradle with `-Dorg.gradle.jvmargs="-Xmx3g -XX:MaxMetaspaceSize=1g"`. The test compile uses an out-of-repo init script that excludes 21 test files that already don't compile.

| Command | Result |
|---|---|
| `gradle test --tests "com.ubs.sis.finance.util.InvoiceFeeCategoryUtilsTest"` | 7/7 pass |
| Same, with the pre-fix joining expression swapped in | 6/7 fail, including "Tuition Fee, Tuition Fee". **Fails before the fix** |
| Same plus `--tests "com.ubs.sis.archunit.*"` | Auth 11/11, Master 11/11 |
| `gradle build -x test` | BUILD SUCCESSFUL |
| Evaluator re-run with `--rerun` | 7/7 and ArchUnit green |

`@SpringBootTest` was not run. It fails at context startup in this repo because of an existing duplicate `restTemplate` bean, which is unrelated to this change.

## Verification
- Unit evidence as above.
- **Manual QA (pending, after promotion):**
  - Generate a final invoice from an interim invoice with 2+ Tuition Fee courses. On View, both the charge row and the Interim Invoice Details grid, and in the Print PDF, it should show "Tuition Fee" once.
  - Reopen an existing final invoice; it should also show a single value.
  - Check one mixed-category interim invoice.
  - Check Sponsor master → Invoices → select a final invoice → Fee Category column (frontend PR).

## Evaluator
- Evaluation 1: **FAIL**, 1 blocking. This repo passed on its own review. E-1 was a missed **frontend** composition site (see the frontend PR).

### Fixed after the last evaluation: reviewer to check
- **E-1** is fixed in the frontend PR, with a regression spec run and shown to fail before the fix and pass after.
- In this repo, only R-1: `InvoiceFeeCategoryUtilsTest` Javadoc and method name (test-only, +3/−3). Re-run: 7/7 pass.

## Iterations
Light track. 1 implementation round, 1 evaluation, 1 final fix round (not re-evaluated).

## Related PRs
- sis-product-sis-frontend: `base/bugfix/GSIS-28093-final-invoice-duplicate-fee-category` → `base-sandbox-qa`, which fixes the Sponsor master → Invoices grid.
- There is no merge-order dependency; the two changes are independent.

## Notes: next human steps
- Review and merge into `base-sandbox-qa`, then promote to the QA environment per the team process.
- Port to `gcet-sandbox-qa` / `gutech-sandbox-qa` if needed, and do the post-QA merge into `base-development`, per the team process.
- **Base-line reminder:** this branch is cut from `base-development` (developer choice, D-1), so it carries only this ticket. Porting to `gcet-sandbox-qa` / `gutech-sandbox-qa`, promotion, and the post-QA merge into `base-development` follow the team's existing process. Check that only this ticket's change reaches each line.
- Out-of-scope findings:
  - `generateSponsorFinalInvoice` stores only the last interim charge's `feeCategoryId`.
  - The invoice-level description separator is `" , "`.
  - The PDF/View fee category never uses `name2L`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
