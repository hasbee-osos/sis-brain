**Title:** GSIS-28093: de-duplicate fee category in sponsor interim invoice grid

## Jira
[GSIS-28093](https://gearsjira.atlassian.net/browse/GSIS-28093): Fee Category Is Duplicated in Final Sponsor Invoice for Multiple Tuition Fee Courses (Bug, base line)

## Summary
The fee category of an interim invoice with several charges in the same category showed repeated names, e.g. "Tuition Fee, Tuition Fee". The backend PR fixes the View screen and the PDF. This PR fixes the one screen that composes the text in the browser: the Sponsor master → Invoices child grid, which lists the interim invoices of a selected final sponsor invoice.

## Implementation (this repo)
In `sponsor-interim-invoice-list.component.ts`, `overriddenValues.feeCategory` now filters out empty names and keeps only the first occurrence of each name before `.join(', ')`.
- First-seen order is kept.
- The `name2L`/`name` language switch is untouched.
- Behaviour for an empty or absent charge list is unchanged.

## Tests (executed in this repo)
New `sponsor-interim-invoice-list.component.spec.ts`, 4 specs:
- same-category charges → the name once;
- mixed categories keep first-seen order;
- secondary language uses `name2L`;
- an empty list stays `''`.

The specs ran with an out-of-repo tsconfig, because other spec files in the app already fail to compile.

| Command | Result |
|---|---|
| `npx ng test --watch=false --browsers=ChromeHeadless --ts-config=<out-of-repo tsconfig> --include=<spec>` | 4/4 SUCCESS |
| Same, with the pre-fix expression restored | 3 FAILED ("Tuition Fee, Tuition Fee" and similar). **Fails before the fix** |
| `npx ng build --build-optimizer=false` | Compiled successfully |

## Verification
- Unit evidence as above.
- **Manual QA (pending, after promotion):** Sponsor master → Invoices → select a final invoice. The Fee Category column for an interim invoice with 2+ Tuition Fee courses should show "Tuition Fee" once. Check also in the secondary language.

## Evaluator
- Evaluation 1: **FAIL**. Blocking finding E-1 was this exact site, missed by the plan, which had marked the frontend as context only.

### Fixed after the last evaluation: reviewer to check
- **E-1:** the de-duplication in `overriddenValues.feeCategory`, covered by the executed spec above, which fails before the fix and passes after. **This fix was not re-evaluated by the harness.**

## Iterations
Light track. 1 implementation round, 1 evaluation, 1 final fix round (this change).

## Related PRs
- sis-product-sis-admin-backend: `base/bugfix/GSIS-28093-final-invoice-duplicate-fee-category` → `base-sandbox-qa`, which fixes the View screen, the Interim Invoice Details grid and the PDF.
- There is no merge-order dependency.

## Notes: next human steps
- Review and merge into `base-sandbox-qa`, then promote to the QA environment per the team process.
- Port to `gcet-sandbox-qa` / `gutech-sandbox-qa` if needed, and do the post-QA merge into `base-development`, per the team process.
- **Base-line reminder:** this branch is cut from `base-development` (developer choice), so it carries only this ticket. Porting to `gcet-sandbox-qa` / `gutech-sandbox-qa`, promotion, and the post-QA merge into `base-development` follow the team's existing process. Check that only this ticket's change reaches each line.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
