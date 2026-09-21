#!/usr/bin/env node
/**
 * Builds the leadership dashboard from the brain.
 *
 *   node dashboard/build.js
 *
 * Reads only committed files (tickets/*, dashboard/labels.json, dashboard/prices.json), so every
 * clone builds the same page. Writes dashboard/dist/index.html: template.html with the
 * data embedded, and dashboard/dist/costs.json (API-equivalent cost, never shown on the
 * page). Node only, no dependencies.
 *
 * The files it reads are specified in the harness's skills/brain/SKILL.md.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const BRAIN = path.resolve(__dirname, "..");
const TICKETS = path.join(BRAIN, "tickets");
const OUT_DIR = path.join(__dirname, "dist");

const RECORD_FILES = new Set(["state.json", "journal.jsonl", "metrics.json"]);
// Display names, colours and stage aliases. The build and the page list no stages of their own.
const LABELS = readJson(path.join(__dirname, "labels.json"), {});
const STAGE_ALIASES = LABELS.stage_aliases || {};
const stageKey = (s) => STAGE_ALIASES[s] || s;

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function readJsonl(file) {
  try {
    return fs
      .readFileSync(file, "utf8")
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function seconds(from, to) {
  const a = Date.parse(from);
  const b = Date.parse(to);
  return Number.isFinite(a) && Number.isFinite(b) && b >= a ? (b - a) / 1000 : 0;
}

// ------------------------------------------------------------------ journal

function stageRuns(events) {
  const open = new Map();
  const runs = [];
  for (const e of events) {
    if (e.event === "stage_start") open.set(e.stage, e);
    else if (e.event === "stage_end" && open.has(e.stage)) {
      const start = open.get(e.stage);
      open.delete(e.stage);
      runs.push({ stage: e.stage, iteration: e.iteration ?? start.iteration ?? null, start: start.ts, end: e.ts, seconds: seconds(start.ts, e.ts), startEvent: start, endEvent: e });
    }
  }
  for (const start of open.values()) {
    runs.push({ stage: start.stage, iteration: start.iteration ?? null, start: start.ts, end: null, seconds: 0 });
  }
  // stage_corrected replaces the recorded times of the run that began at original_start,
  // and takes out any spans in which the AI recorded no activity (a stalled build, say).
  for (const c of events.filter((e) => e.event === "stage_corrected")) {
    const run = runs.find((r) => r.stage === c.stage && r.start === c.original_start);
    if (!run) continue;
    run.start = c.start || run.start;
    run.end = c.end || run.end;
    run.excluded = (c.excluded || []).filter((x) => x && x.start && x.end);
    run.corrected = c.reason || true;
    run.seconds = seconds(run.start, run.end) - run.excluded.reduce((a, x) => a + seconds(x.start, x.end), 0);
    if (run.startEvent) run.startEvent.ts = run.start;
    if (run.endEvent) run.endEvent.ts = run.end;
  }
  return runs.map(({ startEvent, endEvent, ...r }) => ({ ...r, stage: stageKey(r.stage) }));
}

/**
 * ts_corrected moves every event recorded at original_ts (or only the named events) to
 * corrected_ts. Stage events are left to stage_corrected, which stageRuns has applied.
 */
function applyTsCorrections(events) {
  for (const c of events.filter((e) => e.event === "ts_corrected")) {
    if (!c.original_ts || !c.corrected_ts) continue;
    for (const e of events) {
      if (e.ts !== c.original_ts || /^(stage_start|stage_end|stage_corrected|ts_corrected)$/.test(e.event)) continue;
      if (Array.isArray(c.events) && !c.events.includes(e.event)) continue;
      e.ts = c.corrected_ts;
    }
  }
}

/**
 * Periods spent waiting on people for answers, from input_requested / input_received.
 * Several audiences can be waited on at once (a QA packet and a developer question);
 * an input_received closes the waits for its audience, or all of them if it names none.
 */
