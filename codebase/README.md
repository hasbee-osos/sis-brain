# Codebase map

A shortcut into the product code for harness sessions, so each ticket does not start by rediscovering the same screens, endpoints and tables. **The map is a hint, not evidence.** Use it to find the right files quickly, then read and cite the code itself.

Why it exists and what it should save, in plain terms for leadership: [`BENEFITS.md`](BENEFITS.md).

It is being piloted on `sis-product-sis-frontend` and `sis-product-sis-admin-backend`. Other repos are added to `repos.json` once the pilot shows it helps.

## What is in here

| Path | What it holds | Committed |
|---|---|---|
| `<repo>.md` | Short hand-written notes per repo: layout, where things live, how to build and test it, known pitfalls | yes |
| `repos.json` | The repos in the map, the default ref each is read at when no `--ref` is given, and the customer-line refs its menu labels come from | yes |
| `build.js` | Builds `generated/` from the repos through git. Node only, no dependencies, about 5 s | yes |
| `generated/` | Indexes rebuilt after every fetch, stamped with the commit they were built from (`stamp.json`) | **no**, machine-local |

Generated indexes:

| File | Answers |
|---|---|
| `screens.md` | Ticket names a screen → route → routed component. Labels per customer line (GCET calls the Course master "Module") |
| `api.md` | Frontend API service → backend controller |
| `sis-product-sis-frontend.routes.md` | Every route → component → file |
| `sis-product-sis-frontend.components.md` | Template tag (`<sis-…>`) → component → file |
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
