#!/usr/bin/env node
/**
 * Works out how far a ticket's change reaches into the product and writes it to the
 * ticket folder as blast.json, which the dashboard draws as a wheel. A file of its own,
 * not a state.json field, so agents reading the resume point don't carry it.
 *
 *   node sis-brain/codebase/blast.js <TICKET-ID>
 *
 * Reads what the ticket actually changed - the diff of its branch against its source
 * branch in every changed repo - and places each file with the generated indexes:
 *   changed  screens whose component (or an embedded component) changed, APIs whose
 *            controller, frontend service or backing class changed, tables whose entity changed
 *   reached  other screens that call a changed API
 * Every screen in the map is counted by product area (first route segment) and sub-area
 * (second), so the wheel is drawn to scale. Git only, never a checkout; no dependencies.
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
const MAX_NAMES = 20;
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
const isTest = (f) => /\.spec\.ts$|\/src\/test\//.test(f);

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
  const changedScreens = new Set();
  const changedApis = new Set();
  const tables = new Set();
  const unplaced = {};
  let migrations = 0;
  const miss = (what) => { unplaced[what] = (unplaced[what] || 0) + 1; };

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

  for (const c of changed) {
    if (isTest(c.file)) continue;
    let key = c.repo + "/" + c.file;
    const ts = key.replace(/\.(html|scss|css)$/, ".ts");
    if (screens.has(ts) || components.has(ts)) key = ts;
    const kind = kinds[c.repo];

    if (screens.has(key)) { changedScreens.add(key); continue; }
    if (components.has(key)) {
      const hosts = screensRendering(c, components.get(key), new Set());
      if (hosts.length) hosts.forEach((h) => changedScreens.add(h)); else miss("shared components");
      continue;
    }
    if (entities.has(key)) { tables.add(entities.get(key)); continue; }
    if (/\/db\/changelog\//.test(c.file)) { migrations++; continue; }
    const direct = apiFor(key);
    if (direct.length) { direct.forEach((a) => changedApis.add(a)); continue; }

    if (kind === "spring" && c.file.endsWith(".java")) {
      // a service or helper: the APIs are the controllers that use it
      const cls = path.basename(c.file, ".java");
      const names = [...new Set([cls, cls.replace(/Impl$/, "")])];
      const hits = git(c.dir, ["grep", "-l", "-w", ...names.flatMap((n) => ["-e", n]), c.head, "--", "src/main/java"]) || "";
      const via = hits.split("\n").filter(Boolean).map((l) => c.repo + "/" + l.slice(l.indexOf(":") + 1)).filter((k) => controllers.has(k));
      if (via.length) { via.forEach((k) => apiFor(k).forEach((a) => changedApis.add(a))); continue; }
      miss("backend logic");
      continue;
    }
    if (kind === "angular" && /\/services?\//.test(c.file)) { miss("frontend services"); continue; }
    miss(kind === "angular" ? "shared frontend code" : "configuration and other files");
  }

  // ---- screens the change reaches through a changed API
  const reached = new Set();
  for (const [key, s] of screens) {
    if (changedScreens.has(key)) continue;
    for (const p of s.paths) if (changedApis.has(p)) { reached.add(key); break; }
  }

  // ---- the whole product by area, with what the change touches
  const areas = {};
  for (const [key, s] of screens) {
    const a = (areas[s.area] = areas[s.area] || { screens: 0, subs: {} });
    const sub = (a.subs[s.sub] = a.subs[s.sub] || { screens: 0 });
    a.screens++;
    sub.screens++;
    const ring = changedScreens.has(key) ? "changed" : reached.has(key) ? "reached" : null;
    if (!ring) continue;
    sub[ring] = sub[ring] || [];
    if (sub[ring].length < MAX_NAMES && sub[ring].indexOf(s.name) < 0) sub[ring].push(s.name);
    sub[ring + "_n"] = (sub[ring + "_n"] || 0) + 1;
  }

  Object.assign(blast, {
    screens_total: screens.size,
    areas,
    apis: [...changedApis].sort(),
    tables: [...tables].sort(),
    migrations,
    unplaced: Object.entries(unplaced).map(([what, files]) => ({ what, files })),
  });
  save(folder, blast);
}

function save(folder, blast) {
  fs.writeFileSync(path.join(folder, "blast.json"), JSON.stringify(blast) + "\n");
  const s = Object.values(blast.areas || {}).flatMap((a) => Object.values(a.subs));
  const n = (k) => s.reduce((t, x) => t + (x[k] || 0), 0);
  console.log(`blast: ${blast.files} files in ${blast.repos} repos; ${n("changed_n")} screens changed, ${n("reached_n")} reached; ` +
    `${(blast.apis || []).length} APIs, ${(blast.tables || []).length} tables` + (blast.map_built_at ? "" : " (no codebase map)"));
}

main();
