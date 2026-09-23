# Implementation report: final fix round, iteration 2 (GSIS-28093)

Light track (D-6), repos per D-8. Scope: blocking finding E-1 and recommendation R-1 from evaluation-1.md.

**This round is not re-evaluated.** The PR reviewer checks it.

Status: **COMPLETE**. E-1 and R-1 are closed, with executed evidence. Both working trees are clean and nothing is pushed.

## sis-product-sis-frontend (final head `9d6f56d208`)
**Fix (closes E-1).** `src/app/modules/finance/master/sponsor/steps/sponsor-interim-invoice-list/sponsor-interim-invoice-list.component.ts` L49-54, `overriddenValues.feeCategory`:
- Adds `.filter(name => !!name)` and `.filter((name, index, names) => names.indexOf(name) === index)` before `.join(', ')`.
- Keeps first-seen order and the `isSecondaryLanguage` switch between `name2L` and `name`.
- No shared distinct/unique util exists in `@gears-commons` or `shared/utils`, so the fix is inline.
- An empty or absent `invoiceChargeList` behaves as before: `''` / `undefined`.

**Tests.** New `sponsor-interim-invoice-list.component.spec.ts`, 4 specs:
- two same-category charges → the name once;
- mixed categories keep first-seen order;
- secondary language uses `name2L`;
- an empty list stays `''` (characterization).

The component is built with `new …(stubs)`, because `overriddenValues` is a field initializer that only the real constructor runs.

| # | Command | Result |
|---|---|---|
| 1 | `npx ng test --watch=false --browsers=ChromeHeadless --ts-config=<out-of-repo tsconfig> --include=<spec>` | 4/4 SUCCESS |
| 2 | Same, with the pre-fix expression restored in the working tree only | 3 FAILED, 1 SUCCESS: "Tuition Fee, Tuition Fee" and the other duplicates. **Fails before the fix** |
| 3 | Fix restored, re-run | 4/4 SUCCESS. **Passes after the fix** |
| 4 | `npx ng build --build-optimizer=false` | Compiled successfully in about 3m 4s (CommonJS warnings only) |

Diff: 2 files, +81/−1. `package-lock.json` is untouched, and `dist/` was removed.

## sis-product-sis-admin-backend (final head `a4b9bcdad8`)
**Change (closes R-1).** In `InvoiceFeeCategoryUtilsTest.java`:
- The stale Javadoc reference to `InvoiceFeeCategoryOldJoinCharacterizationTest` is removed.
- The `_AC` suffix is dropped from the regression test name.

The diff is +3/−3, test-only.

**Verification.** `gradle -p . test --rerun --tests "com.ubs.sis.finance.util.InvoiceFeeCategoryUtilsTest" --init-script <scratchpad init script> -Dorg.gradle.jvmargs="-Xmx3g -XX:MaxMetaspaceSize=1g"`:
- BUILD SUCCESSFUL.
- JUnit XML: 7 tests, 0 failures, 0 errors, suite time 0.055s.

**Environment gap.** Gradle wall-clock was 2h 48m. The host stalled before the tests ran, well past the time-box, and this is not caused by the change. The Gradle daemon the implementor started was stopped afterwards.

## Findings status
| Finding | Status | Fix | Covering executed test |
|---|---|---|---|
| E-1 (blocking) | CLOSED | Distinct filter in the frontend `overriddenValues.feeCategory` | `sponsor-interim-invoice-list.component.spec.ts` (fails before, passes after) |
| R-1 | CLOSED | Javadoc and method name | `InvoiceFeeCategoryUtilsTest` 7/7 |
| R-2 | For the PR description | — | — |
| R-3 | Codebase note corrected | — | — |

## Other same-pattern sites
The frontend was searched. The other sponsor-invoice readers each show a single value from the backend and don't join client-side:
- `view-edit-sponsor-invoice.component.ts:205-207`
- `manage-invoices-list.component.ts:1139-1141`
- `pending-interim-invoice-list.component.ts:296`

## Deviations
None.

## Codebase map corrections
- **Frontend notes → Build and test:** an out-of-repo spec tsconfig also needs `"typeRoots": ["<repo>/node_modules/@types"]`. Without it: `TS2688: Cannot find type definition file for 'jasmine'`.
- **Frontend notes → spec style:** `Object.create(Component.prototype)` never runs field initializers. For those, use `new Component(stubs)` and stub `contextService.getSelectedParentId()` so the base init short-circuits (precedent: `letter-template-add-edit-view.component.spec.ts`).
- **R-3:** `sponsor-interim-invoice-list.component.ts` composes the fee-category text client-side from `invoiceChargeList`.
