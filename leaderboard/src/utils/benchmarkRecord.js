// Validation for the records in all.jsonl — the flat, one-row-per-cell shape
// that `approxbench sketchbench --flat` writes (aqpbm_core::MergedRecord).
//
// The point is to notice a damaged or hand-edited all.jsonl *at load time*,
// with a message naming the line and field, rather than letting a malformed
// record flow into the pages and surface as a blank chart or a silently wrong
// ranking. A record that fails here should be treated as "this file is not
// what the benchmark wrote", not as a row to quietly skip.
//
// ── The four sections below, in the order they run ──────────────────────
//   1. SCHEMA        the field list mirroring the Rust type
//   2. type guards   what a well-formed value of each kind looks like
//   3. record rules  per-record structural + semantic checks
//   4. file parsing  JSONL → records, collecting every problem found
//
// Section 1 is the part that duplicates knowledge held in Rust
// (aqpbm-core/src/report.rs) and should eventually be generated from it — see
// the note on RECORD_KEYS. Sections 2-4 have no Rust counterpart: they check
// things `flatten_record.rs` never looks at, because that code only moves
// values between structs and never inspects them.

/** Schema version this validator understands. */
export const SCHEMA_VERSION = 3;

// ─────────────────────────────────────────────────────────────────────────
// 1. SCHEMA
// ─────────────────────────────────────────────────────────────────────────

/**
 * Every key a v3 flat record carries.
 *
 * `MergedRecord` sets no `skip_serializing_if`, so serde writes every field on
 * every line even when the value is null. The key set is therefore an exact
 * contract, not a minimum — which makes "is this key set intact?" the single
 * cheapest and strongest corruption check available. A record missing a key
 * was not produced by this pipeline.
 *
 * TODO: generate from the Rust type. A hand-maintained copy drifts the moment
 * someone adds a field, and that is not hypothetical — adding `merge_accuracy`
 * to MergedRecord is exactly what broke flatten_record.rs, which only survived
 * because Rust's exhaustive destructuring failed the build. Nothing here can
 * fail a build, so this list needs a test on the Rust side to stay honest.
 */
export const RECORD_KEYS = Object.freeze([
  "schema_version",
  "sketch",
  "impl",
  "language",
  "mode",
  "runs",
  "source",
  "sketch_config",
  "workload",
  "memory_bytes",
  "heap_bytes_net",
  "heap_bytes_peak",
  "accuracy",
  "insert_timestamp",
  "insert_throughput_items_per_sec",
  "insert_throughput_samples",
  "insert_build_throughput_items_per_sec",
  "insert_finalize_time_ms",
  "insert_cpu_time_ms",
  "insert_wall_time_ms",
  "insert_rss_peak_kb",
  "insert_heap_allocated_kb",
  "query_timestamp",
  "query_throughput_items_per_sec",
  "query_cpu_time_ms",
  "query_wall_time_ms",
  "query_rss_peak_kb",
  "query_heap_allocated_kb",
  "latency_timestamp",
  "latency_ns",
  "merge_timestamp",
  "merge_time_ms",
  "merge_shards",
  "merge_supported",
  "merge_accuracy",
]);

/**
 * Fields whose Rust type is not `Option<_>`, so serde can never write null.
 * Everything else may legitimately be null, meaning "not collected in this
 * run" rather than "damaged".
 *
 * Kept deliberately short. It is tempting to also require the fields that
 * happen to be non-null in the current file, but most of those reflect one
 * run's flags, not the schema: every `*_rss_peak_kb` is null in all 303 rows
 * only because the binary was built with `heap-track` rather than jemalloc,
 * and `latency_ns` is null only because `--metrics latency` was not passed.
 * Requiring either would reject a perfectly valid file produced with
 * different flags.
 */
export const REQUIRED_NON_NULL = Object.freeze([
  "schema_version",
  "sketch",
  "impl",
  "language",
  "mode",
  "runs",
  "source",
  "workload",
]);