function waits(events, state, now) {
  const periods = [];
  const open = new Map();
  for (const e of events) {
    if (e.event === "input_requested") {
      const key = e.audience || "unknown";
      if (!open.has(key)) open.set(key, { audience: e.audience || null, packet: e.packet || null, start: e.ts, end: null });
    } else if (e.event === "input_received") {
      const keys = e.audience && open.has(e.audience) ? [e.audience] : [...open.keys()];
      if (!keys.length) {
        // Answer with no recorded request (records written before input_requested existed):
        // the wait began when the previous stage ended.
        const prev = events.filter((x) => x.event === "stage_end" && x.ts <= e.ts).pop();
        if (prev) periods.push({ audience: e.audience || null, packet: e.packet || null, start: prev.ts, end: e.ts, inferred: true });
      }
      for (const k of keys) { const p = open.get(k); p.end = e.ts; periods.push(p); open.delete(k); }
    } else if (e.event === "stage_start" && open.size) {
      // Work resumed, so nothing asked earlier is still blocking, even if its answer was never recorded.
      for (const [k, p] of open) { p.end = e.ts; periods.push(p); open.delete(k); }
    }
  }
  // Records written before input_requested existed: infer an open wait from state.
  if (!open.size && state.status === "NEEDS_INPUT" && !periods.length) {
    const artifacts = state.artifacts || {};
    const audience = artifacts.sme_packet ? "sme" : artifacts.qa_packet ? "qa" : "developer";
    const lastEnd = [...events].reverse().find((e) => e.event === "stage_end");
    open.set(audience, { audience, packet: artifacts.sme_packet || artifacts.qa_packet || null, start: (lastEnd && lastEnd.ts) || state.updated_at, end: null, inferred: true });
  }
  for (const p of open.values()) periods.push(p);
  return periods.map((p) => ({ ...p, seconds: seconds(p.start, p.end || now) })).sort((a, b) => (a.start < b.start ? -1 : 1));
}

// ------------------------------------------------------------ who holds it
//
// The board groups tickets by who holds them, not by stage, so new harness stages
// (automated QA, AI PR review, smoke tests, …) appear without any change here:
//   claude  — a stage is running;
//   person  — the run stopped until someone answers, confirms or decides;
//   outside — the harness handed the ticket off (a PR raised) and the next move is elsewhere;
//   closed  — a developer confirmed the ticket is finished.

// pr_prepared: records written before handed_off existed
const HANDOFF_EVENTS = new Set(["handed_off", "pr_prepared"]);
const RETURN_EVENTS = new Set(["stage_start", "ticket_reopened", "ticket_closed", "input_requested", "escalated"]);

/** Periods the ticket spent handed off: from a hand-off until the harness took it up again. */
function handoffs(events) {
  const spans = [];
  let open = null;
  for (const e of events) {
    if (HANDOFF_EVENTS.has(e.event)) {
      if (!open) open = { start: e.ts, end: null, to: null, refs: [] };
      if (e.to) open.to = e.to;
      for (const r of e.refs || []) open.refs.push(r);
    } else if (open && RETURN_EVENTS.has(e.event)) {
      open.end = e.ts;
      spans.push(open);
      open = null;
    }
  }
  if (open) spans.push(open);
  return spans.map((s) => ({ ...s, to: s.to || "reviewers" }));
}

/**
 * Each time the ticket came back after a hand-off or a close. A ticket_reopened event
 * records it; for records written before that event existed, a session resumed after a
 * hand-off counts only once a stage actually ran again.
 */
function returns(events) {
  const out = [];
  let away = false;
  let resumed = null;
  for (const e of events) {
    if (HANDOFF_EVENTS.has(e.event) || e.event === "ticket_closed") { away = true; resumed = null; }
    else if (e.event === "ticket_reopened") { out.push({ ts: e.ts, reason: e.reason || null, ref: e.ref || null }); away = false; resumed = null; }
    else if (e.event === "session_resumed" && away) resumed = resumed || e;
    else if (e.event === "stage_start" && resumed) { out.push({ ts: resumed.ts, reason: null, ref: null, derived: true }); away = false; resumed = null; }
  }
  return out.map((r, i) => ({ ...r, round: i + 2 }));
}

function prRefs(state, span) {
  const fromState = (state.prs || []).map((p) => {
    const m = p.url && String(p.url).match(/\/pull\/(\d+)/);
    return { repo: p.repo || null, href: p.url || p.compare_link || null, opened: Boolean(p.url), label: p.url ? (m ? "PR #" + m[1] : "PR") : "PR not opened yet" };
  });
  if (fromState.length) return fromState;
  return (span ? span.refs : []).map((href) => {
    const m = String(href).match(/\/pull\/(\d+)/);
    return { repo: null, href, opened: Boolean(m), label: m ? "PR #" + m[1] : "Link" };
  });
}

