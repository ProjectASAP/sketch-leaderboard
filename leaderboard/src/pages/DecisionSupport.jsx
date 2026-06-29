import { useEffect, useMemo, useState } from "react";
import { loadBenchmarkData } from "../utils/loadJson";
import "./ResultTable.css";

function formatConfig(item) {
  const params = item.sketch_config?.params;
  if (!params || Object.keys(params).length === 0) return "default";
  return Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
}

function queryMops(item) {
  const q = item.bench?.query_throughput_items_per_sec?.mean;
  return q ? +(q / 1e6).toFixed(3) : null;
}

// Normalize all error values to % for consistent comparison
function errorPct(item) {
  const acc = item.bench?.accuracy;
  if (!acc) return null;
  switch (item.sketch) {
    case "hll":
      return acc.relative_error != null
        ? +(acc.relative_error * 100).toFixed(3)
        : null;
    case "kll":
      return acc.mean_rank_err != null
        ? +(acc.mean_rank_err * 100).toFixed(3)
        : null;
    case "cms":
    case "countsketch":
      return acc.relative_error_mean != null
        ? +acc.relative_error_mean.toFixed(3)
        : null;
    default:
      return null;
  }
}

function avg(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function fmtMemory(kb) {
  if (kb == null) return "NA";
  if (kb >= 1024 * 1024) return `${(kb / 1024 / 1024).toFixed(1)} GB`;
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`;
  return `${kb.toFixed(0)} KB`;
}

function toKb(value, unit) {
  if (unit === "GB") return value * 1024 * 1024;
  if (unit === "MB") return value * 1024;
  return value;
}

const SKETCH_LABELS = {
  hll: "HLL",
  kll: "KLL",
  cms: "CMS",
  countsketch: "CountSketch",
};

function PrioritySlider({ label, value, onChange }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        marginBottom: "14px",
      }}
    >
      <span style={{ width: "130px", fontWeight: 500 }}>{label}</span>
      <span style={{ color: "#aaa", fontSize: "0.85em" }}>Low</span>
      <input
        type="range"
        min={1}
        max={5}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
        style={{ width: "160px", cursor: "pointer" }}
      />
      <span style={{ color: "#aaa", fontSize: "0.85em" }}>High</span>
      <span
        style={{
          width: "20px",
          textAlign: "center",
          fontWeight: "bold",
          color: value >= 4 ? "#4f86c6" : value <= 2 ? "#aaa" : "#555",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function ScoreBar({ score }) {
  const pct = +(score * 100).toFixed(0);
  const color = score > 0.66 ? "#42b883" : score > 0.33 ? "#e5c07b" : "#e06c75";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <div
        style={{
          width: "90px",
          height: "8px",
          background: "#eee",
          borderRadius: "4px",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: color,
            borderRadius: "4px",
          }}
        />
      </div>
      <span style={{ fontSize: "0.85em", color: "#555", minWidth: "28px" }}>
        {pct}
      </span>
    </div>
  );
}

function DecisionSupport() {
  const [records, setRecords] = useState([]);
  const [sketchFilter, setSketchFilter] = useState("any");

  // constraints
  const [maxMemory, setMaxMemory] = useState("");
  const [maxMemoryUnit, setMaxMemoryUnit] = useState("MB");
  const [maxError, setMaxError] = useState("");
  const [minThroughput, setMinThroughput] = useState("");

  // priorities
  const [speedPri, setSpeedPri] = useState(3);
  const [memoryPri, setMemoryPri] = useState(3);
  const [accuracyPri, setAccuracyPri] = useState(3);

  useEffect(() => {
    loadBenchmarkData().then(setRecords);
  }, []);

  function reset() {
    setSketchFilter("any");
    setMaxMemory("");
    setMaxMemoryUnit("MB");
    setMaxError("");
    setMinThroughput("");
    setSpeedPri(3);
    setMemoryPri(3);
    setAccuracyPri(3);
  }

  const families = useMemo(
    () => [...new Set(records.map((r) => r.sketch))].sort(),
    [records],
  );

  // Aggregate by (sketch, impl, config) — mean across all workloads
  const candidates = useMemo(() => {
    const src =
      sketchFilter === "any"
        ? records
        : records.filter((r) => r.sketch === sketchFilter);

    const map = {};
    for (const r of src) {
      const key = `${r.sketch}||${r.impl}||${formatConfig(r)}`;
      if (!map[key])
        map[key] = {
          sketch: r.sketch,
          impl: r.impl,
          config: formatConfig(r),
          queries: [],
          mems: [],
          errs: [],
        };
      const q = queryMops(r);
      const m = r.bench?.heap_allocated_kb;
      const e = errorPct(r);
      if (q != null) map[key].queries.push(q);
      if (m != null) map[key].mems.push(m);
      if (e != null) map[key].errs.push(e);
    }

    return Object.values(map).map((d) => ({
      sketch: d.sketch,
      impl: d.impl,
      config: d.config,
      query: d.queries.length ? +avg(d.queries).toFixed(3) : null,
      memoryKb: d.mems.length ? +avg(d.mems).toFixed(1) : null,
      error: d.errs.length ? +avg(d.errs).toFixed(3) : null,
    }));
  }, [records, sketchFilter]);

  const maxMemoryKb =
    maxMemory !== "" ? toKb(parseFloat(maxMemory), maxMemoryUnit) : null;

  // Apply hard constraints
  const passing = useMemo(() => {
    return candidates.filter((c) => {
      if (
        maxMemoryKb !== null &&
        c.memoryKb != null &&
        c.memoryKb > maxMemoryKb
      )
        return false;
      if (maxError !== "" && c.error != null && c.error > parseFloat(maxError))
        return false;
      if (
        minThroughput !== "" &&
        c.query != null &&
        c.query < parseFloat(minThroughput)
      )
        return false;
      return true;
    });
  }, [candidates, maxMemoryKb, maxError, minThroughput]);

  // Rank by weighted score
  const ranked = useMemo(() => {
    if (passing.length === 0) return [];

    const validQ = passing.filter((c) => c.query != null).map((c) => c.query);
    const validM = passing
      .filter((c) => c.memoryKb != null)
      .map((c) => c.memoryKb);
    const validE = passing.filter((c) => c.error != null).map((c) => c.error);

    const maxQ = validQ.length ? Math.max(...validQ) : 1;
    const minQ = validQ.length ? Math.min(...validQ) : 0;
    const maxM = validM.length ? Math.max(...validM) : 1;
    const minM = validM.length ? Math.min(...validM) : 0;
    const maxE = validE.length ? Math.max(...validE) : 1;
    const minE = validE.length ? Math.min(...validE) : 0;

    const norm = (v, lo, hi) => (hi === lo ? 1 : (v - lo) / (hi - lo));
    const total = speedPri + memoryPri + accuracyPri || 1;

    return [...passing]
      .map((c) => {
        const missing = [];
        const sSpeed =
          c.query != null
            ? norm(c.query, minQ, maxQ)
            : (missing.push("throughput"), 0);
        const sMem =
          c.memoryKb != null
            ? 1 - norm(c.memoryKb, minM, maxM)
            : (missing.push("memory"), 0);
        const sAcc =
          c.error != null
            ? 1 - norm(c.error, minE, maxE)
            : (missing.push("error"), 0);
        if (missing.length > 0)
          console.warn(
            `[DecisionSupport] ${c.sketch}/${c.impl}/${c.config}: missing ${missing.join(", ")} — scored as 0`,
          );
        const score =
          (speedPri * sSpeed + memoryPri * sMem + accuracyPri * sAcc) / total;
        return { ...c, score };
      })
      .sort((a, b) => b.score - a.score);
  }, [passing, speedPri, memoryPri, accuracyPri]);

  const filteredOut = candidates.length - passing.length;

  return (
    <div style={{ padding: "20px", maxWidth: "1100px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "16px",
          marginBottom: "8px",
        }}
      >
        <h1 style={{ margin: 0 }}>Decision Support</h1>
        <button
          onClick={reset}
          style={{
            padding: "6px 14px",
            borderRadius: "6px",
            border: "1px solid #ccc",
            cursor: "pointer",
            background: "#fff",
            color: "#555",
            fontSize: "0.85em",
          }}
        >
          Reset
        </button>
      </div>
      <p style={{ color: "#555", marginBottom: "20px" }}>
        Set constraints and priorities to find the best sketch implementation
        for your use case.
      </p>

      {/* Sketch family filter */}
      <div
        style={{
          display: "flex",
          gap: "10px",
          flexWrap: "wrap",
          marginBottom: "24px",
        }}
      >
        {["any", ...families].map((f) => (
          <button
            key={f}
            onClick={() => setSketchFilter(f)}
            style={{
              padding: "8px 16px",
              borderRadius: "6px",
              border: "1px solid #ccc",
              cursor: "pointer",
              fontWeight: f === sketchFilter ? "bold" : "normal",
              background: f === sketchFilter ? "#222" : "#fff",
              color: f === sketchFilter ? "#fff" : "#222",
              textTransform: "uppercase",
            }}
          >
            {f === "any" ? "Any Sketch" : (SKETCH_LABELS[f] ?? f)}
          </button>
        ))}
      </div>

      <div
        style={{
          display: "flex",
          gap: "40px",
          flexWrap: "wrap",
          marginBottom: "28px",
        }}
      >
        {/* Constraints */}
        <div style={{ flex: 1, minWidth: "280px" }}>
          <h3 style={{ marginBottom: "16px" }}>Constraints</h3>
          <p
            style={{ color: "#888", fontSize: "0.85em", marginBottom: "14px" }}
          >
            Leave blank to skip a constraint.
          </p>

          <div
            style={{ display: "flex", flexDirection: "column", gap: "14px" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ width: "150px", fontWeight: 500 }}>
                Max memory
              </span>
              <input
                type="number"
                min="0"
                placeholder="any"
                value={maxMemory}
                onChange={(e) => setMaxMemory(e.target.value)}
                style={{
                  width: "80px",
                  padding: "6px 8px",
                  border: "1px solid #ccc",
                  borderRadius: "4px",
                }}
              />
              <select
                value={maxMemoryUnit}
                onChange={(e) => setMaxMemoryUnit(e.target.value)}
                style={{
                  padding: "6px 8px",
                  border: "1px solid #ccc",
                  borderRadius: "4px",
                }}
              >
                <option>KB</option>
                <option>MB</option>
                <option>GB</option>
              </select>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ width: "150px", fontWeight: 500 }}>Max error</span>
              <input
                type="number"
                min="0"
                placeholder="any"
                value={maxError}
                onChange={(e) => setMaxError(e.target.value)}
                style={{
                  width: "80px",
                  padding: "6px 8px",
                  border: "1px solid #ccc",
                  borderRadius: "4px",
                }}
              />
              <span style={{ color: "#555" }}>%</span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ width: "150px", fontWeight: 500 }}>
                Min throughput
              </span>
              <input
                type="number"
                min="0"
                placeholder="any"
                value={minThroughput}
                onChange={(e) => setMinThroughput(e.target.value)}
                style={{
                  width: "80px",
                  padding: "6px 8px",
                  border: "1px solid #ccc",
                  borderRadius: "4px",
                }}
              />
              <span style={{ color: "#555" }}>M/s</span>
            </div>
          </div>
        </div>

        {/* Priorities */}
        <div style={{ flex: 1, minWidth: "280px" }}>
          <h3 style={{ marginBottom: "16px" }}>Priorities</h3>
          <p
            style={{ color: "#888", fontSize: "0.85em", marginBottom: "14px" }}
          >
            Weight each metric in the final ranking.
          </p>
          <PrioritySlider
            label="Throughput"
            value={speedPri}
            onChange={setSpeedPri}
          />
          <PrioritySlider
            label="Memory efficiency"
            value={memoryPri}
            onChange={setMemoryPri}
          />
          <PrioritySlider
            label="Accuracy"
            value={accuracyPri}
            onChange={setAccuracyPri}
          />
        </div>
      </div>

      {/* Results */}
      <div>
        <p style={{ fontWeight: 500, marginBottom: "12px" }}>
          {ranked.length === 0 && candidates.length > 0
            ? "No implementations match your constraints."
            : `${ranked.length} result${ranked.length === 1 ? "" : "s"} ranked by priority`}
          {filteredOut > 0 && (
            <span
              style={{ color: "#888", fontWeight: "normal", marginLeft: "8px" }}
            >
              ({filteredOut} filtered out by constraints)
            </span>
          )}
        </p>

        {ranked.length > 0 && (
          <table className="results-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Sketch</th>
                <th>Implementation</th>
                <th>Config</th>
                <th>Memory</th>
                <th>Throughput</th>
                <th>Error</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((r, i) => (
                <tr key={`${r.sketch}-${r.impl}-${r.config}`}>
                  <td
                    style={{
                      fontWeight: "bold",
                      color:
                        i === 0
                          ? "#42b883"
                          : i === 1
                            ? "#e5c07b"
                            : i === 2
                              ? "#e06c75"
                              : "#555",
                    }}
                  >
                    {i + 1}
                  </td>
                  <td style={{ textTransform: "uppercase", fontWeight: 500 }}>
                    {SKETCH_LABELS[r.sketch] ?? r.sketch}
                  </td>
                  <td>{r.impl}</td>
                  <td style={{ color: "#666", fontSize: "0.9em" }}>
                    {r.config}
                  </td>
                  <td>{fmtMemory(r.memoryKb)}</td>
                  <td>{r.query != null ? `${r.query} M/s` : "NA"}</td>
                  <td>{r.error != null ? `${r.error}%` : "NA"}</td>
                  <td>
                    <ScoreBar score={r.score} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default DecisionSupport;
