# Plan: GSIS-26592, iteration 1 (bug), Part 1 only

**Status:** `NEEDS_INPUT`. The mechanism is established in the code. The fix depends on a business rule that the code contradicts (see Open Questions).

## Attachments

`Configure_Fee_Wrong_credit.mp4` (78.5 s, 14 frames, read in order). There is no audio. There are 5 to 9 s gaps between frames, so a value shown only briefly may be missed.

- **Environment:** the address bar shows `sis-staging-osos.gears-int.com`, a GCET college context, logged in as the Super Admin role. The ticket's Customer Name is "Product Core Feature", and the code of record is `origin/base-development` per D-1.
- `@ 00:00`: Finance > Master > Configure Fee. One fee, "Tuition Fee (2026/2027)", with Fee Calculation Base "Credit Point".
- `@ 00:04–00:11`: Administration > Master > **Module** (`/admin/masters/course`). "Model Master" in the ticket is the **Module** screen (Course in the code).
- `@ 00:20`: View Module `GCET-15-0`. Credit Type is Points and **Credit Points is 0**. The earlier edit from 1 to 0 is not in the recording.
- `@ 00:29`: The Module list shows **"-"** in Credit Points/Hours for this module, although the stored value is 0. This is a separate display defect (Findings).
- `@ 00:40`: Configure Fee > view Tuition Fee. Default fee 29.753.
- `@ 00:51`: The Tuition Fee child grid has a new inline row. The Module dropdown offers a **Module Offering** entry (module | department).
- `@ 01:00`: The new row has Fee Calculation Base Credit Point. **The Credit Points field shows 0, with the text cursor in the field.** No sampled frame shows the value 1 the ticket reports; between 00:51 and 01:00 the user may have overwritten an auto-filled 1, which the frames cannot confirm.
- `@ 01:09–01:18`: The row is switched to Fixed Amount 50 and saved; the saved row shows Credit Points 0.000.
- **Conclusion:** the recording confirms the screens and the flow. It does **not** show the stale 1, so the defect value comes from the ticket text only.

## Understanding

- **Reported:** Module Credit Points was edited from 1 to 0. A new Tuition Fee row in Configure Fee is still auto-filled with 1.
- **Expected (ticket):** the latest Credit Points from the Module.

### Flow traced (origin/base-development)

1. **The UI loads the dropdown options.** The Tuition Fee grid is `ConfigureTuitionFeeListComponent` (`sis-product-sis-frontend/src/app/modules/finance/master/configure-fee/configure-tuition-fee-list/configure-tuition-fee-list.component.ts`). `loadCoursesOffered()` (l.265–279) loads options from `masterService.getComponentListByBusinessEntity(BusinessEntity.CRSOFCRS, …)` → `GET /masters/CRSOFCRS?withData=true` (`src/app/shared/services/master.service.ts:19-23`). No HTTP cache.
2. **The UI auto-fills Credit Points.** `generateRequest()` (l.576–591): `const creditPoints = courseOffer.data?.creditPoints ? courseOffer.data?.creditPoints : courseOffer.data?.creditHours;` — the value comes from the **Module Offering course** record (`CourseOfferingCourse`), not the Module (`Course`).
3. **The backend stores its own copy.** `CRSOFCRS` → `CourseOfferingCourse` (`sis-product-sis-admin-backend/.../domain/enums/BusinessEntity.java:84`), which has its own `creditPoints` / `creditHours` columns (`administration/domain/CourseOfferingCourse.java:64-68`), mapped by `CourseOfferingCourseMasterMapper`. The embedded `data.course` (`CourseSummaryResponseDto`) has no credit fields.
4. **The copy is taken once, when the module is added to an offering.** `AddViewEditCourseOfferingCourseComponent.onCourseSelect()` patches `creditPoints: course?.creditPoints` (`src/app/modules/admin/masters/course-offering-master/add-view-edit-course-offering-course/add-view-edit-course-offering-course.component.ts:233-270`), sent by `generateReq()` (l.461-467), persisted in `CourseOfferingCourseServiceImpl.validateAndMapToEntityForSave` (l.306-314). The field is editable per offering (html l.48).
5. **Editing a Module does not update its offerings.** `CourseMasterServiceImpl.preUpdateEntity` / `postUpdateEntity` (`administration/service/impl/CourseMasterServiceImpl.java:581-661`) only touch requisites and active-status checks. The only writers of `course_offering_course.credit_points` are in `CourseOfferingCourseServiceImpl`. No `@Cacheable` on these paths.