function holder(events, runs, waitPeriods, handoffSpans, state) {
  const byStart = [...runs].sort((a, b) => (a.start < b.start ? -1 : 1));
  const lastRun = byStart[byStart.length - 1] || null;
  const stage = lastRun ? lastRun.stage : null;
  const lastTs = events.length ? events[events.length - 1].ts : state.updated_at;
  const closeOrReopen = [...events].reverse().find((e) => e.event === "ticket_closed" || e.event === "ticket_reopened");
  const escalated = state.status === "ESCALATED";

  if (closeOrReopen ? closeOrReopen.event === "ticket_closed" : state.status === "DONE") {
    return { lane: "closed", who: null, stage, since: closeOrReopen ? closeOrReopen.ts : state.updated_at, outcome: (closeOrReopen && closeOrReopen.outcome) || null };
  }
  const openRun = byStart.filter((r) => !r.end).pop();
  if (openRun) return { lane: "claude", who: null, stage: openRun.stage, iteration: openRun.iteration, since: openRun.start };
  const openWait = waitPeriods.find((w) => !w.end);
  if (openWait) return { lane: "person", who: openWait.audience || "developer", stage, since: openWait.start, escalated };
  const handoff = handoffSpans[handoffSpans.length - 1];
  if (handoff && !handoff.end) return { lane: "outside", who: handoff.to, stage, since: handoff.start, refs: prRefs(state, handoff) };
  // stopped between stages (a confirmation, an escalation, a paused run): the developer resumes it
  const lastEnd = [...events].reverse().find((e) => e.event === "stage_end" || e.event === "escalated");
  return { lane: "person", who: "developer", stage, since: lastEnd ? lastEnd.ts : lastTs, escalated };
}

/**
 * Splits a ticket's whole elapsed time, from start to close (or now), into what was
 * happening: the AI working a stage, waiting on someone (keyed by the audience the journal
 * names: developer, qa, sme, or any other), handed off outside the harness, or idle.
 * A gap that ends in a human confirmation counts as waiting on the developer; after the
 * last event, who holds the ticket decides.
 */
function timeBreakdown(events, runs, waitPeriods, handoffSpans, hold, state, now) {
  // a corrected stage can begin before the recorded start; the strip starts at whichever is first
  const startTs = [state.created_at, events[0] && events[0].ts, ...runs.map((r) => r.start)].filter(Boolean).sort()[0];
  const endTs = hold.lane === "closed" ? hold.since : now;
  const start = Date.parse(startTs);
  const end = Date.parse(endTs);
  const totals = {};
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return { totals, segments: [], elapsed: 0 };

  const span = (a, b) => [Date.parse(a), b ? Date.parse(b) : end];
  const work = runs.filter((r) => r.end).flatMap((r) => {
    // a run with excluded spans counts as working only between them
    const pieces = [];
    let from = r.start;
    for (const x of [...(r.excluded || [])].sort((a, b) => (a.start < b.start ? -1 : 1))) {
      pieces.push(span(from, x.start));
      from = x.end;
    }
    pieces.push(span(from, r.end));
    return pieces;
  });
  const waitSpans = waitPeriods.map((w) => [...span(w.start, w.end), w.audience && w.audience !== "unknown" ? w.audience : "developer"]);
  const outside = handoffSpans.map((h) => span(h.start, h.end));
  const inside = (list, t) => list.find(([a, b]) => t > a && t < b);
  const confirmAt = new Set(events.filter((e) => e.event === "human_confirmed").map((e) => Date.parse(e.ts)));
  const lastEvent = events.length ? Date.parse(events[events.length - 1].ts) : start;
  const tailKind = hold.lane === "person" ? hold.who : hold.lane === "outside" ? "outside" : "idle";

  const cuts = new Set([start, end]);
  for (const e of events) { const t = Date.parse(e.ts); if (t > start && t < end) cuts.add(t); }
  for (const [a, b] of [...work, ...waitSpans, ...outside]) for (const t of [a, b]) if (t > start && t < end) cuts.add(t);
  const points = [...cuts].sort((a, b) => a - b);

  const segments = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1], mid = (a + b) / 2;
    let kind, w;
    if (inside(work, mid)) kind = "working";
    else if ((w = inside(waitSpans, mid))) kind = w[2];
    else if (inside(outside, mid)) kind = "outside";
    else if (a >= lastEvent) kind = tailKind;
    else kind = confirmAt.has(b) ? "developer" : "idle";
    const secs = (b - a) / 1000;
    totals[kind] = (totals[kind] || 0) + secs;
    const last = segments[segments.length - 1];
    if (last && last.kind === kind) last.seconds += secs;
    else segments.push({ kind, start: new Date(a).toISOString(), seconds: secs });
  }
  return { totals, segments, elapsed: (end - start) / 1000 };
}

