# Codebase map

**In one line:** before planning a ticket, the harness builds a map of the code for free on the developer's machine, so the AI starts from the right files. It no longer spends its budget searching for them, or reaching wrong conclusions from the wrong ones.

**The map is a hint, not evidence.** Agents use it to find the right files quickly, then read and cite the code itself.

Status: **pilot**, on `sis-product-sis-frontend` and `sis-product-sis-admin-backend`, from 2026-09-18. The benefits below are expected; **How we will know** says how they will be measured. Other repos are added to `repos.json` once the pilot shows it helps.

---

## Why it exists

Every ticket starts the same way. The Jira ticket names a screen, such as "Administration → Master → Module → Co-Requisite". Before the AI can reason about the bug, it has to find in the code:

- the component that draws that screen;
- the API it calls;
- the controller and service that answer;
- the tables involved.

It does this by searching and opening files, from scratch on every ticket.

That search is heavy, because an AI session re-reads everything it has opened so far each time it takes a step. Every file opened while hunting for the starting point is carried through the rest of the planning. The record so far shows where the AI's effort goes (tokens processed, from each ticket's `metrics.json`; the AI runs within the team's Claude subscription, so this is usage, not money):

| Ticket | Understanding and design (planning) | Rest of the ticket | Planning share of AI usage |
|---|---|---|---|
| GSIS-28778 | 25.5 M tokens, 45 min | 8.7 M tokens | **75 %** |

Most of a ticket's AI effort goes on working out *where* and *what* before any code changes. That is the part the map targets.

The words also differ. The same screen is "Module" on GCET, "Course Master Catalogue" on base and GUtech, and `course` in the code. Without that link, the AI can plan confidently against the wrong screen or endpoint.

## What it takes to run

- **Building the map costs no AI tokens.** It is a Node.js script reading git on the developer's machine, and takes about 5 seconds for both repositories.
- It runs automatically each time `/work` plans a ticket, built from **the ticket's own branch**. A GCET ticket sees GCET's screens and endpoints: `gcet-sandbox-qa` has 114 endpoints and 16 tables that `base-development` does not.
- The AI's use of the map is cheap by design. It searches the indexes for a few lines rather than reading them, and the notes are a page per repo.
- There is nothing to set up per developer, and no extra infrastructure.

## The benefits

1. **Less effort and faster planning.**
   - The AI goes straight from the ticket's wording to the right files, instead of opening files to find them.
   - One grep chain replaces the search: screen → component → API service → controller → endpoint and its permission.
   - Because every file opened is carried through each later step, cutting the search early saves more than the search itself.
2. **Fewer wrong turns, fewer rework rounds.**
   - The map gives exact endpoint paths and the link between customer labels and code.
   - Example: a plan written without the map cited `/api/v1/course`; the real path is `/api/v1/courses`.
   - A wrong fact like that costs a re-plan or a failed evaluation round, and rework is the most expensive thing the harness does.
3. **Hard-won lessons stop being re-learned.**
   - On GSIS-28778, implementation ran about **17 hours of wall-clock time**, mostly a backend build that never finished.
   - The notes now tell the next session how to build and test each repository, what known problems to expect, and to stop a stalled build after about 15 minutes and report it.
4. **It gets better with use.**
   - When the AI finds the map wrong or incomplete, it reports a correction, and the notes are fixed.
   - Conclusions must still cite the code, so a stale map can cost a little time but can't slip a wrong fact into a plan.

## How we will know

The harness already records AI usage (tokens) and time per stage for every ticket. For the next frontend or admin-backend tickets, compare against GSIS-28778 and GSIS-24201:

| Measure | Where it comes from | What success looks like |
|---|---|---|
| Planning tokens per ticket | `/brain <ticket>` → tokens by stage | clearly lower on comparable tickets |
| Planning time | dashboard → time by stage | shorter |
| Evaluator blocking findings about wrong files, paths or screens | `evaluation-<n>.md` | fewer, ideally none |
| Implementation stalled on build or test | implementation reports | reported within minutes, not hours |
| Corrections the AI reports against the map | plans and implementation reports | a few early, then tapering off |

