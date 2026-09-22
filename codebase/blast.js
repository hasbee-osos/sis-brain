#!/usr/bin/env node
/**
 * Works out how far a ticket's change reaches into the product and writes it to the
 * ticket folder as blast.json, which the dashboard draws as rings. A file of its own,
 * not a state.json field, so agents reading the resume point don't carry it.
 *
 *   node sis-brain/codebase/blast.js <TICKET-ID>
 *
 * Reads what the ticket actually changed - the diff of its branch against its source
 * branch in every changed repo - and places each file with the generated indexes:
 *   ring 1   what the ticket edited: screens (including screens that embed a changed
 *            component), tables of changed entities, and APIs whose controller, frontend
 *            service or service class changed
 *   ring 2   other screens that call an API the change reaches, each with the ring 1
 *            items it is reached through (`via`); a changed table reaches the APIs that use it
 * Screens are named by menu label and grouped by product area (first route segment).
 * Git only, never a checkout; no dependencies.
 * /work runs it just before recording "PRs prepared" (harness skills/brain/SKILL.md).
 */
"use strict";

const fs = require("fs");
const path = require("path");
const cp = require("child_process");

const HERE = __dirname;
const BRAIN = path.resolve(HERE, "..");
const WORKSPACE = path.resolve(HERE, "..", "..");
const GEN = path.join(HERE, "generated");
const MAX_RING2 = 60; // screens kept by name; ring2_total still counts all
const MAX_FRONTIER = 80; // classes followed per step, so a widely used class can't fan out without end
// route segments that name an action, not a screen: "…/assessment-planning/view" is "Assessment Planning"
const GENERIC = /^(view|list|add|edit|add-edit|add-view-edit|details?|create|new|index|manage|main)$/;

function git(repoDir, args) {
  try {
    return cp.execFileSync("git", ["-C", repoDir, ...args], { maxBuffer: 1 << 30, stdio: ["ignore", "pipe", "ignore"] }).toString("utf8");
  } catch (e) {
    return null;
  }
}

/** Rows of the first markdown table in a generated index, as arrays of cell text. */
function readTable(name) {
  const file = path.join(GEN, name);
  if (!fs.existsSync(file)) return [];
  const rows = [];
  let inTable = false;
  for (const line of fs.readFileSync(file, "utf8").replace(/\r/g, "").split("\n")) {
    if (!line.startsWith("|")) { if (inTable) break; continue; }
    if (/^\|-/.test(line)) { inTable = true; continue; }
    if (!inTable) continue;
    rows.push(line.slice(1, -1).split(/(?<!\\)\|/).map((c) => {
      const v = c.trim().replace(/\\\|/g, "|");
      return v === "—" ? "" : v;
    }));
  }
  return rows;
}

/** `CourseService* (/courses), X (/y)` → ["courses", "y"] */
const contextPaths = (cell) => [...(cell || "").matchAll(/\(\/?([^)]+)\)/g)].map((m) => m[1]);

const humanise = (seg) => seg.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const isTest = (f) => /\.spec\.ts$|(^|\/)src\/test\//.test(f);

/** The commit that holds the ticket's work in a repo: its branch, else the commit the gate accepted. */
function headOf(dir, state, info) {
  const candidates = [state.branch, state.branch && "origin/" + state.branch, info.final_head, info.evaluated_head].filter(Boolean);
  return candidates.find((c) => git(dir, ["rev-parse", "--verify", "--quiet", c + "^{commit}"])) || null;
}

