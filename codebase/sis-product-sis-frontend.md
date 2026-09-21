# sis-product-sis-frontend

The Angular admin, student and staff UI for all SIS domains. It uses Angular 13, the Fuse theme, Transloco for translations and Tailwind, and is served as one app with lazy-loaded feature modules. It talks only to the backend's `/api/v1` REST API.

## Where things live

| Looking for | Where |
|---|---|
| A screen named in a ticket | `generated/screens.md`: match the menu label (per customer line), then the route and component |
| A feature module | `src/app/modules/<domain>/…` (admin, admission, finance, student, examination, timetable, …). Admin masters are under `modules/admin/masters/<name>-master/` |
| Routes | `src/app/app.routing.ts`, then each module's `*-routing.module.ts`. Detail pages are usually `:mode` and `:mode/:id` on one `add-view-edit-*` component |
| API calls | `src/app/shared/services/**/<name>.service.ts`. Each calls `apiBaseUrl + '/' + getContextPath() + …`; `generated/api.md` joins it to the backend controller |
| Shared components | `src/app/shared/components/`, plus `src/@gears-commons/` (team library: grids, form controls) and `src/@fuse/` (theme). A `<sis-…>` tag resolves via `generated/sis-product-sis-frontend.components.md` |
| Components shared between screens | Look for other hosts before changing one. For example, the requisite components under `modules/admin/masters/course-master/requisite/` are embedded in the Course master, Course Offering, Study Plan, student study plan and graduation plan |
| Translations | **Not in this repo.** The JSON lives in `sis-product-sis-admin-backend/src/main/resources/i18n/`. A new key there means changing the backend too |
| Menu entries | Not in this repo either: they are Liquibase rows in the backend (`generated/sis-product-sis-admin-backend.menus.md`) |
| Why a save fails with "Some entities are assigned to this &lt;X&gt;" | Not always a real conflict — `src/@gears-commons/services/gears-alert.service.ts` renders that text for **any** unclassified backend save exception (`DATA_SAVING_ERROR` / business status 5100), most often a plain DB constraint like a length cap |

## Naming

The UI and the code use different words. "Module" on GCET screens is `course` in code, and "Module Offering" is `course-offering`. Search `screens.md` for the ticket's own word.

## Build and test

- **Node 16** (`.nvmrc`). Run `npm ci` once per checkout.
- **Type-check and compile:** `npx ng build --build-optimizer=false`. It takes about 4–5 minutes, and CommonJS warnings are normal. This proves the code compiles, not that it behaves correctly.
- **Unit tests:** `npx ng test --watch=false --browsers=ChromeHeadless --include="<path>/**/*.spec.ts"`. `karma.conf.js` defaults to a visible Chrome in watch mode, so always pass both flags.
  - **Known problem (2026-09, GSIS-28778):** the Karma TypeScript compile failed on about 22 existing broken spec files elsewhere in the app, so the run reported "Executed 0 of 0". If that happens, record it as an environment gap straight away. Don't claim the tests ran, and don't try to fix unrelated specs.
- **Spec style used in this repo:** create the component without TestBed (`Object.create(Component.prototype)`), with dependencies from `jasmine.createSpyObj`. See `review-program-sponsor.component.spec.ts`.
- CI (`.github/workflows/all-deploy-workflow.yml`) calls the shared `pbsgears/sis-product-devops-workflows` workflows. There is no test gate in CI.
