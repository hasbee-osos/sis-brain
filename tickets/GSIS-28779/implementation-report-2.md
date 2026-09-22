# Implementation report — iteration 1, final fix round

Closes blocking finding E-1 from `evaluation-1.md` (required changes R-1, R-2). No evaluation follows this round; the human reviewer checks it in the PR. New HEAD `06cd8cca7a` (parent `9182f244ca`, the original fix — unchanged this round).

## sis-product-sis-admin-backend

### Changes
- Added `src/test/java/com/ubs/sis/finance/repository/specification/InvoiceSpecificationTest.java` (new, 270 lines): non-Spring `@ExtendWith(MockitoExtension.class)` unit test, following `LetterTemplateSpecificationTest`'s pattern, exercising the real, unmodified `InvoiceSpecification.toPredicate` with mocked `Root`/`CriteriaQuery`/`CriteriaBuilder`/`Join`/`Subquery`.
  - Test 1 (`manageInvoiceCancelledFilter_buildsSponsorCancelledOrCancelledSubqueryPredicate`, D-4 case 2): `isManageInvoice=true` — verifies the sponsor-cancelled branch (`isNull`/`notEqual(sponsorInvoiceStatus, CANCELLED)` OR'd, AND'd with the paidStatus equality) is OR'd with the CANCELLED-subquery branch, asserting the exact `or`/`and`/`isNull`/`notEqual`/`equal`/subquery calls and arguments.
  - Test 2 (`nonManageInvoiceFilter_buildsOriginalSingleEqualityPredicateOnly`, D-4 pinning case): `isManageInvoice` unset — verifies only the original single equality predicate is built, and `isNull`/`subquery` are never invoked, pinning the unchanged default path for every other `paidStatus` consumer.
  - Also stubs the separate, pre-existing `ownerType`/`isManageInvoice` block that unconditionally co-executes whenever `isManageInvoice=true`, required to exercise the real method end-to-end; not asserted on, out of scope.
- Edited `InvoiceSpecificationIT.java`: added a 9-line note citing GSIS-28779 and the pre-existing, repo-wide `restTemplate` duplicate-bean `@SpringBootTest` failure. No logic changed.
- No changes to `InvoiceSpecification.java` — unchanged from commit `9182f244ca`; the Evaluator found its logic correct.

### Tests — real, executed evidence
Command (init-script exclusion of the same 21 pre-existing broken files, non-destructive, outside the repo): `gradle -p . test --tests "com.ubs.sis.finance.repository.specification.InvoiceSpecificationTest" --init-script <script> --offline`.

- **Against the current, fixed code (HEAD):** BUILD SUCCESSFUL, `tests="2" skipped="0" failures="0" errors="0"` — both tests pass with real Mockito verifications.
- **Against the pre-fix predicate (R-2):** temporarily replaced the working-tree copy of `InvoiceSpecification.java` with the exact parent-commit (`e313490788`) content (never staged/committed), ran the same test → real executed failure: `WantedButNotInvoked` on `criteriaBuilder.isNull(sponsorInvoiceStatusPath)` — the pre-fix predicate never calls `isNull`/`notEqual`/`subquery` at all, confirming the bug is absent without the fix. Restored the exact fixed file (byte-identical, confirmed via `git diff --stat` showing zero diff) before committing anything; re-ran → BUILD SUCCESSFUL again.
- Two incidental JVM/Gradle-daemon crashes during iteration were transient host memory pressure, resolved by `gradle --stop` and retrying — not a code or test defect.

### Verification evidence
- `git diff origin/base-development...HEAD --stat`: 3 files changed, 418 insertions(+), 1 deletion(-) — `InvoiceSpecification.java` (unchanged this round, the original fix), `InvoiceSpecificationIT.java` (+9, note only), `InvoiceSpecificationTest.java` (new, 270 lines). Scoped exactly to R-1/R-2.
- `git status --short`: clean of stray files (a JVM crash log the daemon wrote to the repo root was removed); the pre-existing untracked `src/test/java/com/ubs/sis/faculty/` (unrelated prior work) left untouched.

### Required changes from evaluation-1.md — status
- **R-1 (produce an executed result for the fix): CLOSED.** `InvoiceSpecificationTest` passes against the current, unmodified, already-correct predicate — BUILD SUCCESSFUL, 2/2, real Mockito-verified assertions on the exact calls D-4 describes. `InvoiceSpecificationIT` kept as-is with an in-file note on why it can't run today.
- **R-2 (record the pre-fix failure): CLOSED with real executed evidence** (beyond best-effort) — reverted the production file to the parent-commit content in the working tree only, got a genuine `WantedButNotInvoked` failure, then restored byte-identical before committing.

### Cross-repo consistency
N/A — single repo, no contract/schema change; `sis-product-sis-frontend` untouched.

### Deviations
None from the required-changes scope. To exercise `toPredicate` without Mockito strict-stubbing failures under `isManageInvoice=true`, the pre-existing `ownerType`/`isManageInvoice` block (which always co-executes in that path) also had to be stubbed — unavoidable given the method's structure, not itself under test, and clearly commented as such.

### Findings
None new. N-1 through N-6 and the two environment defects from `evaluation-1.md` are untouched, as instructed — they remain for the human reviewer / a separate ticket.

### Codebase note (Mockito idiom, not a codebase-map correction)
Stubbing a mocked JPA `CriteriaBuilder`'s varargs `and(Predicate...)`/`or(Predicate...)` with `any(Predicate[].class)` does not behave as a wildcard under Mockito's strict stubbing here — it silently matches a literal `null` array and triggers `PotentialStubbingProblem` against the 2-arg overload calls on the same mock. The working idiom (already used by `LetterTemplateSpecificationTest`/`BatchMasterSpecificationTest`) is a bare `any()` for the vararg overload, plus exact per-argument stubs for every other overload the code path exercises.

## Status
Both blocking items from `evaluation-1.md` (R-1, R-2) are closed with real, executed evidence. The fix itself is unchanged from commit `9182f244ca` — the Evaluator already found it correct; this round only added the missing executable proof. Ready for the human-reviewed PR.
