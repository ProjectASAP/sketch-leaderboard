// Validation for the records in all.jsonl — the flat, one-row-per-cell shape
// that `approxbench sketchbench --flat` writes (aqpbm_core::MergedRecord).
//
// The point is to notice a damaged or hand-edited all.jsonl *at load time*,
// with a message naming the line and field, rather than letting a malformed
// record flow into the pages and surface as a blank chart or a silently wrong
// ranking. A record that fails here should be treated as "this file is not
// what the benchmark wrote", not as a row to quietly skip.
//
// ── Where the field knowledge lives ─────────────────────────────────────
// `schema.json` is generated from the Rust `MergedRecord` by
// `aqpbm-core`'s `schema_export_is_current` test and copied here verbatim.
// It is the only place field names, types and optionality are stated. This
// file used to restate all three by hand — ~150 lines of them — and that copy
// fell behind the Rust without anything noticing: `accuracy` had become
// `query_accuracy`, `latency_ns` had split per-operation, and eleven
// `prepare_*` / `merge_*` fields had appeared. Nothing here can fail a Rust
// build, so nothing here should be in a position to disagree with it.
//
// To update after a MergedRecord change, in sketch-bench:
//   UPDATE_SCHEMA=1 cargo test -p aqpbm-core --features schema \
//     schema_export_is_current
// then copy aqpbm-core/schema/merged_record.schema.json over schema.json.
//
// ── The four sections below, in the order they run ──────────────────────
//   1. SCHEMA        what is read out of schema.json
//   2. ajv           the generated structural check, and its error mapping
//   3. record rules  the checks the schema cannot express
//   4. file parsing  JSONL → records, collecting every problem found
//
// Sections 3-4 have no Rust counterpart: they check things `flatten_record.rs`
// never looks at, because that code only moves values between structs and
// never inspects them.

import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
// The import attribute is required by Node and accepted by Vite, so this
// module can also be exercised outside the bundler.
import schema from "./schema.json" with { type: "json" };

// ─────────────────────────────────────────────────────────────────────────
// 1. SCHEMA
// ─────────────────────────────────────────────────────────────────────────

/**
 * Schema version this validator understands, as stamped into the generated
 * document by the Rust exporter. Not a literal here: a version bump reaches
 * this file the same way every other schema change does, by re-copying
 * schema.json.
 */
export const SCHEMA_VERSION = schema["x-schema-version"];

/**
 * Every key a flat record carries.
 *
 * `schema.required` is the generated answer to "which keys does serde always
 * write?" — the exporter determines it by serialising an all-`None` record and
 * observing the result, so a field gaining or losing `skip_serializing_if`
 * moves in this set on its own. That makes "is this key set intact?" the
 * cheapest and strongest corruption check available, and ajv enforces it
 * directly from the document.
 */
export const RECORD_KEYS = Object.freeze(Object.keys(schema.properties));

/** Fast membership test for the unknown-key warning below. */
const KNOWN_KEYS = new Set(RECORD_KEYS);

/**
 * Which `$defs` type a property resolves to, seeing through the
 * `anyOf: [{$ref}, {type: "null"}]` that schemars emits for an `Option<T>`.
 * Used to find the RunStats-shaped values section 3 walks, so that list is
 * derived from the schema rather than restated.
 */
function refName(node) {
  if (!node || typeof node !== "object") return null;
  if (typeof node.$ref === "string") {
    return node.$ref.replace("#/$defs/", "");
  }
  for (const branch of node.anyOf ?? node.oneOf ?? []) {
    const name = refName(branch);
    if (name) return name;
  }
  return null;
}

const RUN_STATS_KEYS = [];
const CPU_TIME_KEYS = [];
for (const [key, node] of Object.entries(schema.properties)) {
  const name = refName(node);
  if (name === "RunStats") RUN_STATS_KEYS.push(key);
  else if (name === "CpuTime") CPU_TIME_KEYS.push(key);
}

/**
 * Field names the hand-written rules in section 3 mention.
 *
 * Those rules are the part that cannot be generated, so they are also the part
 * that can still drift — a rule naming a field the Rust has since renamed goes
 * quiet rather than wrong, which is worse. Checking the names against the
 * schema once, at module load, turns that silence into a failure the next
 * person cannot miss.
 */
