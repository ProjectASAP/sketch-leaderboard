"use strict";
/* sketch-bench profiles — pure client-side viewer.
 * Reads a sketch-bench JSON/JSONL profile dump at runtime (file picker,
 * drag-and-drop, ?src= URL, or auto-fetch) and flattens each nested record
 * into a spreadsheet row. No build step, no server required. */

/* ------------------------------------------------------------ data model */
let DATA = [];          // flattened rows
let SOURCE = "";        // human label of the loaded source
let MAXI = 1, MAXQ = 1; // per-load maxima for the inline bars

/* categorical facets: multi-select within a group (OR), across groups (AND). */
const FACETS = [
  { key: "sketch",    label: "Sketch" },
  { key: "workload",  label: "Workload" },
  { key: "impl",      label: "Impl" },
  { key: "acc_label", label: "Metric" }
];
/* numeric statistic filters: min/max range per metric. scale: input -> row units. */
const NUMF = [
  { key: "insert_mops",  label: "Insert M/s", scale: 1 },
  { key: "query_mops",   label: "Query M/s",  scale: 1 },
  { key: "memory_bytes", label: "Memory KB",  scale: 1024 },
  { key: "accuracy",     label: "Accuracy",   scale: 1 }
];
const VS = {
  all:    { c: "sketch",       d: "asc" },
  insert: { c: "insert_mops",  d: "desc" },
  query:  { c: "query_mops",   d: "desc" },
  memory: { c: "memory_bytes", d: "asc" }
};
const SKETCH_COLOR = { cms: "#5ad1ff", countsketch: "#7c8cff", hll: "#5be9b9", kll: "#ffd166" };

let S = {
  view: "all", col: "sketch", dir: "asc", q: "",
  sel: { sketch: new Set(), workload: new Set(), impl: new Set(), acc_label: new Set() },
  num: {
    insert_mops:  { min: null, max: null },
    query_mops:   { min: null, max: null },
    memory_bytes: { min: null, max: null },
    accuracy:     { min: null, max: null }
  }
};

/* ------------------------------------------------------------ parsing
 * Mirrors demo/src/profiles.rs so the page consumes raw run_profiles output. */
function num(x) { return typeof x === "number" && isFinite(x) ? x : null; }

function extractConfig(v) {
  const p = v.sketch_config && v.sketch_config.params;
  if (!p || typeof p !== "object" || Array.isArray(p)) return "—";
  const keys = Object.keys(p);
  if (!keys.length) return "—";
  return keys.map(k => k + "=" + p[k]).join(", ");
}

function extractAccuracy(sketch, bench) {
  const acc = bench && bench.accuracy;
  if (!acc || typeof acc !== "object") return [null, "—"];
  if (sketch === "hll") return [num(acc.relative_error), "rel-err"];
  if (sketch === "kll") return [num(acc.mean_rank_err), "mean-rank-err"];
  if (sketch === "cms" || sketch === "countsketch")
    return [num(acc.relative_error_mean), "rel-err-mean"];
  const v = num(acc.relative_error);
  const w = v !== null ? v : (num(acc.mean_rank_err) !== null ? num(acc.mean_rank_err) : num(acc.relative_error_mean));
  return [w, "accuracy"];
}

function fmtMemory(bytes) {
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + " MB";
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + " KB";
  return bytes + " B";
}

function toRow(v) {
  if (!v || typeof v.sketch !== "string" || typeof v.impl !== "string") return null;
  const bench = v.bench || {};
  const wall = bench.wall_time_ms && num(bench.wall_time_ms.mean);
  if (wall === null || wall <= 0) return null;            // need wall time for insert throughput
  const size = (v.workload && num(v.workload.size)) || 1000000;
  const insert = size / (wall / 1000) / 1e6;
  const qt = bench.query_throughput_items_per_sec && num(bench.query_throughput_items_per_sec.mean);
  const memBytes = (bench.memory_bytes != null ? Number(bench.memory_bytes) : 0) || 0;
  const [accuracy, accLabel] = extractAccuracy(v.sketch, bench);
  return {
    sketch: v.sketch,
    impl: v.impl,
    config: extractConfig(v),
    workload: (v.workload && v.workload.shape) || "—",
    insert_mops: Math.round(insert * 100) / 100,
    query_mops: qt === null ? null : Math.round((qt / 1e6) * 100) / 100,
    memory_bytes: memBytes,
    memory_human: fmtMemory(memBytes),
    accuracy: accuracy,
    acc_label: accLabel
  };
}

/* Accepts a JSON array or newline-delimited JSON (JSONL). */
function parseRecords(text) {
  text = text.replace(/^﻿/, "");
  const trimmed = text.trim();
  if (trimmed.charAt(0) === "[") {
    try {
      const arr = JSON.parse(trimmed);
      if (Array.isArray(arr)) return arr;
    } catch (e) { /* fall through to line-by-line */ }
  }
  const recs = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) continue;
    try { recs.push(JSON.parse(t)); } catch (e) { /* skip malformed line */ }
  }
  return recs;
}

