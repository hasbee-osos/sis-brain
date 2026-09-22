# Evaluation

Ticket: GSIS-28779
Iteration: 1

## Verdict

**INSUFFICIENT_EVIDENCE**

| Repo | Result | Note |
|---|---|---|
| sis-product-sis-admin-backend | INSUFFICIENT_EVIDENCE | Predicate is correct and minimal on independent code trace; ArchUnit green on the branch; the proving regression test has never been executed — and a deeper reason than the implementor found was proven. |
| Cross-repo consistency | N/A | Single repo, no contract/schema change; `sis-product-sis-frontend` working tree clean, untouched (verified). |
| Project conventions | PASS | Existing `*Specification` pattern extended, existing constants, no new join on `root`, no literals, no commented-out code, no new deps, no contract/Liquibase/date-handling/auth surface touched. |
| Locked decisions | PASS | D-1…D-5 all followed; nothing contradicted, nothing needing a superseding record. |
| Ticket outcome | INSUFFICIENT_EVIDENCE | Root cause independently confirmed and the fix logically closes it, but no executed test result exists for the fix. |

## Blocking Findings

- **E-1 (evidence gap — drives the verdict, not a code defect).** The regression test that proves the bug has never produced a result.
  1. The implementor's stated cause is accurate — `gradle -p . compileTestJava` fails with exactly 50 errors across exactly the 21 files they listed, none in `finance`/`Invoice`. Untouched by this ticket's diff.
  2. **New, worse finding:** after excluding those 21 files via a Gradle init script outside the repo (no source modified), `:compileTestJava` succeeds, including `InvoiceSpecificationIT.java`. Running it then gives a real, executed failure: `BeanDefinitionOverrideException` on bean `restTemplate`, defined twice (`SisAdminServiceApplication` and `ConfigClientAppConfig`).
  3. That is pre-existing and repo-wide, not caused by this change: the untouched `StructureMasterServiceIT` (the pattern D-4 cites) and the untouched `BatchMasterSpecificationTest` (the plan's named fallback) fail with the byte-identical `restTemplate` error. Every `@SpringBootTest` in this repo is broken on `base-development`.
  4. So the D-4 test strategy can never yield evidence here, and the plan's documented fallback would have failed too — the implementor is not at fault for the gap, but it is deeper than reported.
  5. Executable evidence is obtainable: a non-Spring Mockito specification test runs fine here — `LetterTemplateSpecificationTest` → BUILD SUCCESSFUL under the same init script.

No code defect was found that blocks review.

## Non-Blocking Findings

- **N-1.** `root.join(Invoice.FIELD_PAID_STATUS)` is an INNER join, still applied in the `isManageInvoice` path, while the new second OR-branch never references it. `Invoice.paidStatus` has no `nullable = false`, so a sponsor-cancelled invoice with a NULL `paidStatus` would still not appear under the Cancelled filter. Low likelihood, pre-existing shape, worth a reviewer's eye.
- **N-2.** `InvoiceSpecificationIT` seeds in `@BeforeEach` with `PER_CLASS` and no `@Transactional`/cleanup, so rows accumulate across its three tests; assertions are `contains`-based so they stay sound, mirroring the repo's existing `StructureMasterServiceIT`.
- **N-3.** The new subquery's behaviour inside Spring Data's count query (pager total vs rows) is unverified.
- **N-4.** The fix makes "Cancelled" also return sponsor-cancelled invoices — recorded in the plan as an assumption, never confirmed by QA/SME. Human reviewer should confirm.
- **N-5.** Report wording "No `gradle test` command can succeed in this repo" is slightly overstated — an init-script exclusion (non-destructive, outside the repo) makes non-Spring tests run. Codebase-map note should also mention the `restTemplate` duplicate-bean failure blocking all `@SpringBootTest` classes.
- **N-6.** The two out-of-scope findings (Excel/PDF export; keyword search) are correctly recorded and correctly not fixed.

## Required Changes

- **R-1 — produce an executed result for the fix.** Add an executable, non-Spring `src/test/java/com/ubs/sis/finance/repository/specification/InvoiceSpecificationTest.java` following `src/test/java/com/ubs/sis/administration/repository/specification/LetterTemplateSpecificationTest.java` (`@ExtendWith(MockitoExtension.class)`, mocked `Root`/`CriteriaQuery`/`CriteriaBuilder`) covering the D-4 cases. Keep `InvoiceSpecificationIT` (right test once the context is repaired) with an in-file note on why it cannot run today.
- **R-2 — record the pre-fix failure.** With R-1 in place, run the new test against the unmodified predicate and record the real failure, or state explicitly in the PR that it was not executed.

## Recommended Changes

- Raise a separate ticket for the two environment defects: (a) duplicate `restTemplate` bean between `SisAdminServiceApplication` and `ConfigClientAppConfig` breaking every `@SpringBootTest`; (b) the 21-file / 50-error `:compileTestJava` drift.
- Consider `JoinType.LEFT` for the paid-status join inside the `isManageInvoice` branch if N-1 is judged real.

## Decisions Checked

| ID | Decision | Followed? | Note |
|---|---|---|---|
| D-1 | Bug on the base line; branch `base/bugfix/GSIS-28779-invoice-status-filter` | YES | HEAD `9182f244ca` on that branch, parent `e313490788` from `base-development`. |
| D-2 | Root cause: filter ignores the sponsor-cancelled display override | YES | Independently confirmed. |
| D-3 | Match effective status in `InvoiceSpecification`, gated by `isManageInvoice` | YES | Gate verified airtight: `getIsManageInvoice()` read only in this class. Default `else` branch byte-identical to the old line. |
| D-3 pt.3 | NULL-safety on nullable `sponsorInvoiceStatus` | YES | Implemented correctly. |
| D-3 pt.2 | Resolve the CANCELLED code via a `PaidStatus` subquery | YES | Verified against real field/constant definitions. |
| D-4 | Repository-level IT + pinning case | YES (written), NOT EXECUTED | Implements all three planned cases faithfully; execution blocked (E-1). |
| D-5 | One repo, light track | YES | Diff is 2 files in one repo; frontend clean. |

## Evidence

- `git diff --stat origin/base-development...HEAD` → 2 files changed, 139 insertions(+), 1 deletion(-). Diff is a single hunk at lines 96-124 — `paidStatusIdList`, `isExcludeCancelledInterim`, `isExcludeFullyPaid` and the keyword search are textually untouched.
- Predicate hand-traced against a truth table (A/B/C invoices) — matches the plan exactly. Pre-fix argument for R-2: the old single predicate matches B, so the exclusion assertion must fail without the fix — established by code reading only, not an executed run.
- `gradle -p . compileTestJava --offline` → BUILD FAILED, 50 errors, exactly the 21 files named, zero in finance/Invoice.
- Same with an init-script exclusion of those 21 files → BUILD SUCCESSFUL (proves `InvoiceSpecificationIT.java` itself compiles).
- `gradle -p . test --tests "…InvoiceSpecificationIT" --init-script …` → `initializationError`, `BeanDefinitionOverrideException` on `restTemplate`.
- Same run for untouched `StructureMasterServiceIT` and untouched `BatchMasterSpecificationTest` → identical failure. Pre-existing, repo-wide, unrelated to this change.
- `gradle -p . test --tests "…LetterTemplateSpecificationTest" --init-script …` → BUILD SUCCESSFUL (basis for R-1).
- `gradle -p . test --tests "com.ubs.sis.archunit.*" --init-script …` → BUILD SUCCESSFUL, `AuthArchUnitTest` 11/11 and `MasterArchUnitTest` 11/11, 0 failures, 0 errors, on the ticket branch.
- Corroboration this predates the ticket: `sis-brain/tickets/GSIS-28778/evaluation-1.md` records the same repo failing to build/test in an earlier run.
- `git -C sis-product-sis-frontend status --short` → clean; context repo untouched, as planned.

**Why INSUFFICIENT_EVIDENCE and not FAIL:** no incorrect logic, no regression, no convention breach, no contradicted decision — the change is the smallest one that closes the traced root cause. What is missing is purely an executed result for the proving test. **Why not PASS:** a bug is proven by a regression test that ran, and this one has never run. R-1 gives a demonstrated, non-destructive route to close the gap.