If the pilot shows a clear saving, the map is extended to the other services.

## Limits

- The savings are **expected, not yet measured**. The pilot exists to measure them.
- The indexes are built by pattern matching, not a compiler. Anything they miss surfaces as a correction.
- 496 of 722 pages have no menu label, because they are reached through buttons rather than menus. They are still found by page and component.
- Endpoint → tables is not mapped yet. Agents read the service and repository code for that step.

---

## What is in here

| Path | What it holds | Committed |
|---|---|---|
| `<repo>.md` | Short hand-written notes per repo: layout, where things live, how to build and test it, known pitfalls | yes |
| `repos.json` | The repos in the map, the default ref each is read at when no `--ref` is given, and the customer-line refs its menu labels come from | yes |
| `build.js` | Builds `generated/` from the repos through git. Node only, no dependencies, about 5 s | yes |
| `generated/` | Indexes rebuilt after every fetch, stamped with the branch and commit they were built from (`stamp.json`) | **no**, machine-local |

Generated indexes:

| File | Answers |
|---|---|
| `screens.md` | Ticket names a screen → route → routed component → the API services it injects (primary marked `*`). Labels per customer line (GCET calls the Course master "Module") |
| `api.md` | Frontend API service → backend controller |
| `sis-product-sis-frontend.routes.md` | Every route → component → file → API services |
| `sis-product-sis-frontend.components.md` | Template tag (`<sis-…>`) → component → file → API services |
| `sis-product-sis-admin-backend.endpoints.md` | Verb + path → controller method, file:line, `@PreAuthorizeGrant` |
| `sis-product-sis-admin-backend.tables.md` | Table → JPA entity → file |
| `sis-product-sis-admin-backend.menus.md` | Menu label → translation key → route, and where the menu row is defined |
| `sis-product-sis-admin-backend.clients.md` | Classes that call other services over HTTP |

## How to use it

- **Grep the indexes; don't read them whole.** Some run to thousands of rows. For example, `grep -i "module" generated/screens.md`, or `grep "/api/v1/courses" generated/*.endpoints.md`.
- Read the repo's notes (`<repo>.md`) before planning or building in that repo.
- Check `generated/stamp.json`. It names the branch and commit each repo was read at. If that isn't the branch you are working from, rebuild with `node sis-brain/codebase/build.js --ref origin/<source_branch>`. Without `--ref`, each repo is read at its `ref` in `repos.json`. A repo that lacks the `--ref` branch falls back to that ref, and the stamp records the branch it asked for.
- If the map is wrong or missing something, say so in the artifact (plan or implementation report, section **Codebase map corrections**). The orchestrator fixes the notes, or, for a generated index, records the gap for the maintainers of `build.js`.

## Rules

- **Notes stay short**, about one page per repo. Write down only what saves the next session real time, and only what has been checked against the code.
- **Nothing copied from config.** No URLs, keys, tenant settings or credentials. `build.js` extracts names and paths only.
- No ticket history here; that belongs in `tickets/`.

## Blast radius

When a ticket's PRs are prepared, the harness runs `node codebase/blast.js <TICKET-ID>`, which works out how far the change reaches. It diffs the ticket branch against its source branch and places each file with the indexes above. It writes `tickets/<ID>/blast.json` in two rings:

- **ring 1: what the ticket edited.** These are screens (including screens that embed a changed component), tables of changed entities, and APIs whose controller, frontend service or service class changed.
- **ring 2: what depends on it.** These are the other screens that call an API the change reaches, grouped by product area. Each one records the ring 1 items it is reached through. A changed table reaches the APIs whose controllers use it within two classes.

The dashboard draws the rings on the ticket's detail view. The script and its output format belong to the brain, so they can change without a harness change. It uses git only, and costs no tokens.