function main() {
  const id = process.argv[2];
  if (!id) { console.error("usage: node codebase/blast.js <TICKET-ID>"); process.exit(2); }
  const folder = path.join(BRAIN, "tickets", id);
  const state = JSON.parse(fs.readFileSync(path.join(folder, "state.json"), "utf8"));
  const kinds = {};
  for (const r of JSON.parse(fs.readFileSync(path.join(HERE, "repos.json"), "utf8")).repos) kinds[r.repo] = r.kind;

  // ---- what the ticket changed
  const changed = []; // { repo, file, head }
  const missing = [];
  for (const [repo, info] of Object.entries(state.repos || {})) {
    if (info.role && info.role !== "change") continue;
    const dir = path.join(WORKSPACE, repo);
    const head = fs.existsSync(dir) ? headOf(dir, state, info) : null;
    const base = "origin/" + state.source_branch;
    const diff = head && git(dir, ["diff", "--name-only", base + "..." + head]);
    if (diff == null) { missing.push(repo); continue; }
    diff.split("\n").filter(Boolean).forEach((file) => changed.push({ repo, file, head, dir }));
  }
  const blast = {
    schema: 2,
    at: new Date().toISOString(),
    map_built_at: null,
    files: changed.length,
    repos: new Set(changed.map((c) => c.repo)).size,
  };
  if (missing.length) blast.missing_repos = missing;

  const stamp = path.join(GEN, "stamp.json");
  if (!fs.existsSync(stamp) || !changed.length) return save(folder, blast);
  blast.map_built_at = JSON.parse(fs.readFileSync(stamp, "utf8")).built_at;

  // ---- the map
  const screens = new Map(); // "<repo>/<file>" → { name, area, sub, paths }
  for (const [label, route, , file, services] of readTable("screens.md")) {
    const segs = route.split("/").filter(Boolean);
    if (!segs.length) continue; // the layout shell, not a screen
    const s = screens.get(file) || {
      name: label ? label.split(";")[0].replace(/\s*\([^)]*\)\s*$/, "").trim()
                  : humanise(segs.filter((x) => !x.startsWith(":") && !GENERIC.test(x)).pop() || segs[0]),
      area: segs[0], sub: segs[1] && !segs[1].startsWith(":") ? segs[1] : "main", paths: new Set(),
    };
    contextPaths(services).forEach((p) => s.paths.add(p));
    screens.set(file, s);
  }
  const api = readTable("api.md").map(([ctx, , feFile, beFile]) => ({ ctx, feFile, beFile }));
  const components = new Map(); // "<repo>/<file>" → selector
  const controllers = new Map(); // "<repo>/<file>" → shortest endpoint path
  const entities = new Map(); // "<repo>/<file>" → table
  for (const [repo, kind] of Object.entries(kinds)) {
    if (kind === "angular") readTable(repo + ".components.md").forEach(([sel, , file]) => components.set(repo + "/" + file, sel));
    if (kind === "spring") {
      readTable(repo + ".endpoints.md").forEach(([, p, , fileLine]) => {
        const key = repo + "/" + fileLine.replace(/:\d+$/, "");
        const short = p.split("/{")[0];
        if (!controllers.has(key) || short.length < controllers.get(key).length) controllers.set(key, short);
      });
      readTable(repo + ".tables.md").forEach(([table, , file]) => entities.set(repo + "/" + file, table));
    }
  }

  // ---- place each changed file
  // ring 1: what the ticket edited. apiVia: API context path → the ring 1 names it is reached through
  const ring1 = new Map(); // "<kind>:<name>" → { kind, name, area? }
  const changedScreens = new Set();
  const apiVia = new Map();
  const unplaced = {};
  let migrations = 0;
  const miss = (what) => { unplaced[what] = (unplaced[what] || 0) + 1; };
  const edit = (kind, name, area) => { if (!ring1.has(kind + ":" + name)) ring1.set(kind + ":" + name, area ? { kind, name, area } : { kind, name }); };
  const reach = (ctx, via) => { if (!apiVia.has(ctx)) apiVia.set(ctx, new Set()); apiVia.get(ctx).add(via); };
  const editApi = (ctx) => { edit("api", ctx); reach(ctx, ctx); };
  const editScreen = (key) => { changedScreens.add(key); edit("screen", screens.get(key).name, screens.get(key).area); };

  // screens that render a component, following <tag> use up through parent components
  function screensRendering(c, selector, seen) {
    if (seen.has(selector)) return [];
    seen.add(selector);
    const hits = git(c.dir, ["grep", "-l", "-F", "<" + selector, c.head, "--", "*.html"]) || "";
    const out = [];
    for (const line of hits.split("\n").filter(Boolean)) {
      const ts = c.repo + "/" + line.slice(line.indexOf(":") + 1).replace(/\.html$/, ".ts");
      if (screens.has(ts)) out.push(ts);
      else if (components.has(ts)) out.push(...screensRendering(c, components.get(ts), seen));
    }
    return out;
  }

  const apiFor = (key) => {
    const byApi = api.filter((a) => a.beFile === key || a.feFile === key).map((a) => a.ctx);
    return byApi.length ? byApi : controllers.has(key) ? [controllers.get(key).replace(/^\/api\/v\d+\//, "")] : [];
  };

  // controllers that use a class, following uses up to `depth` classes away (entity → repository
  // → service → controller); a class is also known by its interface name without "Impl"
  function controllersUsing(c, cls, depth) {
    const found = new Set();
    const seen = new Set();
    let frontier = [cls];
    for (let d = 0; d < depth && frontier.length; d++) {
      const names = [...new Set(frontier.flatMap((n) => [n, n.replace(/Impl$/, "")]))].filter((n) => !seen.has(n));
      names.forEach((n) => seen.add(n));
      if (!names.length) break;
      const hits = git(c.dir, ["grep", "-l", "-w", ...names.flatMap((n) => ["-e", n]), c.head, "--", "src/main/java"]) || "";
      frontier = [];
      for (const line of hits.split("\n").filter(Boolean)) {
        const k = c.repo + "/" + line.slice(line.indexOf(":") + 1);
        if (controllers.has(k)) found.add(k);
        else frontier.push(path.basename(k, ".java"));
      }
      frontier = frontier.slice(0, MAX_FRONTIER);
    }
    return [...found];
  }

  for (const c of changed) {
    if (isTest(c.file)) continue;
    let key = c.repo + "/" + c.file;
    const ts = key.replace(/\.(html|scss|css)$/, ".ts");
    if (screens.has(ts) || components.has(ts)) key = ts;
    const kind = kinds[c.repo];

    if (screens.has(key)) { editScreen(key); continue; }
    if (components.has(key)) {
      const hosts = screensRendering(c, components.get(key), new Set());
      if (hosts.length) hosts.forEach(editScreen); else miss("shared components");
      continue;
    }
    if (entities.has(key)) {
      // the table is edited; the APIs that read it are only the way its screens are reached
      const table = entities.get(key);
      edit("table", table);
      controllersUsing(c, path.basename(c.file, ".java"), 2).forEach((k) => apiFor(k).forEach((a) => reach(a, table)));
      continue;
    }
    if (/\/db\/changelog\//.test(c.file)) { migrations++; continue; }
    const direct = apiFor(key);
    if (direct.length) { direct.forEach(editApi); continue; }

    if (kind === "spring" && c.file.endsWith(".java")) {
      // a service or helper: the APIs of the controllers that use it behave differently
      const via = controllersUsing(c, path.basename(c.file, ".java"), 2);
      if (via.length) { via.forEach((k) => apiFor(k).forEach(editApi)); continue; }
      miss("backend logic");
      continue;
    }
    if (kind === "angular" && /\/services?\//.test(c.file)) { miss("frontend services"); continue; }
    miss(kind === "angular" ? "shared frontend code" : "configuration and other files");
  }

  // ---- ring 2: other screens that call an API the change reaches
  const ring2 = new Map(); // "<area>:<name>" → { name, area, via }
  for (const [key, s] of screens) {
    if (changedScreens.has(key)) continue;
    const via = new Set();
    for (const p of s.paths) if (apiVia.has(p)) apiVia.get(p).forEach((v) => via.add(v));
    if (!via.size) continue;
    const id = s.area + ":" + s.name;
    const hit = ring2.get(id) || { name: s.name, area: s.area, via: [] };
    via.forEach((v) => { if (hit.via.indexOf(v) < 0) hit.via.push(v); });
    ring2.set(id, hit);
  }

  Object.assign(blast, {
    screens_total: screens.size,
    ring1: [...ring1.values()],
    ring2: [...ring2.values()].slice(0, MAX_RING2),
    ring2_total: ring2.size,
    migrations,
    unplaced: Object.entries(unplaced).map(([what, files]) => ({ what, files })),
  });
  save(folder, blast);
}

function save(folder, blast) {
  fs.writeFileSync(path.join(folder, "blast.json"), JSON.stringify(blast) + "\n");
  const kinds = {};
  (blast.ring1 || []).forEach((x) => { kinds[x.kind] = (kinds[x.kind] || 0) + 1; });
  console.log(`blast: ${blast.files} files in ${blast.repos} repos; edits ` +
    (Object.entries(kinds).map(([k, n]) => n + " " + k + (n === 1 ? "" : "s")).join(", ") || "nothing placeable") +
    `; ${blast.ring2_total || 0} screens depend on it` + (blast.map_built_at ? "" : " (no codebase map)"));
}

main();
