# Implementation report — iteration 1

Light track. One repo changed, committed locally on `base/bugfix/GSIS-28779-invoice-status-filter`, not pushed.

## sis-product-sis-admin-backend

### Changes
- `src/main/java/com/ubs/sis/finance/repository/specification/InvoiceSpecification.java` (lines 97-124): per **D-3**, the `filterDto.getPaidStatus() != null` block now branches on `Boolean.TRUE.equals(filterDto.getIsManageInvoice())`:
  - **Default path (unchanged behaviour, per D-3 point 1):** every caller that doesn't set `isManageInvoice` keeps the original single predicate `paidStatusJoin.id = filterDto.getPaidStatus()`.
  - **`isManageInvoice = true` path (per D-2 root cause / D-3 fix):** ORs two branches — (a) `(isNull(sponsorInvoiceStatus) OR sponsorInvoiceStatus != CANCELLED) AND paidStatus.id = selected` (the nullable-enum NULL-safety called out as the highest-risk detail in the plan, step 3), and (b) `sponsorInvoiceStatus = CANCELLED AND <selected id resolves via a PaidStatus criteria subquery to code FinanceUtils.INVOICE_CANCELLED_STATUS>` (subquery pattern following the existing one at `:341-345`). Reuses the existing `paidStatusJoin`, no new join on `root`. Uses existing constants `Invoice.FIELD_SPONSOR_INVOICE_STATUS`, `Invoice.FIELD_PAID_STATUS`, `FinanceUtils.INVOICE_CANCELLED_STATUS` — no literals. No DTO/contract/schema change.

### Tests
- New `src/test/java/com/ubs/sis/finance/repository/specification/InvoiceSpecificationIT.java` (`@SpringBootTest` + H2, pattern: `StructureMasterServiceIT`), per **D-4**. Seeds `PaidStatus` PENDING/CANCELLED and three invoices exactly as planned: A (non-sponsor, PENDING), B (sponsor, `sponsorInvoiceStatus=CANCELLED`, `paidStatus=PENDING`), C (non-sponsor, CANCELLED). Three tests:
  - `manageInvoicePendingFilter_excludesSponsorCancelledInvoice_AC` — `{isManageInvoice=true, paidStatus=PENDING.id}` → contains A, excludes B and C (this is the assertion that fails on unmodified `InvoiceSpecification` and passes with the fix).
  - `manageInvoiceCancelledFilter_includesBothSponsorCancelledAndPaidStatusCancelled_AC` — `{isManageInvoice=true, paidStatus=CANCELLED.id}` → contains B and C, excludes A.
  - `nonManageInvoicePendingFilter_pinsExistingBehaviorForOtherConsumers` — `{paidStatus=PENDING.id}`, `isManageInvoice` unset → contains A **and** B, excludes C (pins the default path other consumers rely on).
- Only touch point in this repo is `InvoiceSpecification.toPredicate` (the `paidStatus` block); the IT test above covers it directly. No other production method was changed.