const RULE_FIELDS = [
  "runs",
  "memory_bytes",
  "heap_bytes_net",
  "heap_bytes_peak",
  "merge_supported",
  "merge_time_ms",
  "merge_shards",
  "query_accuracy",
  "query_throughput_items_per_sec",
];
const missingRuleFields = RULE_FIELDS.filter((f) => !KNOWN_KEYS.has(f));
if (missingRuleFields.length > 0) {
  throw new Error(
    `benchmarkRecord.js: the semantic rules name ${missingRuleFields.join(", ")}, ` +
      `which schema.json (v${SCHEMA_VERSION}) no longer defines. ` +
      `Update the rules in section 3 to the current field names.`,
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 2. AJV
// ─────────────────────────────────────────────────────────────────────────

// `strict: false` because schemars tags integer widths as formats — `uint64`,
// `uint`, `double` — which ajv does not know and would otherwise refuse to
// compile. `date-time` *is* known, and ajv-formats makes it a real check
// rather than a decoration.
// `verbose` so each error carries the offending value: a message naming what
// was actually there beats one that only names what was wanted.
const ajv = new Ajv({ allErrors: true, strict: false, verbose: true });
addFormats(ajv);

/** Every `format` the document mentions, at any depth. */
function formatsUsed(node, found = new Set()) {
  if (Array.isArray(node)) {
    for (const item of node) formatsUsed(item, found);
  } else if (node && typeof node === "object") {
    if (typeof node.format === "string") found.add(node.format);
    for (const value of Object.values(node)) formatsUsed(value, found);
  }
  return found;
}

// Registered as accept-anything rather than left unknown, which ajv reports on
// every occurrence — a wall of "unknown format uint64" in the console the
// first time anyone opens the page. Widths carry no constraint ajv could
// enforce anyway: the `minimum: 0` schemars emits beside them is what actually
// bounds the value, and ajv already applies that. Discovered from the document
// so a new numeric type on the Rust side needs no edit here.
for (const name of formatsUsed(schema)) {
  if (!ajv.formats[name]) ajv.addFormat(name, true);
}

const validateStructure = ajv.compile(schema);

/** A dotted path a reader can find in the file, from an ajv instancePath. */
const fieldOf = (instancePath) =>
  instancePath === "" ? "(record)" : instancePath.slice(1).split("/").join(".");

/**
 * ajv's errors, reduced to one problem per real fault.
 *
 * With `allErrors` and the `anyOf` that every optional field carries, a single
 * malformed value yields three entries: one for the `$ref` branch, one for the
 * `null` branch, and one for the `anyOf` itself. Only the first says anything
 * useful, so the union keywords are dropped wherever a more specific error
 * already points inside them.
 */
function mapAjvErrors(errors, line) {
  const specific = errors.filter((e) => {
    if (e.keyword === "anyOf" || e.keyword === "oneOf") return false;
    // The `null` half of an `Option<T>` rejects every non-null value, so it
    // fires alongside the real error on any malformed one. "expected null"
    // is never the fault being reported — nothing in this schema is
    // required to be null — so it is noise in every case it appears.
    if (e.keyword === "type" && e.params.type === "null") return false;
    return true;
  });
  const kept = specific.length > 0 ? specific : errors;

  const seen = new Set();
  const problems = [];
  for (const err of kept) {
    if (err.keyword === "required") {
      // Qualified by where it is missing from: a bare "stddev" sends the
      // reader looking for a top-level key that was never supposed to exist,
      // where "insert_wall_time_ms.stddev" names the actual hole.
      const key =
        err.instancePath === ""
          ? err.params.missingProperty
          : `${fieldOf(err.instancePath)}.${err.params.missingProperty}`;
      const dedupe = `required:${key}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      problems.push(problem(line, key, "error", "key missing from record"));
      continue;
    }

    const field = fieldOf(err.instancePath);
    const dedupe = `${field}:${err.keyword}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);

    // ajv phrases these for a schema author; these read for someone looking at
    // a data file. Everything else falls through to ajv's own wording, which
    // is already specific enough ("must be <= 2 items", "must be integer").
    let message;
    switch (err.keyword) {
      case "type":
        message = `expected ${err.params.type}, got ${describe(err.data)}`;
        break;
      case "enum":
        message = `not one of the permitted values: ${err.params.allowedValues.join(", ")}`;
        break;
      case "const":
        message = `expected ${JSON.stringify(err.params.allowedValue)}`;
        break;
      case "format":
        message = `not a well-formed ${err.params.format}`;
        break;
      default:
        message = err.message;
    }
    problems.push(problem(line, field, "error", message));
  }
  return problems;
}

/** What a bad value actually was, for the type-mismatch message. */
function describe(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return typeof value;
}

// ─────────────────────────────────────────────────────────────────────────
// 3. RECORD RULES
// ─────────────────────────────────────────────────────────────────────────

/**
 * One problem found in one record.
 *
 * `error` means the file is not what the benchmark wrote and should not be
 * rendered. `warning` means the record is structurally sound but says
 * something surprising — worth showing, not worth refusing to start over.
 */
function problem(line, field, severity, message) {
  return { line, field, severity, message };
}

const isPlainObject = (v) =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isInteger = (v) => Number.isInteger(v);

/** Every RunStats-shaped value in a record, for the checks that walk them. */
function* runStatsEntries(record) {
  for (const key of RUN_STATS_KEYS) {
    const value = record[key];
    if (isPlainObject(value)) yield [key, value];
  }
  for (const key of CPU_TIME_KEYS) {
    const value = record[key];
    if (!isPlainObject(value)) continue;
    if (isPlainObject(value.user_ms)) yield [`${key}.user_ms`, value.user_ms];
    if (isPlainObject(value.sys_ms)) yield [`${key}.sys_ms`, value.sys_ms];
  }
}

/**
 * Check one record. Returns every problem found — never throws, and never
 * stops at the first fault, so one bad file yields one complete report rather
 * than a game of whack-a-mole.
 *
 * @param {unknown} raw    parsed JSON value for one line
 * @param {number}  line   1-based line number, for the message
 * @returns {{line:number, field:string, severity:string, message:string}[]}
 */
export function validateRecord(raw, line) {
  const problems = [];

  if (!isPlainObject(raw)) {
    return [
      problem(
        line,
        "(record)",
        "error",
        `expected a JSON object, got ${describe(raw)}`,
      ),
    ];
  }

  // ── version gate ──
  // Checked before anything else, and returns early: an older record is not
  // corrupt, it is old, and type-checking it against the current schema would
  // bury that one fact under thirty spurious field errors. This is a live
  // possibility, not a hypothetical — the file this app ships with is v3.
  if (raw.schema_version !== SCHEMA_VERSION) {
    return [
      problem(
        line,
        "schema_version",
        "error",
        `expected ${SCHEMA_VERSION}, got ${JSON.stringify(raw.schema_version)} — ` +
          `this file was written by a different version of approxbench, not damaged`,
      ),
    ];
  }

  // ── structure ──
  // Key set, types, enum variants, nullability and the numeric bounds the Rust
  // types imply, all from the generated schema.
  if (!validateStructure(raw)) {
    problems.push(...mapAjvErrors(validateStructure.errors, line));
  }

  // Extra keys are a warning, not an error: the schema grows additively, and a
  // reader that refuses unknown fields breaks every time the benchmark learns
  // to measure something new. The schema deliberately leaves
  // `additionalProperties` unset so this severity stays the reader's call.
  for (const key of Object.keys(raw)) {
    if (!KNOWN_KEYS.has(key)) {
      problems.push(
        problem(line, key, "warning", "unrecognised key — newer schema?"),
      );
    }
  }

  // ── semantic rules ──
  // These have no counterpart in the Rust flattener: it relays values without
  // inspecting them, so nothing upstream would notice these combinations.
  const { merge_supported, merge_time_ms, merge_shards, runs } = raw;

  // The runner records merge_time_ms only when the fold actually succeeded,
  // so a timing beside "unsupported" means one of the two was rewritten.
  if (merge_supported === false && merge_time_ms !== null) {
    problems.push(
      problem(
        line,
        "merge_time_ms",
        "error",
        "present although merge_supported is false",
      ),
    );
  }
  if (merge_time_ms != null && merge_supported !== true) {
    problems.push(
      problem(
        line,
        "merge_supported",
        "error",
        `expected true beside a merge_time_ms, got ${JSON.stringify(merge_supported)}`,
      ),
    );
  }
  // Folding one shard measures nothing, so the runner refuses to report it as
  // a successful merge.
  if (merge_supported === true && isInteger(merge_shards) && merge_shards < 2) {
    problems.push(
      problem(
        line,
        "merge_shards",
        "error",
        `a successful merge needs at least 2 shards, got ${merge_shards}`,
      ),
    );
  }

  // Accuracy and the query-pass metrics are produced by the same pass, so they
  // normally appear and vanish together. Only a warning: an impl that declares
  // no query capability still runs the pass timed-only, which legitimately
  // yields query timings with no accuracy.
  if (
    (raw.query_accuracy == null) !==
    (raw.query_throughput_items_per_sec == null)
  ) {
    problems.push(
      problem(
        line,
        "query_accuracy",
        "warning",
        "accuracy and query throughput usually accompany each other; one is null and the other is not",
      ),
    );
  }

  // ── ranges ──
  // Only the bounds the Rust types do not already imply. Every `u64` and
  // `usize` arrives from schemars carrying `minimum: 0`, so ajv has covered
  // the non-negative cases above; what it cannot know is where zero is itself
  // impossible.
  if (isInteger(runs) && runs < 1) {
    problems.push(problem(line, "runs", "error", `must be >= 1, got ${runs}`));
  }
  for (const [path, stats] of runStatsEntries(raw)) {
    if (isInteger(stats.n) && stats.n < 1) {
      problems.push(
        problem(line, path, "error", `n must be >= 1, got ${stats.n}`),
      );
    }
    // Only an *excess* is suspicious. `n` under-running `runs` is normal and
    // common: the accuracy comparator attaches to the first measured run only
    // (re-scoring one draw N times would claim N independent draws), so every
    // query-pass statistic legitimately reports n = 1 against runs = 5.
    // Requiring equality flagged 392 valid rows, which is worse than not
    // checking — a warning that cries wolf is one nobody reads. An `n` larger
    // than `runs`, though, claims more samples than the run ever took.
    if (isInteger(runs) && isInteger(stats.n) && stats.n > runs) {
      problems.push(
        problem(
          line,
          path,
          "warning",
          `n is ${stats.n}, more samples than the ${runs} runs taken`,
        ),
      );
    }
  }

  return problems;
}

// ─────────────────────────────────────────────────────────────────────────
// 4. FILE PARSING
// ─────────────────────────────────────────────────────────────────────────

/** Thrown when a file has at least one `error`-severity problem. */
export class SchemaViolation extends Error {
  /** @param {{line:number, field:string, severity:string, message:string}[]} problems */
  constructor(problems) {
    const errors = problems.filter((p) => p.severity === "error");
    const shown = errors
      .slice(0, 5)
      .map((p) => `  line ${p.line}: ${p.field} — ${p.message}`)
      .join("\n");
    const more = errors.length > 5 ? `\n  …and ${errors.length - 5} more` : "";
    super(
      `all.jsonl failed validation with ${errors.length} error(s):\n${shown}${more}`,
    );
    this.name = "SchemaViolation";
    this.problems = problems;
  }
}

/**
 * Parse and validate a whole JSONL file.
 *
 * Every line is checked even after the first failure, so the caller can show
 * the full picture rather than one symptom at a time.
 *
 * @param {string} text raw file contents
 * @returns {{records: object[], problems: object[]}}
 */
export function parseBenchmarkJsonl(text) {
  const records = [];
  const problems = [];

  // Split on \r?\n: all.jsonl is written on Windows by run_profiles.ps1, so
  // the lines end \r\n. Splitting on "\n" alone leaves a trailing \r that
  // JSON.parse tolerates but that would corrupt any string compared by hand.
  const lines = text.split(/\r?\n/);

  lines.forEach((rawLine, index) => {
    const line = index + 1;
    const trimmed = rawLine.trim();
    if (trimmed === "") return; // trailing newline, or a blank separator

    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch (err) {
      problems.push(
        problem(line, "(json)", "error", `not valid JSON: ${err.message}`),
      );
      return;
    }

    const found = validateRecord(parsed, line);
    problems.push(...found);
    // A record with warnings is still usable; one with errors is not, and the
    // caller is about to throw anyway.
    if (!found.some((p) => p.severity === "error")) records.push(parsed);
  });

  if (records.length === 0 && problems.length === 0) {
    problems.push(
      problem(0, "(file)", "error", "no records found — file is empty"),
    );
  }

  return { records, problems };
}