/** Dev lead estimate as written in Jira ("3h", "1d 4h", "2w"), in working hours (1d = 8h, 1w = 5d). */
function estimateHours(text) {
  if (!text || typeof text !== "string") return null;
  const unit = { w: 40, d: 8, h: 1, m: 1 / 60 };
  let hours = 0, found = false;
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s*([wdhm])/gi)) { hours += Number(m[1]) * unit[m[2].toLowerCase()]; found = true; }
  return found ? hours : null;
}

/**
 * Developer time from Jira. The estimate is the ticket's Dev Lead Estimation, or, when that is
 * empty, the sum of its developer sub-tasks' original estimates (developers often create a
 * sub-task for the dev work and estimate or log time there). Logged time is summed from the
 * sub-tasks; a sub-task whose type names QA counts as QA time, every other as developer time.
 */
function devTime(jira) {
  const subtasks = Array.isArray(jira.subtasks) ? jira.subtasks : [];
  const isQa = (s) => /\bqa\b/i.test(s.type || "");
  const sum = (list, field) => {
    const hs = list.map((s) => estimateHours(s[field])).filter((h) => h != null);
    return hs.length ? hs.reduce((a, h) => a + h, 0) : null;
  };
  const dev = subtasks.filter((s) => !isQa(s));
  const parent = estimateHours(jira.estimate);
  const fromSubtasks = sum(dev, "estimate");
  return {
    estimate: jira.estimate || null,
    estimate_hours: parent != null ? parent : fromSubtasks,
    estimate_source: parent != null ? "Dev Lead Estimation" : fromSubtasks != null ? "dev sub-tasks" : null,
    subtask_estimate_hours: fromSubtasks,
    dev_logged_hours: sum(dev, "logged"),
    qa_logged_hours: sum(subtasks.filter(isQa), "logged"),
    subtasks,
  };
}

// ---------------------------------------------------------------- decisions

function parseDecisions(file) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return [];
  }
  const blocks = text.split(/^### /m).slice(1);
  return blocks
    .map((block) => {
      const [heading, ...rest] = block.split(/\r?\n/); // records written on Windows may have CRLF endings
      const m = heading.match(/^(D-\d+)\s*[—–-]+\s*(.+)$/);
      if (!m) return null;
      const field = (name) => {
        const line = rest.find((l) => l.startsWith(`- **${name}:**`));
        return line ? line.replace(`- **${name}:**`, "").trim() : null;
      };
      return {
        id: m[1],
        title: m[2].trim(),
        stage: field("Stage"),
        decided_by: field("Decided by"),
        options: field("Options considered"),
        why: field("Why"),
        status: field("Status") || "LOCKED",
      };
    })
    .filter(Boolean);
}

// -------------------------------------------------------------- evaluations

/**
 * The findings listed in an evaluation-<n>.md, under its "Blocking Findings" and
 * "Non-Blocking Findings" headings: one per top-level list item, with its ID (E-1, NB-2, …)
 * when it has one, its title (the bold lead-in, or else the first sentence) and the rest.
 */
