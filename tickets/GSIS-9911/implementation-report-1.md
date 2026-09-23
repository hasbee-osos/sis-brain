# Implementation report — GSIS-9911, iteration 1 of 2 (full track)

## Repo: sis-product-sis-frontend
Branch `base/bugfix/GSIS-9911-approval-matrix-missing-workflows`, cut from `origin/base-development` (cafd775d42). Working tree clean at the end; `package.json` / `package-lock.json` unchanged from origin.

### Changes
1. `src/@gears-commons/gears-commons.module.ts` — `GearsPaginatorComponent` added to `exports` (one line plus a comma after `StatusIndicatorComponent`), per D-3. Already imported (l.97) and declared (l.272); no other line touched.
2. `…/approval-matrix-table-view/approval-matrix-table-view.component.html` — `<gears-paginator>` block after the root `*ngIf` `</div>`, same wiring as `data-table.component.html:394-401` (per D-3).
3. `…/approval-matrix-table-view/approval-matrix-table-view.component.spec.ts` — the broken stub replaced by:
   - the TestBed regression spec (imports `GearsCommonsModule`, `MatSortModule`, `MatCheckboxModule`, `NoopAnimationsModule`, `TranslocoTestingModule`; `MasterServiceWrapper` stub; no schema; no direct declaration of `GearsPaginatorComponent`; host component), cases (a)–(d) per plan-2.md (D-4/D-6);
   - prototype-style characterization tests of `mapDataItem` / `calcMainRowSpan` / `calcLevelRowSpan` (2 levels × 2 approvers; no-level workflow, pinning F-1; level whose group has no approvers).
- `approval-matrix.module.ts` unchanged (already imports `GearsCommonsModule`). `src/@gears-commons/component/table/gears-paginator/*` untouched.

### Commits
- `c4fa203e79` — production fix (module export + template)
- `38e8acb530` — spec replacement (regression + characterization)
- `1867708ac7` — lint fix on the spec (named helpers → arrow consts)

### Environment gaps
- `npm ci` failed: package.json and package-lock.json out of sync on `origin/base-development` itself (pre-existing). `npm install` used instead; `package-lock.json` reverted before committing.
- Node v22.12.0 / npm 10.9.0 in use (not `.nvmrc` Node 16); only EBADENGINE warnings for two devDependencies; install, build and lint worked.
- **Karma executed no tests** (GSIS-28778): every `ng test` run reported `Executed 0 of 0`, before and after, for any `--include`. The Karma TS compile covers the whole `src` tree and fails on the same 22 pre-existing unrelated spec files; the new spec adds no compile error (error list identical before/after). Recorded as an environment gap; no test result is claimed.

## Tests and verification
| Layer | Command | Result |
|---|---|---|
| AOT build, template edit only (no export) | `npx ng build --build-optimizer=false` | **FAILED** — NG8001 `'gears-paginator' is not a known element` at `approval-matrix-table-view.component.html:81`, NG8002 on `loading`, `dataSource`, `paginationMetaData`, `filter` (fails-before proof) |
| AOT build, full fix (D-5b) | `npx ng build --build-optimizer=false` | **BUILD SUCCESSFUL**, 0 errors, 175 780 ms; only normal CommonJS warnings |
| Table-view spec, before / after | `npx ng test --watch=false --browsers=ChromeHeadless --include="…/approval-matrix-table-view/**/*.spec.ts"` | `Executed 0 of 0` both times — environment gap; cases (a)–(d) written, **not executed** |
| D-5c specs, before / after | `npx ng test … --include=resit-retake-rules-list … send-offer-letter-confirm-dialog … gears-paginator` | `Executed 0 of 0` both times — identical, environment gap, not a pass |
| D-5a selector | `git grep -n -E "selector:\s*['\"][^'\"]*gears-paginator" HEAD -- src` | exactly 1: `gears-paginator.component.ts:6` |
| D-5a declarations | `git grep -n "GearsPaginatorComponent" HEAD -- "src/**/*.module.ts"` | 3 lines, all `gears-commons.module.ts` (import l.97, declaration l.272, export l.467) |
| D-5a hosts | `git grep -n "<gears-paginator" HEAD -- src` | 6 existing `@gears-commons` hosts + `approval-matrix-table-view.component.html:81` |
| D-5a component untouched | `git diff --quiet origin/base-development -- src/@gears-commons/component/table/gears-paginator` | exit 0 |
| Diff scope | `git diff --stat origin/base-development` | 3 files: module (3 lines), html (+8), spec (265) |
| Lint | `npx ng lint --lint-file-patterns=… approval-matrix/**/*.ts … gears-commons.module.ts` | first run 4 `prefer-arrow` errors in the new spec → fixed (`1867708ac7`) → "All files pass linting." |
| Manual QA-base check (plan item 4) | — | **not run** (needs QA base with >10 workflows) |

## Cross-repo
No contract change; `sis-product-sis-admin-backend` untouched (D-7).

## Deviations
None from plan-2.md → Change. Test execution used the plan's documented fallback (AOT build as before/after proof) because Karma cannot run in this workspace (GSIS-28778). One extra lint-only commit on the spec.

## Findings
F-1 to F-4 unchanged and not fixed; F-1 pinned by a characterization test.

## Codebase map corrections
- `npm ci` fails (lockfile out of sync on `origin/base-development`); `npm install` works; revert `package-lock.json` afterwards.
- Node 22.12.0 works in this workspace despite `.nvmrc` 16.
- GSIS-28778: the 22 broken specs break `ng test` for any `--include` filter, not only broad ones.
- The "`GearsPaginatorComponent` not exported" pitfall becomes stale on merge of `c4fa203e79`.
