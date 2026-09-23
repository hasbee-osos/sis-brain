### D-1 — Routing: bug on the base line, cut from base-development
- **Stage:** plan, iteration 0
- **Decided by:** orchestrator · confirmed by human 2026-09-23T10:19:27Z
- **Options considered:** cut from `base-sandbox-qa` (the `git-workflow` default for the base line); cut from `base-development`
- **Why:** Jira issue type is Bug; Customer Name is "Product Core Feature", which maps to the `base` line. The developer chose to cut the branch from `base-development` so it carries no unverified tickets; the PR still targets `base-sandbox-qa`.
- **Convention cited:** `git-workflow` → The routing decision (source branch overridden by the developer)
- **Evidence:** Jira GSIS-26592 issuetype = "Bug"; Customer Name = "Product Core Feature"
- **Status:** LOCKED

Work type: `bug` · Line: `base` · Branch: `base/bugfix/GSIS-26592-configure-fee-stale-credit-point` · Source branch: `base-development` · PR target: `base-sandbox-qa`

### D-2 — Root cause: Configure Fee auto-fills from the Module Offering's copy of Credit Points, which Module edits do not update
- **Stage:** plan, iteration 1
- **Decided by:** planner · confirmed by human: not required (falsification check asked of QA in qa-packet.md Q1)
- **Options considered:** frontend/HTTP caching; backend caching; 0 treated as falsy producing "1"; Configure Fee reading the Module directly; stale offering copy
- **Why:** the Tuition Fee grid fills Credit Points from `CRSOFCRS` (`CourseOfferingCourse`), whose `credit_points` is copied from the Module only when the module is added to an offering; `CourseMasterServiceImpl` pre/post update never writes it back; no caches on the path; a falsy 0 can yield blank, never 1
- **Convention cited:** none
- **Evidence:** `sis-product-sis-frontend/src/app/modules/finance/master/configure-fee/configure-tuition-fee-list/configure-tuition-fee-list.component.ts:576-591`; `sis-product-sis-frontend/src/app/modules/admin/masters/course-offering-master/add-view-edit-course-offering-course/add-view-edit-course-offering-course.component.ts:233-270`; `sis-product-sis-admin-backend/.../administration/service/impl/CourseOfferingCourseServiceImpl.java:306-314`; `sis-product-sis-admin-backend/.../administration/service/impl/CourseMasterServiceImpl.java:581-661`; `Configure_Fee_Wrong_credit.mp4 @ 00:51–01:00` (the stale 1 itself is not visible in the sampled frames)
- **Status:** LOCKED
