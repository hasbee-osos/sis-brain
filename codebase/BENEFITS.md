# The codebase map: why it exists and what it should save

**In one line:** before planning a ticket, the harness now builds a map of the code for free on the developer's machine, so the AI starts from the right files. It no longer spends its budget searching for them, or reaching wrong conclusions from the wrong ones.

Status: **pilot**, on `sis-product-sis-frontend` and `sis-product-sis-admin-backend`, from 2026-09-18. The benefits below are expected; the section **How we will know** says how they will be measured.

---

## The problem

Every ticket starts the same way. The Jira ticket names a screen, such as "Administration → Master → Module → Co-Requisite". Before the AI can reason about the bug, it has to find that screen in the code:

- which Angular component draws it;
- which API call it makes;
- which controller and service answer the call;
- which tables hold the data.

It does this by searching and opening files, and it repeats the search from scratch on every ticket.

That search is expensive, because an AI session re-reads everything it has opened so far each time it takes a step. Every file opened while hunting for the starting point is carried, and paid for, through the rest of the planning.

The record so far shows where the money goes. Figures are API-equivalent at list prices, from each ticket's `metrics.json`:

| Ticket | Understanding and design (planning) | Rest of the ticket | Planning share |
|---|---|---|---|
| GSIS-28778 | **$26.92**, 45 min, about 25 M tokens read | $9.89 | **73 %** |

Most of the cost of a ticket is spent working out *where* and *what* before any code changes. That is the part the map targets.

The words also differ. The same screen is called "Module" on GCET, "Course Master Catalogue" on base and GUtech, and `course` in the code. Without that link, the AI can plan confidently against the wrong screen or the wrong endpoint.

## What the map is

It lives in the brain repository, `sis-brain/codebase/`, and has two parts.

1. **Generated indexes**, rebuilt automatically by a script:
   - **Screens:** menu label (per customer line) → page → component → the API services it calls.
   - **API:** frontend service → backend controller.
   - **Endpoints:** every endpoint, with the permission it requires.
   - **Tables, routes and components.**
2. **Short hand-written notes per repository**, about one page each:
   - where things live;
   - how to build and test;
   - the known problems of this environment.

## What it costs

- **Building the map costs no AI tokens.** It is a Node.js script reading git on the developer's machine, and takes about 5 seconds for both repositories.
- It runs automatically each time `/work` plans a ticket, built from **the ticket's own branch**. A GCET ticket sees GCET's screens and endpoints: `gcet-sandbox-qa` has 114 endpoints and 16 tables that `base-development` does not.
- The AI's use of the map is cheap by design. It searches the indexes for a few lines rather than reading them, and the notes are a page each.
- There is nothing to set up per developer, and no extra infrastructure.

## The benefits

1. **Lower cost and faster planning.** The AI goes straight from the ticket's wording to the right files, instead of opening files to find them. Because every file opened is paid for again on each later step, cutting the search early saves more than the search itself.
2. **Fewer wrong turns, fewer rework rounds.**
   - The map gives exact endpoint paths and the link between customer labels and code.
   - Example: a plan written without the map cited the endpoint `/api/v1/course`; the real path is `/api/v1/courses`.
   - A wrong fact like this, in a part that matters, costs a re-plan or a failed evaluation round. Rework is the most expensive thing the harness does.
3. **Hard-won lessons stop being re-learned.**
   - On GSIS-28778, the implementation stage ran about **17 hours of wall-clock time**, mostly a backend build that never finished. One build attempt was left running for about 10 hours.
   - The notes now tell the next session how to build and test each repository, which known problems to expect, and to stop a stalled build after about 15 minutes and report it.
   - That turns hours of waiting into a fast, clear answer.
4. **The map gets better with use.** When the AI finds the map wrong or incomplete, it reports a correction, and the notes are fixed. The AI still has to cite the actual code for every conclusion; the map only tells it where to look. So a stale map can cost a little time, but it can't slip a wrong fact into a plan unchecked.

## How we will know

The harness already records tokens, time and cost per stage for every ticket (the leadership dashboard). For the next frontend or admin-backend tickets, compare against GSIS-28778 and GSIS-24201:

| Measure | Where it comes from | What success looks like |
|---|---|---|
| Planning cost and tokens per ticket | dashboard → cost by stage | clearly lower on comparable tickets |
| Planning time | dashboard → time by stage | shorter |
| Evaluator blocking findings about wrong files, paths or screens | `evaluation-<n>.md` | fewer, ideally none |
| Implementation stalled on build or test | implementation reports | reported within minutes, not hours |
| Corrections the AI reports against the map | plans and implementation reports | a few early, then tapering off |

If the pilot shows a clear saving, the map is extended to the other services by adding each one to `repos.json` and writing its notes.

## Limits, stated plainly

- The savings above are **expected, not yet measured**. The pilot exists to measure them.
- The indexes are built by pattern matching, not a compiler. Anything they miss surfaces as a correction.
- 496 of 722 pages have no menu label, because they are reached through buttons rather than menus. They are still found by page and component.
- The map is a shortcut, not a source of truth. Conclusions in plans and reviews still rest on the code itself.