// Enum variants come from the Rust enums, not from what this dataset happens
// to contain: today every row is rust/bench/cli, but the C++ track emits
// language "cpp" and source "cpp-bench", and the embedded runtime sampler
// emits the other three sources. Narrowing these to observed values would
// reject valid data from those producers.
const LANGUAGES = ["rust", "cpp"];
const MODES = ["bench", "profile", "runtime"];
const SOURCES = [
  "cli",
  "asap-fusion",
  "data-collector",
  "asap-query",
  "cpp-bench",
];

const FIELD_TYPES = {
  schema_version: "integer",
  sketch: "nonEmptyString",
  impl: "nonEmptyString",
  language: "language",
  mode: "mode",
  runs: "integer",
  source: "source",
  sketch_config: "sketchConfig",
  workload: "workload",
  memory_bytes: "integer",
  heap_bytes_net: "integer",
  heap_bytes_peak: "integer",
  accuracy: "metricMap",
  insert_timestamp: "timestamp",
  insert_throughput_items_per_sec: "runStats",
  insert_throughput_samples: "numberArray",
  insert_build_throughput_items_per_sec: "runStats",
  insert_finalize_time_ms: "runStats",
  insert_cpu_time_ms: "cpuTime",
  insert_wall_time_ms: "runStats",
  insert_rss_peak_kb: "integer",
  insert_heap_allocated_kb: "integer",
  query_timestamp: "timestamp",
  query_throughput_items_per_sec: "runStats",
  query_cpu_time_ms: "cpuTime",
  query_wall_time_ms: "runStats",
  query_rss_peak_kb: "integer",
  query_heap_allocated_kb: "integer",
  latency_timestamp: "timestamp",
  latency_ns: "latencySummary",
  merge_timestamp: "timestamp",
  merge_time_ms: "runStats",
  merge_shards: "integer",
  merge_supported: "boolean",
  merge_accuracy: "metricMap",
};

// ─────────────────────────────────────────────────────────────────────────
// 2. TYPE GUARDS
// ─────────────────────────────────────────────────────────────────────────

const isPlainObject = (v) =>
  typeof v === "object" && v !== null && !Array.isArray(v);

// NaN and Infinity are excluded on purpose. They survive a JSON round trip as
// null, so their appearance as a number means the value was written by
// something other than serde_json — and a NaN compares unequal to itself,
// which would poison any min/max normalisation downstream in buildLeaderboard.
const isFiniteNumber = (v) => typeof v === "number" && Number.isFinite(v);
const isInteger = (v) => Number.isInteger(v);

/** aqpbm_core::RunStats — mean/stddev/n, with ci95 only under `--repeats`. */
function isRunStats(v) {
  if (!isPlainObject(v)) return false;
  if (!isFiniteNumber(v.mean) || !isFiniteNumber(v.stddev)) return false;
  if (!isInteger(v.n)) return false;
  if (v.ci95 !== undefined && v.ci95 !== null) {
    if (!Array.isArray(v.ci95) || v.ci95.length !== 2) return false;
    if (!v.ci95.every(isFiniteNumber)) return false;
  }
  return true;
}

const isCpuTime = (v) =>
  isPlainObject(v) && isRunStats(v.user_ms) && isRunStats(v.sys_ms);

const LATENCY_FIELDS = ["p50", "p95", "p99", "p999", "max", "count"];
const isLatencySummary = (v) =>
  isPlainObject(v) && LATENCY_FIELDS.every((f) => isInteger(v[f]));

// Accuracy blobs are open maps: the key set differs per algorithm (hll reports
// relative_error, kll mean_rank_err, cms/countsketch the are_topN family), and
// the merge pass adds merge_lossless. Validating the names would hard-code one
// algorithm's comparator, so only the value shape is checked.
const isMetricMap = (v) =>
  isPlainObject(v) && Object.values(v).every(isFiniteNumber);

const isNumberArray = (v) => Array.isArray(v) && v.every(isFiniteNumber);

const isTimestamp = (v) =>
  typeof v === "string" && !Number.isNaN(Date.parse(v));

function isWorkload(v) {
  if (!isPlainObject(v)) return false;
  if (typeof v.shape !== "string" || v.shape.length === 0) return false;
  if (!isInteger(v.size)) return false;
  // cardinality / zipf_s / seed / source_path / spec are all optional: a file
  // workload has a source_path and no cardinality, a generated one the reverse.
  return true;
}

