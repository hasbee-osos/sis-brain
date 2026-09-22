## Jira

[GSIS-28779](https://gearsjira.atlassian.net/browse/GSIS-28779) — incorrect records appear when filter data from the status filter in manage invoice (Bug, epic GSIS-2727 Finance Review)

## Summary

The Manage Invoices **Status** filter only matched `invoice.paidStatus`, but the grid's Status column displays an invoice as **Cancelled** whenever `invoice.sponsorInvoiceStatus = CANCELLED` (a frontend-only override, `manage-invoices-list.component.ts:129-136`). Sponsor invoices cancelled via `cancelDraftedSponsorInvoice`/`regenerateSponsorInvoice` never get their `paidStatus` updated (it stays `PENDING` from creation), so they pass a "Pending" filter but render as "Cancelled" — matching the ticket's screenshot, where every mismatched row is a sponsor invoice.

Fix: `InvoiceSpecification` now matches the same **effective status** the UI already shows, gated by the existing `isManageInvoice` flag (set only by this screen), so no other `paidStatus` consumer is affected.

## Implementation (this repo)

- `InvoiceSpecification.java` — when `isManageInvoice=true`, OR the existing `paidStatus` equality predicate with a sponsor-cancelled predicate (`sponsorInvoiceStatus` IS NULL or != CANCELLED, ANDed with the paidStatus equality) OR'd against a `PaidStatus`-CANCELLED subquery branch. NULL-safe on the nullable `sponsorInvoiceStatus` column. The default (non-manage-invoice) path is byte-identical to the original single equality predicate.
- `InvoiceSpecificationIT.java` — new repository-level integration test (3 cases per the planned test strategy). Currently cannot execute: this repo's entire `@SpringBootTest` context is broken on `base-development` (duplicate `restTemplate` bean between `SisAdminServiceApplication` and `ConfigClientAppConfig`), confirmed pre-existing and repo-wide against untouched `StructureMasterServiceIT` and `BatchMasterSpecificationTest`. Kept in place with an in-file note; will run once the environment defect is fixed.
- `InvoiceSpecificationTest.java` — new non-Spring `@ExtendWith(MockitoExtension.class)` unit test (following `LetterTemplateSpecificationTest`'s pattern), exercising the real, unmodified `InvoiceSpecification.toPredicate` with mocked `Root`/`CriteriaQuery`/`CriteriaBuilder`. Covers the sponsor-cancelled branch and pins the unchanged default path for every other `paidStatus` consumer.

No frontend change needed — `sis-product-sis-frontend` was traced as context only and its working tree is untouched.

## Tests — executed in this repo

`gradle -p . test --tests "com.ubs.sis.finance.repository.specification.InvoiceSpecificationTest" --init-script <script excluding 21 pre-existing broken test files, non-destructive, outside the repo> --offline`

- Against the current, fixed code (HEAD `06cd8cca7a`): **BUILD SUCCESSFUL**, `tests="2" skipped="0" failures="0" errors="0"`.
- Against the pre-fix predicate (parent commit `e313490788`, applied only to the working-tree copy, never staged/committed): real executed failure — `WantedButNotInvoked` on `criteriaBuilder.isNull(sponsorInvoiceStatusPath)` — the pre-fix predicate never calls `isNull`/`notEqual`/`subquery`. Confirms the bug is absent without the fix. Fixed file restored byte-identical (`git diff --stat` showed zero diff) before anything was committed.
- `gradle -p . test --tests "com.ubs.sis.archunit.*" --init-script …`: **BUILD SUCCESSFUL**, `AuthArchUnitTest` 11/11, `MasterArchUnitTest` 11/11, on the ticket branch.

## Verification (evidence)

- `git diff --stat origin/base-development...HEAD`: 3 files changed, 418 insertions(+), 1 deletion(-) — scoped exactly to `InvoiceSpecification.java`, `InvoiceSpecificationIT.java` (+9 note only), `InvoiceSpecificationTest.java` (new).
- `git status --short`: clean (an unrelated pre-existing untracked folder, `src/test/java/com/ubs/sis/faculty/`, left untouched — not part of this change).
- Predicate hand-traced against a truth table (Pending / Cancelled-via-paidStatus / sponsor-cancelled invoices) — matches the ticket's expected result.

## Evaluator

**Verdict (evaluation-1.md): INSUFFICIENT_EVIDENCE** — the fix itself was found correct by independent code trace (no logic defect, no regression, no convention breach, all locked decisions D-1–D-5 followed), but the proving regression test had never executed. Root cause: this repo's `@SpringBootTest` context is broken on `base-development` (pre-existing, repo-wide — confirmed against two other untouched test classes), not caused by this change.

### Fixed after the last evaluation — reviewer to check

This ticket is on the **light track** (1 evaluation round). The blocking finding below was addressed in a final fix round that was **not re-evaluated** — please check it as part of review:

| Finding | Fix | Executed test covering it |
|---|---|---|
| **E-1** — the regression test proving the fix has never produced a result (root cause: repo-wide broken Spring context, unrelated to this change) | Added `InvoiceSpecificationTest.java`, a non-Spring Mockito unit test exercising the real, unmodified `InvoiceSpecification.toPredicate` | `InvoiceSpecificationTest` — BUILD SUCCESSFUL, 2/2, run against both the fixed predicate (pass) and the pre-fix predicate (real executed failure) — see Tests above |

Non-blocking findings from evaluation-1.md (N-1…N-6, recommended changes) were left for the human reviewer / a separate ticket, as instructed — none require code changes to this fix.

### Commit after the branch was pushed — also unreviewed

`ae4454b42f` (on top of the final-fix-round HEAD above) restyles the comments this ticket added — `//` line comments to `/* */` block comments — at the developer's request. **No logic, test assertions, or behavior changed**; verified no comment text contains a stray `*/` that could truncate a block early. The light track's single evaluation round was already used, so this was not re-evaluated either; please check it alongside E-1 above.

## Iterations

1 implementation round, 1 evaluation round (INSUFFICIENT_EVIDENCE), 1 final fix round (not re-evaluated, per the light track's evaluation cap).

## Related PRs

None — single repo. `sis-product-sis-frontend` was traced as context only and needs no change.

## Notes — next human steps

- This PR targets `base-sandbox-qa`. After merge, promotion to the QA environment and the post-QA merge into `base-development` are manual steps outside this harness.
- No port to another customer line is needed — `base` only.
- Recommended (not blocking): raise a separate ticket for the two environment defects found during evaluation — (a) duplicate `restTemplate` bean between `SisAdminServiceApplication` and `ConfigClientAppConfig` breaking every `@SpringBootTest` in this repo, (b) a pre-existing 21-file/50-error `:compileTestJava` drift, unrelated to `finance`/`Invoice`.
- N-4 (evaluation-1.md): the fix makes "Cancelled" also return sponsor-cancelled invoices — this was recorded in the plan as an assumption from the ticket's expected result, never confirmed by QA/SME. Please confirm during review.