### Verification evidence — test written but NOT executed (environment gap)
- `gradle -p . compileJava` **succeeded** (`:compileJava`, `:processResources`, `:classes` completed, only pre-existing Lombok warnings). Confirms the fix compiles against the real entity/DTO model.
- Command run: `gradle -p . test --tests "com.ubs.sis.finance.repository.specification.InvoiceSpecificationIT" --console=plain`. Real result: **BUILD FAILED in 8m 46s** at `:compileTestJava`, with 50 compile errors across 21 pre-existing, unrelated test files (none touching finance/invoice, none authored in this run): `administration/service/{AcademicCalendarMasterServiceUT,BatchMasterServiceUT,DegreeTypeMasterServiceUT,DepartmentMasterServiceUT,EntityAssignmentServiceUT,FacultyMasterServiceUT,MmsMasterServiceUT,SemesterMasterServiceUT,StructureMasterServiceUT,StudyPlanMasterServiceUT}.java`, `administration/service/facade/CampusAssignmentServiceFacadeTest.java`, `admission/service/impl/OfferLetterServiceImplSendAuditTest.java`, `auth/policy/PolicyEnforcementImplTest.java`, `auth/service/{facade/UserServiceFacadeIT,RoleServiceUT,UserServiceUT}.java`, `controller/v1/api/{CourseControllerTest,CoursePreRegisterOfferingControllerTest,SemesterControllerTest,StudyPlanControllerTest}.java`, `util/DateUtilsSemesterDateTest.java`. Errors are constructor-signature mismatches and missing fields (test doubles out of sync with current constructors). Confirmed pre-existing: all 21 files unmodified at `origin/base-development` commit `9b6f9e6d0267caf6ad1671a0e333be5005ac320b`. `InvoiceSpecificationIT.java` itself produced zero compile errors (confirmed by grepping the failure log — no match).
- Root cause: Gradle's `test` task compiles the entire `src/test/java` source set before any test runs, and this source set does not currently compile on `base-development` at all — matches this repo's codebase note that CI builds with `-x test`, so there is no green test baseline here for any ticket.
- A non-destructive workaround (temporarily relocating the 21 unrelated broken files outside the repo to let the finance test source compile, then restoring them) was attempted but blocked by the harness's own safety classifier as test-removal-shaped. No further workaround was pursued.
- The ArchUnit command from the plan was not separately run — it would hit the identical `:compileTestJava` failure.
- What is actually evidenced: the production predicate compiles cleanly against the real model; the new IT test has no compile errors; a manual trace against the actual field/constant definitions confirms the predicate logic matches D-3 including the NULL-safety branch. **This is not a substitute for an executed test run.**

### Diff summary
`git show --stat HEAD` (verified independently): 2 files changed, 139 insertions(+), 1 deletion(-) — `InvoiceSpecification.java` (+24/-1) and new `InvoiceSpecificationIT.java` (+116). Nothing else touched; commit `9182f244ca` on `base/bugfix/GSIS-28779-invoice-status-filter`. The unrelated untracked leftover `src/test/java/com/ubs/sis/faculty/` (pre-existing, from other work) was left alone and is not staged/committed.

### Cross-repo consistency
N/A — single repo, no contract change; `sis-product-sis-frontend` untouched, as planned.

### Deviations
1. **Test execution could not be completed** — code and test were written exactly per D-4, but the regression test's real pass/fail result is not available due to a pre-existing, repo-wide `:compileTestJava` failure unrelated to this ticket. This is an environment gap, not a scope or approach deviation.
2. No other deviation from the plan; fix approach, files touched, and test design match D-2/D-3/D-4 exactly.

### Findings (deliberately out of scope)
- Excel/PDF export writes `paidStatus.getName()` directly (`InvoiceServiceImpl.java:1792`) without the sponsor-cancelled override, so an exported sponsor-cancelled row still reads "Pending".
- "Search Keywords" matches paid-status name only (`InvoiceSpecification.java:416-419`), so sponsor-cancelled rows aren't found by searching "cancel".
- **Environment-level finding, not ticket-specific:** the entire `sis-product-sis-admin-backend` test source set currently fails to compile on `base-development` (50 errors, 21 pre-existing files, unrelated to finance). No `gradle test` command can succeed in this repo until that drift is fixed — this blocks executed-test evidence for every ticket in this repo, not just this one.

## Codebase map correction
`sis-brain/codebase/sis-product-sis-admin-backend.md` → "Build and test" should state explicitly that the test source set does not currently compile at all (50 errors / 21 pre-existing files as of `base-development` commit `9b6f9e6d0267c`), so `gradle test` (even `--tests`-filtered) fails at `:compileTestJava` before any test runs, regardless of which test is targeted.

## Status
Code complete, matches D-2/D-3/D-4, compiles cleanly. Regression test written per D-4 but not executable in this environment due to a pre-existing, unrelated test-compilation failure across 21 files — a test-infrastructure gap, not a finding against this change. Not marked PASS by the implementor; handed to the Evaluator and human review with the gap disclosed plainly rather than claiming the test passed.