/* PowerShell Out-File emits UTF-16 LE w/ BOM; detect and decode accordingly. */
function decodeBuffer(buf) {
  const b = new Uint8Array(buf);
  let enc = "utf-8";
  if (b[0] === 0xFF && b[1] === 0xFE) enc = "utf-16le";
  else if (b[0] === 0xFE && b[1] === 0xFF) enc = "utf-16be";
  try { return new TextDecoder(enc).decode(buf); }
  catch (e) { return new TextDecoder("utf-8").decode(buf); }
}

/* ------------------------------------------------------------ helpers */
function cmp(a, b, d) {
  if (a === null && b === null) return 0;
  if (a === null) return 1;            // nulls always last
  if (b === null) return -1;
  if (typeof a === "string") return d === "asc" ? a.localeCompare(b) : b.localeCompare(a);
  return d === "asc" ? a - b : b - a;
}
function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
function implColor(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; }

function metricCell(v, max, cls) {
  if (v === null || v === undefined) return '<td class="r na">&mdash;</td>';
  const w = Math.max(2, Math.round((v / max) * 70));
  return '<td class="r"><div class="metric ' + cls + '"><span class="bar" style="width:' + w + 'px"></span>' +
         '<span class="val">' + v.toFixed(2) + "</span></div></td>";
}
function accCell(v) {
  if (v === null || v === undefined) return '<td class="r na">&mdash;</td>';
  return '<td class="r" style="font-variant-numeric:tabular-nums">' + v.toFixed(4) + "</td>";
}

/* ------------------------------------------------------------ build UI */
function buildFacets() {
  const host = document.getElementById("facets");
  host.innerHTML = "";
  FACETS.forEach(f => {
    const vals = [...new Set(DATA.map(r => r[f.key]))].sort();
    const row = document.createElement("div");
    row.className = "facet";
    row.innerHTML = '<span class="facet-label">' + f.label + "</span>";
    vals.forEach(v => {
      const chip = document.createElement("button");
      chip.className = "chip";
      chip.innerHTML = '<span class="dot"></span>' + esc(v);
      chip.addEventListener("click", () => {
        const set = S.sel[f.key];
        if (set.has(v)) set.delete(v); else set.add(v);
        chip.classList.toggle("on", set.has(v));
        render();
      });
      row.appendChild(chip);
    });
    host.appendChild(row);
  });
}

function buildStatFilters() {
  const host = document.getElementById("statbar");
  host.innerHTML = '<span class="facet-label">Stats</span>';
  NUMF.forEach(nf => {
    const g = document.createElement("div");
    g.className = "statf";
    g.innerHTML = '<span class="nm">' + nf.label + "</span>";
    ["min", "max"].forEach((bound, i) => {
      const inp = document.createElement("input");
      inp.type = "number"; inp.placeholder = bound; inp.step = "any";
      inp.addEventListener("input", () => {
        const val = inp.value.trim();
        S.num[nf.key][bound] = val === "" ? null : parseFloat(val);
        inp.classList.toggle("set", val !== "");
        render();
      });
      g.appendChild(inp);
      if (i === 0) { const s = document.createElement("span"); s.className = "sep"; s.textContent = "–"; g.appendChild(s); }
    });
    host.appendChild(g);
  });
}