const isSketchConfig = (v) =>
  isPlainObject(v) &&
  typeof v.algorithm === "string" &&
  isPlainObject(v.params);

const TYPE_GUARDS = {
  integer: isInteger,
  boolean: (v) => typeof v === "boolean",
  nonEmptyString: (v) => typeof v === "string" && v.length > 0,
  language: (v) => LANGUAGES.includes(v),
  mode: (v) => MODES.includes(v),
  source: (v) => SOURCES.includes(v),
  timestamp: isTimestamp,
  runStats: isRunStats,
  cpuTime: isCpuTime,
  latencySummary: isLatencySummary,
  metricMap: isMetricMap,
  numberArray: isNumberArray,
  workload: isWorkload,
  sketchConfig: isSketchConfig,
};

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

/** Every RunStats-shaped value in a record, for the checks that walk them. */
function* runStatsEntries(record) {
  for (const [key, kind] of Object.entries(FIELD_TYPES)) {
    const value = record[key];
    if (value === null || value === undefined) continue;
    if (kind === "runStats") yield [key, value];
    if (kind === "cpuTime") {
      yield [`${key}.user_ms`, value.user_ms];
      yield [`${key}.sys_ms`, value.sys_ms];
    }
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
        `expected a JSON object, got ${Array.isArray(raw) ? "an array" : typeof raw}`,
      ),
    ];
  }

  // ── version gate ──
  // Checked before anything else, and returns early: a v2 record is not
  // corrupt, it is old, and type-checking it against v3 would bury that one
  // fact under thirty spurious field errors. v2 is a real possibility here —
  // the file this app shipped with until now was v2.
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

  // ── key set ──
  const present = new Set(Object.keys(raw));
  for (const key of RECORD_KEYS) {
    if (!present.has(key)) {
      problems.push(problem(line, key, "error", "key missing from record"));
    }
  }
  // Extra keys are a warning, not an error: the schema grows additively, and a
  // reader that refuses unknown fields breaks every time the benchmark learns
  // to measure something new. `merge_accuracy` was such an addition.
  for (const key of present) {
    if (!RECORD_KEYS.includes(key)) {
      problems.push(
        problem(line, key, "warning", "unrecognised key — newer schema?"),
      );
    }
  }

  // ── types ──
  for (const [key, kind] of Object.entries(FIELD_TYPES)) {
    if (!present.has(key)) continue; // already reported as missing
    const value = raw[key];
    if (value === null) {
      if (REQUIRED_NON_NULL.includes(key)) {
        problems.push(
          problem(line, key, "error", "null, but this field is never optional"),
        );
      }
      continue; // a legitimate null needs no type check
    }
    if (!TYPE_GUARDS[kind](value)) {
      problems.push(problem(line, key, "error", `not a well-formed ${kind}`));
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
    (raw.accuracy === null) !==
    (raw.query_throughput_items_per_sec === null)
  ) {
    problems.push(
      problem(
        line,
        "accuracy",
        "warning",
        "accuracy and query throughput usually accompany each other; one is null and the other is not",
      ),
    );
  }

  // ── ranges ──
  if (isInteger(runs) && runs < 1) {
    problems.push(problem(line, "runs", "error", `must be >= 1, got ${runs}`));
  }
  for (const key of ["memory_bytes", "heap_bytes_net", "heap_bytes_peak"]) {
    const v = raw[key];
    if (isInteger(v) && v < 0) {
      problems.push(problem(line, key, "error", `must be >= 0, got ${v}`));
    }
  }
  for (const [path, stats] of runStatsEntries(raw)) {
    if (!isRunStats(stats)) continue; // already reported by the type layer
    if (stats.stddev < 0) {
      problems.push(
        problem(
          line,
          path,
          "error",
          `stddev must be >= 0, got ${stats.stddev}`,
        ),
      );
    }
    if (stats.n < 1) {
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
    if (isInteger(runs) && stats.n > runs) {
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