function parseFindings(file) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
  const out = { blocking: [], advisory: [] };
  let bucket = null;
  let item = null;
  const plain = (s) => s.replace(/\*\*|`/g, "").replace(/\s+/g, " ").trim();
  const finish = () => {
    if (!item || !bucket) return;
    let body = item.join(" ").trim();
    if (/^none\.?$/i.test(plain(body))) return;
    let title;
    const bold = body.match(/^\*\*(.+?)\*\*\s*(.*)$/);
    if (bold) { title = bold[1]; body = bold[2]; }
    else {
      const m = body.match(/^(.+?[.:])(\s|$)(.*)$/);
      title = m ? m[1] : body;
      body = m ? m[3] : "";
    }
    title = plain(title);
    const id = title.match(/^(?:([A-Z]{1,3}-\d+)\s*)?(?:\[([^\]]*)\])?\s*(?:[—–:-]\s*)?(.*)$/);
    out[bucket].push({
      id: id[1] || null,
      scope: id[2] || null,
      title: (id[3] || title).replace(/[.:]$/, ""),
      detail: plain(body).replace(/^[,;:]s*/, "").slice(0, 700) || null,
    });
  };
  for (const line of text.split(/\r?\n/)) {
    const h = line.match(/^#{2,3}\s+(.*)$/);
    if (h) {
      finish(); item = null;
      const name = h[1].toLowerCase();
      bucket = /non[- ]?blocking|advisory/.test(name) ? "advisory" : /blocking|must fix/.test(name) ? "blocking" : null;
      continue;
    }
    if (!bucket) continue;
    const li = line.match(/^(?:[-*]|\d+\.)\s+(.*)$/);
    if (li) { finish(); item = [li[1]]; }
    else if (item && line.trim()) item.push(line.trim());
  }
  finish();
  return out;
}

// --------------------------------------------------------------------- cost
//
// API-equivalent cost: what the recorded tokens would cost at list API prices
// (dashboard/prices.json). The team runs on a Claude subscription, so this is never
// shown on the page, where leadership would read it as a bill. It is written to
// dashboard/dist/costs.json and printed in the build summary for the harness maintainers.

function priceTokens(tokens, price) {
  if (!tokens || !price) return 0;
  // thinking is already inside output; never add it.
  return (
    ((tokens.input || 0) * price.input +
      (tokens.output || 0) * price.output +
      (tokens.cache_read || 0) * price.cache_read +
      (tokens.cache_creation || 0) * price.cache_write) /
    1e6
  );
}

function costs(metrics, prices) {
  const fallback = prices.models[prices.default_model];
  const byModel = metrics.tokens_by_model || {};
  const models = Object.keys(byModel);
  let total = 0;
  const unpriced = [];
  if (models.length) {
    for (const model of models) {
      const price = prices.models[model];
      if (!price) unpriced.push(model);
      total += priceTokens(byModel[model], price || fallback);
    }
  } else {
    total = priceTokens(metrics.tokens, fallback);
  }
  // Stages are priced at the ticket's blended rate per token, so they add up to the total.
  const allTokens = metrics.tokens || {};
  const fallbackTotal = priceTokens(allTokens, fallback);
  const ratio = fallbackTotal > 0 ? total / fallbackTotal : 1;
  const byStage = {};
  for (const [stage, tokens] of Object.entries(metrics.tokens_by_stage || {})) {
    byStage[stageKey(stage)] = (byStage[stageKey(stage)] || 0) + priceTokens(tokens, fallback) * ratio;
  }
  return { total, byStage, unpriced };
}

// ------------------------------------------------------------------- ticket

function buildTicket(dir, now) {
  const id = path.basename(dir);
  const state = readJson(path.join(dir, "state.json"), null);
  if (!state) return { id, broken: true };
  let events = readJsonl(path.join(dir, "journal.jsonl")).filter((e) => e && e.ts && e.event);
  events.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
  const metrics = readJson(path.join(dir, "metrics.json"), {});
  const jira = state.jira || {};
  const runs = stageRuns(events);
  applyTsCorrections(events);
  // corrections are dated when they were written, not when anything happened on the ticket
  events = events.filter((e) => e.event !== "stage_corrected" && e.event !== "ts_corrected");
  events.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
  const waitPeriods = waits(events, state, now);
  const handoffSpans = handoffs(events);
  const back = returns(events);
  // every sprint the issue was in (records before sprints existed have only the current one);
  // each stage run and each return belongs to the last sprint that had started by then
  const sprints = (Array.isArray(jira.sprints) && jira.sprints.length ? jira.sprints : jira.sprint ? [jira.sprint] : [])
    .filter((x) => x && x.name).sort((a, b) => ((a.start || "") < (b.start || "") ? -1 : 1));
  const sprintAt = (ts) => {
    let hit = null;
    for (const x of sprints) if (!x.start || Date.parse(x.start) <= Date.parse(ts)) hit = x.name;
    return hit || (sprints[0] && sprints[0].name) || null;
  };
  for (const r of runs) r.sprint = r.start ? sprintAt(r.start) : null;
  for (const r of back) r.sprint = sprintAt(r.ts);
  const hold = holder(events, runs, waitPeriods, handoffSpans, state);
  const evaluations = events.filter((e) => e.event === "evaluation");
  const time = timeBreakdown(events, runs, waitPeriods, handoffSpans, hold, state, now);
  const changed = Object.values(state.repos || {}).filter((r) => r && r.role === "change").length;
  // number each return on the timeline; older records get one in place of their resume
  for (const r of back) {
    const e = events.find((x) => x.event === "ticket_reopened" && x.ts === r.ts && x.round == null);
    if (e) e.round = r.round;
    else events.push({ ts: r.ts, event: "ticket_reopened", round: r.round, reason: null, derived: true });
  }
  events.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
  const tokensByStage = {};
  for (const [stage, tokens] of Object.entries(metrics.tokens_by_stage || {})) {
    const sum = (tokensByStage[stageKey(stage)] = tokensByStage[stageKey(stage)] || {});
    for (const [k, v] of Object.entries(tokens || {})) if (typeof v === "number") sum[k] = (sum[k] || 0) + v;
  }

  let files = [];
  try {
    files = fs.readdirSync(dir).filter((f) => !RECORD_FILES.has(f)).sort();
  } catch {
    /* unreadable folder */
  }

  return {
    id,
    url: jira.url || state.jira_url || null,
    title: jira.title || null,
    issue_type: jira.issue_type || null,
    epic: jira.epic || null,
    sprint: jira.sprint || null,
    assignee: jira.assignee || null,
    work_type: state.work_type || null,
    track: state.track || null,
    status: state.status || "UNKNOWN",
    holder: hold,
    round: back.length + 1,
    next_action: state.next_action || null,
    blocked_on: state.blocked_on || null,
    customer_name: jira.customer_name || (state.customer_name ? [state.customer_name] : []),
    labels: jira.labels || [],
    ...devTime(jira),
    created_at: state.created_at || (events[0] && events[0].ts) || null,
    updated_at: state.updated_at || (events.length ? events[events.length - 1].ts : null),
    iteration: state.iteration ?? 0,
    max_iterations: state.max_iterations ?? (state.track === "light" ? 1 : 2), // evaluation rounds (harness 0.6+)
    flow: state.flow || null,
    source_branch: state.source_branch || null,
    branch: state.branch || null,
    repos: Object.entries(state.repos || {}).map(([name, info]) => ({ name, role: (info && info.role) || null })),
    context_repos: state.context_repos || [],
    prs: state.prs || [],
    pr_targets: state.pr_targets || [],
    human_confirmations: state.human_confirmations || [],
    decisions: parseDecisions(path.join(dir, "decisions.md")),
    evaluations: evaluations.map((e, i) => ({
      ts: e.ts, iteration: e.iteration, verdict: e.verdict, blocking: e.blocking || 0, non_blocking: e.non_blocking || 0,
      findings: parseFindings(path.join(dir, `evaluation-${e.iteration || i + 1}.md`)),
    })),
    stages: runs,
    sprints,
    links: Array.isArray(jira.links) ? jira.links.filter((l) => l && l.key) : [],
    waits: waitPeriods,
    working_seconds: runs.reduce((a, r) => a + r.seconds, 0),
    waiting_seconds: waitPeriods.reduce((a, w) => a + w.seconds, 0),
    events,
    files,
    tokens: metrics.tokens || null,
    tokens_by_stage: tokensByStage,
    turns: metrics.turns || 0,
    sessions: Object.keys(metrics.sessions || {}).length || (state.sessions || []).length,
    time: time.totals,
    time_segments: time.segments,
    elapsed_seconds: time.elapsed,
    resolved_without_code: state.status === "DONE" && changed === 0 && !(state.prs || []).length,
    has_metrics: Boolean(metrics.tokens),
  };
}

/** Writes dashboard/dist/costs.json from each ticket's committed metrics.json; skipped without prices.json. */
function writeCosts(tickets, now) {
  const prices = readJson(path.join(__dirname, "prices.json"), null);
  if (!prices || !prices.models || !prices.models[prices.default_model]) return null;
  const rows = tickets.map((t) => {
    const c = costs(readJson(path.join(TICKETS, t.id, "metrics.json"), {}), prices);
    return { ticket: t.id, usd: round(c.total), by_stage_usd: Object.fromEntries(Object.entries(c.byStage).map(([k, v]) => [k, round(v)])), unpriced_models: c.unpriced };
  });
  const report = {
    generated_at: now,
    note: "API-equivalent: what the recorded tokens would cost at list API prices. The team uses a Claude subscription, so this is not a bill, and it is never shown on the dashboard page.",
    prices_as_of: prices.as_of,
    total_usd: round(rows.reduce((a, r) => a + r.usd, 0)),
    tickets: rows,
  };
  fs.writeFileSync(path.join(OUT_DIR, "costs.json"), JSON.stringify(report, null, 2) + "\n");
  return report;
}

const round = (v) => Math.round(v * 100) / 100;

/**
 * Ties tickets the brain holds to each other through their Jira links. A Bug started after
 * the ticket it links to is recorded as a defect of it (and listed among that ticket's
 * defects); any other link between two harness tickets is shown as related.
 */
function linkTickets(tickets) {
  const byId = new Map(tickets.map((t) => [t.id, t]));
  for (const t of tickets) { t.defect_of = []; t.defects = []; t.related = []; }
  for (const t of tickets) {
    for (const l of t.links) {
      const other = byId.get(l.key);
      if (!other || other === t) continue;
      const brief = (x) => ({ id: x.id, title: x.title, lane: x.holder.lane, who: x.holder.who });
      if (t.issue_type === "Bug" && (other.created_at || "") < (t.created_at || "")) {
        if (!t.defect_of.some((x) => x.id === other.id)) t.defect_of.push(brief(other));
        if (!other.defects.some((x) => x.id === t.id)) other.defects.push(brief(t));
      } else if (!t.related.some((x) => x.id === other.id) && !t.defects.some((x) => x.id === other.id)) {
        t.related.push(brief(other));
      }
    }
  }
}

// --------------------------------------------------------------------- main

function main() {
  const template = fs.readFileSync(path.join(__dirname, "template.html"), "utf8");
  const marker = "__BRAIN_DATA__";
  if (!template.includes(marker)) throw new Error("template.html has no " + marker + " placeholder");

  const now = new Date().toISOString();
  let dirs = [];
  try {
    dirs = fs.readdirSync(TICKETS, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => path.join(TICKETS, d.name));
  } catch {
    /* no tickets yet */
  }
  const tickets = dirs.map((d) => buildTicket(d, now));
  const broken = tickets.filter((t) => t.broken).map((t) => t.id);
  const good = tickets.filter((t) => !t.broken).sort((a, b) => ((a.updated_at || "") < (b.updated_at || "") ? 1 : -1));
  linkTickets(good);

  const data = {
    generated_at: now,
    labels: LABELS,
    tickets: good,
    unreadable: broken,
  };
  // Embedded in a <script type="application/json">; escape "<" so no content can close it.
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const out = path.join(OUT_DIR, "index.html");
  fs.writeFileSync(out, template.replace(marker, () => json));

  const hours = good.reduce((a, t) => a + t.working_seconds, 0) / 3600;
  const costReport = writeCosts(good, now);
  console.log(out);
  console.log(
    `${good.length} ticket(s)` +
      (broken.length ? `, ${broken.length} unreadable (${broken.join(", ")})` : "") +
      `, ${hours.toFixed(1)} h of AI working time` +
      (costReport ? `; API-equivalent $${costReport.total_usd.toFixed(2)} in dashboard/dist/costs.json (not on the page)` : "")
  );
}

try {
  main();
} catch (err) {
  console.error("dashboard build failed: " + (err && err.message ? err.message : err));
  process.exit(1);
}