### Root cause

When a Module's Credit Points is edited, the copy already stored on its Module Offering course (`course_offering_course.credit_points`) is not updated. Configure Fee's Tuition Fee grid auto-fills Credit Points from that offering copy (`configure-tuition-fee-list.component.ts:588`), so a module offered while its value was 1 still shows 1.

Falsifiable by: the Module Offering course record for the reported module should hold Credit Points 1. If it holds 0 (and the auto-fill still showed 1), the root cause is disproved.

### Contributing latent defect (part of any fix)

Line 588 uses a truthiness test. When the source value is 0 it falls back to `creditHours`, which for a Points-type offering is null (nulled at `CourseOfferingCourseServiceImpl` l.311-313 and dropped by `@JsonInclude(NON_NULL)`). A correct 0 would auto-fill as **blank**, not 0. The same pattern is in the commented-out block at l.1038 (not live).

### Alternatives ruled out

- **Frontend or HTTP caching:** `loadCoursesOffered()` runs on every `ngOnInit`; `MasterService` does a plain `httpClient.get`, no `shareReplay` or caching interceptor.
- **Backend cache:** the only `@Cacheable` annotations are on notification entities.
- **0 treated as falsy as the cause of "1":** can only produce blank or `creditHours`, never 1, for a Points module. Contributing, not the root cause.
- **Configure Fee reading the Module directly:** it never calls the Course endpoint; `data.course` has no credit field.

### Repositories

| Repo | Role | Evidence |
|---|---|---|
| sis-product-sis-frontend | **change** (all options) | auto-fill at `configure-tuition-fee-list.component.ts:588` |
| sis-product-sis-admin-backend | **change or context**, depending on Q1 | Option A: additive credit field on `CourseSummaryResponseDto`; option B: propagation in `CourseMasterServiceImpl` |
| Other 6 repos | context / not involved | not on the flow |

The same offering-sourced auto-fill exists in `configure-appeal-fee-list.component.ts:539` (uses `??`, so 0-safe, but still offering-sourced). Other fee lists may have it too.

### Other consumers of the offering copy (regression relevance)

- `admission/service/impl/RegisterCoursesServiceImpl.java:395` (`crc.getCourseOfferingCourse().getCreditPoints()`)
- Course registration services.

## Open Questions (QA / SME)

1. **Which value should Configure Fee auto-fill?**
   - **(A) Module value always.** Configure Fee auto-fills from the Module: frontend, plus additive `creditPoints`/`creditHours` on the CRSOFCRS `data.course` summary. Offering-level overrides ignored for fees. Likely **light** (2 repos, additive contract).
   - **(B) Offering value, but Module edits propagate to its offerings.** `CourseMasterServiceImpl.postUpdateEntity` updates offerings' `credit_points`. Overwrites offering overrides and changes credits used by course registration. Modifies existing rows → **full** track; probably needs a rule for offerings already in use.
   - **(C) Working as designed.** The user must also update Credit Points on the Module Offering. Fix only the 0-vs-blank defect at l.588 (frontend only).
   - Planner recommends **A** if Finance regards the Module as the fee authority, otherwise **C** with a UI hint.
2. **Record values:** confirm the reported module's Module Offering course record shows Credit Points 1, and whether the offering was created before the Module was edited to 0. The recording (`@ 01:00`) shows 0 with the cursor in the field; no sampled frame shows 1.
3. **Scope:** also cover the other fee grids that auto-fill from the offering (at least Appeal Fee; Resit / Repeat / Review not checked), or only the Tuition Fee grid the ticket names?

## Findings (out of scope, record only)

- F-1: The Module list shows "-" for Credit Points 0: `course-list.component.ts:45-46` (`course?.creditPoints ? course?.creditPoints : course?.creditHours`). Matches the recording `@ 00:29`.

## Codebase map corrections

- `generated/sis-product-sis-frontend.components.md`, `ConfigureTuitionFeeListComponent`: listed APIs omit `MasterService` → `/masters/CRSOFCRS` (a `build.js` gap; likely the same for the other `configure-*-fee-list` components).
- `sis-product-sis-frontend.md`, "words differ" note: "Model Master" in tickets can mean Module (`/admin/masters/course`); Configure Fee's "Module" dropdown lists Module Offering courses (`CRSOFCRS`), whose credit fields are a separate copy not updated by Module edits.
