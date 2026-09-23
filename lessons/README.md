# Lessons

What corrections taught the harness. Claude carries nothing from one session to the next, so a review comment, a QA defect, a packet answer or a blocking evaluator finding changes future tickets only if it is written down here.

- `index.jsonl` — one line per lesson. A run greps this and opens only the few lessons that match its repos, area and stage.
- `<id>.md` — one lesson per file: what the run believed, what is actually true, how it surfaced, and the evidence.

**Only a `confirmed` lesson is read by a later run.** A new lesson starts `proposed` until a human agrees with it.

**Kind decides who acts on it.** A `product` lesson is read by future runs. A `harness` lesson is never applied automatically — it waits for a maintainer to turn it into a pull request against the harness plugin, because the harness is changed by review, not by a ticket editing itself.

A lesson a later ticket disproves is set to `retired` with the reason. Nothing here is deleted; the trail from correction to fix is the point.

How lessons are written and read is specified in the harness plugin: the `lessons` skill (what is worth recording, how it is classified, when a stage reads one) and the `brain` skill (the files, the journal event and the commit).
