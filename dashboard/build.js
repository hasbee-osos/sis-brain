#!/usr/bin/env node
/**
 * Builds the leadership dashboard from the brain.
 *
 *   node dashboard/build.js
 *
 * Reads only committed files (tickets/*, dashboard/prices.json), so every
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
const WORKING_STATUSES = new Set(["PLANNING", "IMPLEMENTING", "EVALUATING", "ANALYZING", "DESIGNING"]); // ANALYZING and DESIGNING: tickets recorded before v0.4

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
      runs.push({ stage: e.stage, iteration: e.iteration ?? start.iteration ?? null, start: start.ts, end: e.ts, seconds: seconds(start.ts, e.ts) });
    }
  }
  for (const start of open.values()) {
    runs.push({ stage: start.stage, iteration: start.iteration ?? null, start: start.ts, end: null, seconds: 0 });
  }
  return runs;
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

/**
 * Splits a ticket's whole elapsed time, from start to close (or now), into what was
 * happening: the AI working a stage, waiting on QA or an SME for packet answers, waiting
 * on the developer (their questions, confirmations, or a run they paused), or idle
 * (nobody working and no answer awaited). A gap that ends in a human confirmation counts
 * as waiting on the developer; after the last event, the ticket's status decides.
 */
const TIME_KINDS = ["working", "qa", "sme", "developer", "idle"];

function timeBreakdown(events, runs, waitPeriods, state, now) {
  const closed = events.find((e) => e.event === "ticket_closed");
  const startTs = state.created_at || (events[0] && events[0].ts);
  const endTs = state.status === "DONE" ? (closed ? closed.ts : state.updated_at) : now;
  const start = Date.parse(startTs);
  const end = Date.parse(endTs);
  const totals = Object.fromEntries(TIME_KINDS.map((k) => [k, 0]));
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return { totals, segments: [], elapsed: 0 };

  const span = (a, b) => [Date.parse(a), b ? Date.parse(b) : end];
  const work = runs.filter((r) => r.end).map((r) => span(r.start, r.end));
  const waitsBy = (aud) => waitPeriods.filter((w) => aud.includes(w.audience)).map((w) => span(w.start, w.end));
  const qa = waitsBy(["qa"]), sme = waitsBy(["sme"]), dev = waitsBy(["developer", null, "unknown"]);
  const inside = (list, t) => list.some(([a, b]) => t > a && t < b);
  const confirmAt = new Set(events.filter((e) => e.event === "human_confirmed").map((e) => Date.parse(e.ts)));
  const lastEvent = events.length ? Date.parse(events[events.length - 1].ts) : start;
  const tailKind = ["AWAITING_REPO_CONFIRMATION", "NEEDS_INPUT", "ESCALATED"].includes(state.status) || /^PR_STAGE_/.test(state.status || "") ? "developer" : "idle";

  const cuts = new Set([start, end]);
  for (const e of events) { const t = Date.parse(e.ts); if (t > start && t < end) cuts.add(t); }
  for (const [a, b] of [...work, ...qa, ...sme, ...dev]) for (const t of [a, b]) if (t > start && t < end) cuts.add(t);
  const points = [...cuts].sort((a, b) => a - b);

  const segments = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1], mid = (a + b) / 2;
    let kind;
    if (inside(work, mid)) kind = "working";
    else if (inside(qa, mid)) kind = "qa";
    else if (inside(sme, mid)) kind = "sme";
    else if (inside(dev, mid)) kind = "developer";
    else if (a >= lastEvent) kind = tailKind;
    else kind = confirmAt.has(b) ? "developer" : "idle";
    const secs = (b - a) / 1000;
    totals[kind] += secs;
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
    byStage[stage] = priceTokens(tokens, fallback) * ratio;
  }
  return { total, byStage, unpriced };
}

// ------------------------------------------------------------------- ticket

function phaseOf(status) {
  if (status === "DONE") return "done";
  if (status === "ESCALATED") return "escalated";
  if (WORKING_STATUSES.has(status)) return "working";
  return "waiting";
}

function waitingOn(status, openWait) {
  if (openWait) return openWait.audience;
  if (status === "AWAITING_REPO_CONFIRMATION") return "developer";
  if (/^PR_STAGE_/.test(status || "")) return "reviewers";
  return null;
}

function buildTicket(dir, now) {
  const id = path.basename(dir);
  const state = readJson(path.join(dir, "state.json"), null);
  if (!state) return { id, broken: true };
  const events = readJsonl(path.join(dir, "journal.jsonl")).filter((e) => e && e.ts && e.event);
  events.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
  const metrics = readJson(path.join(dir, "metrics.json"), {});
  const jira = state.jira || {};
  const runs = stageRuns(events);
  const waitPeriods = waits(events, state, now);
  const openWait = waitPeriods.find((w) => !w.end) || null;
  const evaluations = events.filter((e) => e.event === "evaluation");
  const time = timeBreakdown(events, runs, waitPeriods, state, now);
  const changed = Object.values(state.repos || {}).filter((r) => r && r.role === "change").length;
  const lastStageEnd = [...events].reverse().find((e) => e.event === "stage_end");

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
    phase: phaseOf(state.status),
    next_action: state.next_action || null,
    blocked_on: state.blocked_on || null,
    waiting_on: waitingOn(state.status, openWait),
    waiting_since: openWait ? openWait.start : state.status === "AWAITING_REPO_CONFIRMATION" && lastStageEnd ? lastStageEnd.ts : null,
    estimate: jira.estimate || null,
    estimate_hours: estimateHours(jira.estimate),
    created_at: state.created_at || (events[0] && events[0].ts) || null,
    updated_at: state.updated_at || (events.length ? events[events.length - 1].ts : null),
    iteration: state.iteration ?? 0,
    max_iterations: state.max_iterations ?? (state.track === "light" ? 2 : 3),
    flow: state.flow || null,
    source_branch: state.source_branch || null,
    branch: state.branch || null,
    repos: Object.entries(state.repos || {}).map(([name, info]) => ({ name, role: (info && info.role) || null })),
    context_repos: state.context_repos || [],
    prs: state.prs || [],
    pr_targets: state.pr_targets || [],
    human_confirmations: state.human_confirmations || [],
    decisions: parseDecisions(path.join(dir, "decisions.md")),
    evaluations: evaluations.map((e) => ({ ts: e.ts, iteration: e.iteration, verdict: e.verdict, blocking: e.blocking || 0, non_blocking: e.non_blocking || 0 })),
    stages: runs,
    waits: waitPeriods,
    working_seconds: runs.reduce((a, r) => a + r.seconds, 0),
    waiting_seconds: waitPeriods.reduce((a, w) => a + w.seconds, 0),
    events,
    files,
    tokens: metrics.tokens || null,
    tokens_by_stage: metrics.tokens_by_stage || {},
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

  const data = {
    generated_at: now,
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