/* ------------------------------------------------------------ render */
function render() {
  const q = S.q.trim().toLowerCase();
  let rows = DATA.filter(r => {
    for (const f of FACETS) { const set = S.sel[f.key]; if (set.size && !set.has(r[f.key])) return false; }
    for (const nf of NUMF) {
      const rng = S.num[nf.key], v = r[nf.key];
      if (rng.min !== null || rng.max !== null) {
        if (v === null || v === undefined) return false;
        if (rng.min !== null && v < rng.min * nf.scale) return false;
        if (rng.max !== null && v > rng.max * nf.scale) return false;
      }
    }
    if (S.view === "query" && r.query_mops === null) return false;
    if (q) {
      const hay = (r.sketch + " " + r.impl + " " + r.config + " " + r.workload + " " + r.acc_label).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  rows.sort((a, b) => cmp(a[S.col], b[S.col], S.dir));

  const perfView = S.view !== "all";
  document.getElementById("tb").innerHTML = rows.map((r, i) => {
    const sc = SKETCH_COLOR[r.sketch] || "#9aa8ff";
    const ih = implColor(r.impl);
    const best = perfView && i === 0;
    return '<tr class="' + (best ? "best" : "") + '">' +
      '<td><span class="sketch-tag" style="color:' + sc + '">' + (best ? '<span class="rankdot">★ </span>' : "") + esc(r.sketch) + "</span></td>" +
      '<td><span class="badge" style="color:hsl(' + ih + ',70%,72%);background:hsla(' + ih + ',70%,55%,.13);border-color:hsla(' + ih + ',70%,60%,.3)">' + esc(r.impl) + "</span></td>" +
      '<td class="cfg" title="' + esc(r.config) + '">' + esc(r.config) + "</td>" +
      '<td class="na">' + esc(r.workload) + "</td>" +
      metricCell(r.insert_mops, MAXI, "i") +
      metricCell(r.query_mops, MAXQ, "q") +
      '<td class="r" style="font-variant-numeric:tabular-nums">' + esc(r.memory_human) + "</td>" +
      accCell(r.accuracy) +
      '<td class="na">' + esc(r.acc_label) + "</td>" +
    "</tr>";
  }).join("");

  document.getElementById("empty").style.display = rows.length ? "none" : "block";
  let active = FACETS.reduce((n, f) => n + S.sel[f.key].size, 0) + (q ? 1 : 0);
  NUMF.forEach(nf => { if (S.num[nf.key].min !== null || S.num[nf.key].max !== null) active++; });
  document.getElementById("info").innerHTML =
    "Showing <b>" + rows.length + "</b> of " + DATA.length + " runs" +
    (active ? " &middot; " + active + " filter" + (active > 1 ? "s" : "") + " active" : "");
  document.getElementById("rowpill").textContent = rows.length + " runs";

  document.querySelectorAll("th[data-col]").forEach(th => {
    const sorted = th.dataset.col === S.col;
    th.classList.toggle("sorted", sorted);
    th.textContent = th.dataset.lbl + (sorted ? (S.dir === "asc" ? " ▲" : " ▼") : "");
  });
}

/* ------------------------------------------------------------ load flow */
function resetState() {
  S.view = "all"; S.col = "sketch"; S.dir = "asc"; S.q = "";
  FACETS.forEach(f => S.sel[f.key].clear());
  NUMF.forEach(nf => { S.num[nf.key].min = null; S.num[nf.key].max = null; });
  const qel = document.getElementById("q"); if (qel) qel.value = "";
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.view === "all"));
}

function loadFromText(text, sourceName) {
  const recs = parseRecords(text);
  if (!recs.length) { showError("Couldn't parse any JSON records from “" + sourceName + "”."); return false; }
  const rows = recs.map(toRow).filter(Boolean);
  if (!rows.length) { showError("No usable benchmark rows in “" + sourceName + "” (missing bench.wall_time_ms?)."); return false; }
  DATA = rows;
  SOURCE = sourceName;
  MAXI = Math.max(1, ...DATA.map(r => r.insert_mops || 0));
  MAXQ = Math.max(1, ...DATA.map(r => r.query_mops || 0));
  resetState();
  buildFacets();
  buildStatFilters();
  render();
  document.getElementById("source").textContent = sourceName + "  ·  " + recs.length + " records, " + rows.length + " rows";
  return true;
}

function tryFetch(url) {
  return fetch(url).then(r => {
    if (!r.ok) throw new Error(r.status);
    return r.arrayBuffer();
  }).then(buf => loadFromText(decodeBuffer(buf), url));
}

function showError(msg) {
  document.getElementById("source").textContent = msg;
  document.getElementById("info").innerHTML = "<b>" + esc(msg) + "</b>";
}

/* ------------------------------------------------------------ wiring */
document.querySelectorAll(".tab").forEach(b => b.addEventListener("click", () => {
  document.querySelector(".tab.active").classList.remove("active");
  b.classList.add("active");
  const v = VS[b.dataset.view];
  S.view = b.dataset.view; S.col = v.c; S.dir = v.d;
  render();
}));
document.getElementById("q").addEventListener("input", e => { S.q = e.target.value; render(); });
document.getElementById("reset").addEventListener("click", () => {
  FACETS.forEach(f => S.sel[f.key].clear());
  NUMF.forEach(nf => { S.num[nf.key].min = null; S.num[nf.key].max = null; });
  S.q = ""; document.getElementById("q").value = "";
  document.querySelectorAll(".chip.on").forEach(c => c.classList.remove("on"));
  document.querySelectorAll(".statf input").forEach(i => { i.value = ""; i.classList.remove("set"); });
  render();
});
document.querySelectorAll("th[data-col]").forEach(th => {
  th.dataset.lbl = th.textContent;
  th.addEventListener("click", () => {
    const c = th.dataset.col, numeric = (c === "insert_mops" || c === "query_mops" || c === "accuracy");
    S.dir = S.col === c ? (S.dir === "asc" ? "desc" : "asc") : (numeric ? "desc" : "asc");
    S.col = c; render();
  });
});

/* ------------------------------------------------------------ boot
 * Auto-load: try ?src=, then a few conventional locations. */
(function boot() {
  const params = new URLSearchParams(location.search);
  const candidates = [];
  if (params.get("src")) candidates.push(params.get("src"));
  candidates.push("all.jsonl", "data/all.jsonl",
                  "../sketch-bench/output/profiles/all.jsonl",
                  "../../sketch-bench/output/profiles/all.jsonl");
  (function next(i) {
    if (i >= candidates.length) {
      showError("No data file found — run via run.ps1, or open with ?src=<file>.");
      return;
    }
    tryFetch(candidates[i]).catch(() => next(i + 1));
  })(0);
})();
