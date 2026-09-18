#!/usr/bin/env node
/**
 * Builds the leadership dashboard from the brain.
 *
 *   node dashboard/build.js
 *
 * Reads only committed files (tickets/*, index.jsonl, dashboard/prices.json), so every
 * clone builds the same page. Writes dashboard/dist/index.html: template.html with the
 * data embedded. Node only, no dependencies.
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

/** Periods spent waiting on people for answers, from input_requested / input_received. */
function waits(events, state, now) {
  const periods = [];
  let open = null;
  for (const e of events) {
    if (e.event === "input_requested") open = { audience: e.audience || null, packet: e.packet || null, start: e.ts, end: null };
    else if (e.event === "input_received" && open) {
      open.end = e.ts;
      periods.push(open);
      open = null;
    }
  }
  // Records written before input_requested existed: infer an open wait from state.
  if (!open && state.status === "NEEDS_INPUT" && !periods.length) {
    const artifacts = state.artifacts || {};
    const audience = artifacts.sme_packet ? "sme" : artifacts.qa_packet ? "qa" : "developer";
    const lastEnd = [...events].reverse().find((e) => e.event === "stage_end");
    open = { audience, packet: artifacts.sme_packet || artifacts.qa_packet || null, start: (lastEnd && lastEnd.ts) || state.updated_at, end: null, inferred: true };
  }
  if (open) periods.push(open);
  return periods.map((p) => ({ ...p, seconds: seconds(p.start, p.end || now) }));
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

function buildTicket(dir, prices, now) {
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
  const cost = costs(metrics, prices);
  const evaluations = events.filter((e) => e.event === "evaluation");

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
    waiting_since: openWait ? openWait.start : null,
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
    cost_usd: cost.total,
    cost_by_stage: cost.byStage,
    unpriced_models: cost.unpriced,
    has_metrics: Boolean(metrics.tokens),
  };
}

// --------------------------------------------------------------------- main

function main() {
  const prices = readJson(path.join(__dirname, "prices.json"), null);
  if (!prices || !prices.models || !prices.models[prices.default_model]) {
    throw new Error("dashboard/prices.json is missing or has no price for its default_model");
  }
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
  const tickets = dirs.map((d) => buildTicket(d, prices, now));
  const broken = tickets.filter((t) => t.broken).map((t) => t.id);
  const good = tickets.filter((t) => !t.broken).sort((a, b) => ((a.updated_at || "") < (b.updated_at || "") ? 1 : -1));

  const data = {
    generated_at: now,
    price_note: prices.note,
    price_as_of: prices.as_of,
    tickets: good,
    unreadable: broken,
  };
  // Embedded in a <script type="application/json">; escape "<" so no content can close it.
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const out = path.join(OUT_DIR, "index.html");
  fs.writeFileSync(out, template.replace(marker, () => json));

  const cost = good.reduce((a, t) => a + t.cost_usd, 0);
  console.log(out);
  console.log(
    `${good.length} ticket(s)` +
      (broken.length ? `, ${broken.length} unreadable (${broken.join(", ")})` : "") +
      `, API-equivalent cost $${cost.toFixed(2)}`
  );
}

try {
  main();
} catch (err) {
  console.error("dashboard build failed: " + (err && err.message ? err.message : err));
  process.exit(1);
}
