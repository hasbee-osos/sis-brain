# The brain

This repository is written by the Claude Code engineering harness. It is the **record of every ticket the team's harness sessions have worked on** — what was done, what was decided, why, and what it cost.

It is cloned into each developer's workspace as `sis-brain`, beside their product repo clones. Every session pulls it, records as it works, and pushes at each milestone, so it stays current for everyone.

**How this repository is written — its layout, what each stage records, every field and event — is specified in one file: `skills/brain/SKILL.md` in the engineering harness.** To review or improve the record, read and edit that file, not this README.

---

## Where to look

| Path | What it holds |
|---|---|
| `index.jsonl` | One line per ticket milestone — the quickest way to see recent work |
| `tickets/<TICKET-ID>/` | One folder per ticket: `state.json` (where it stands and `next_action`), `journal.jsonl` (what happened, when), `decisions.md` (why), the per-iteration artifacts, and `metrics.json` (what it cost) |
| `dashboard/` | The leadership dashboard: `build.js` turns this repository into one page, published on claude.ai with `/brain publish`. The page link is in `dashboard/artifact.json` |
| `codebase/` | The codebase map: short notes per product repo and indexes rebuilt after every fetch (screen → route → component → API → controller, endpoints, tables). Harness agents start from it; see `codebase/README.md` |

## How to use it

- **Leadership view?** Open the link in `dashboard/artifact.json`.
- **Reopened bug, or extending a delivered story?** Read the ticket's `decisions.md` first. It says why the change was built the way it was, which alternatives were rejected, and on what evidence.
- **Picking up someone's half-finished ticket?** Run `/brain <TICKET-ID>` in a Claude session started in this workspace, or read `state.json` — `next_action` says what happens next in plain words.
- **Listing recent work?** `/brain` with no argument, or `tail index.jsonl`.

## Rules

- **Nothing here is generated for show.** If a file says a test passed, that test was executed and the output is in the artifact.
- **History is never overwritten.** Iteration artifacts are numbered, and the journal is append-only.
- **No secrets, no chain-of-thought, no bulk file dumps, no personal data beyond a ticket's assignee.** If you find any, delete it and tell the harness maintainers — a rule is missing.
- Everyone commits straight to `main`. If a push is rejected: `git pull --rebase`, then push again. Never force-push.
- **Keep closed tickets.** Deleting a ticket folder deletes exactly the history that stops a reopened ticket being re-investigated from scratch.
