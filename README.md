# The brain

This repository is written by the Claude Code engineering harness. It is the **record of every ticket the team's harness sessions have worked on** — what was done, what was decided, why, and what it cost.

It is cloned into each developer's workspace as `sis-brain`, beside their product repo clones. Every session pulls it, records as it works, and pushes at each milestone, so it stays current for everyone.

---

## What is in here

| Path | What it holds |
|---|---|
| `index.jsonl` | One line per ticket milestone — the quickest way to see recent work |
| `tickets/<TICKET-ID>/state.json` | The resume point: status, iteration, branch, repos, PRs, and `next_action` |
| `tickets/<TICKET-ID>/journal.jsonl` | Append-only event log with timestamps |
| `tickets/<TICKET-ID>/decisions.md` | Every decision taken, with its justification and evidence |
| `tickets/<TICKET-ID>/*.md` | The analysis, design, per-iteration implementation reports and evaluations, PR descriptions |
| `tickets/<TICKET-ID>/metrics.json` | Tokens, durations and iteration counts for that ticket |
| `metrics/` | `runs.jsonl` and `harness.prom` for Prometheus/Grafana — **not committed** |
| `current.json` | which ticket this machine is working on right now — **not committed** |
| `.harness-brain` | marker that tells git-guard this repo may be committed to |

## How to use it

- **Reopened bug?** Read `tickets/<TICKET-ID>/decisions.md` first. It says why the fix was built the way it was, which alternatives were rejected, and on what evidence.
- **Picking up someone's half-finished ticket?** Run `/brain <TICKET-ID>` in a Claude session started in this workspace, or just read `state.json` — `next_action` says what happens next in plain words.
- **Listing recent work?** `/brain` with no argument, or `tail index.jsonl`.

## How it is shared

- Everyone commits straight to `main` and pushes. No PRs, no review — this is a record, and a gate would stop it being current.
- Conflicts are rare by design: each ticket owns a folder, so two people on two tickets never touch the same file. `index.jsonl` is append-only and merges itself (`merge=union` in `.gitattributes`).
- `metrics/` and `current.json` are machine-local and gitignored. Each ticket's own `metrics.json` **is** committed — it is what that ticket cost.
- If a push is rejected: `git pull --rebase`, then push again. Never force-push; the harness's git guard blocks it here as everywhere else.

## Rules

- **Nothing here is generated for show.** If a file says a test passed, that test was executed and the output is in the artifact.
- **Iteration history is never overwritten.** `evaluation-1.md` stays when iteration 2 writes `evaluation-2.md`.
- **The journal is append-only.** Corrections are appended, never edited in place.
- **No secrets, no chain-of-thought, no bulk file dumps, no personal data.** If you find any, delete it and tell the harness maintainers — a rule is missing.
- **This is not a product repo.** It holds no product code and must never be nested inside one.

## Deleting things

Safe to delete a whole `tickets/<TICKET-ID>/` folder once the ticket is closed and you no longer want the history — but that is exactly the history that stops a reopened bug being re-debugged from scratch. Prefer to keep it.
