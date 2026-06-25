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

// Insertion throughput isn't stored directly; derive it from the workload
// size and mean wall-clock time (items/sec -> M items/sec).
function insertMops(item) {
  const wall = item.bench?.wall_time_ms?.mean;
  const size = item.workload?.size;
  if (!wall || !size) return null;
  return size / (wall / 1000) / 1e6;
}

function queryMops(item) {
  const q = item.bench?.query_throughput_items_per_sec?.mean;
  return q ? q / 1e6 : null;
}

function ThroughputBar({ value, max, color, logScale }) {
  let pct = 0;
  if (max > 0 && value != null) {
    if (logScale && value > 0 && max > 1) {
      pct = Math.max(2, (Math.log(value) / Math.log(max)) * 100);
    } else {
      pct = Math.max(2, (value / max) * 100);
    }
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <div
        style={{
          flex: 1,
          minWidth: "60px",
          height: "10px",
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
      <span style={{ minWidth: "78px", textAlign: "right" }}>
        {value != null ? `${value.toFixed(2)} M/s` : "-"}
      </span>
    </div>
  );
}

function Throughput() {
  const [records, setRecords] = useState([]);
  const [selectedSketch, setSelectedSketch] = useState("");
  const [selectedConfig, setSelectedConfig] = useState("");
  const [logScale, setLogScale] = useState(false);

  useEffect(() => {
    loadBenchmarkData().then(setRecords);
  }, []);

  const families = useMemo(
    () => [...new Set(records.map((r) => r.sketch))].sort(),
    [records],
  );
  const sketch = selectedSketch || families[0] || "";

  const configs = useMemo(
    () => [
      ...new Set(
        records.filter((r) => r.sketch === sketch).map((r) => formatConfig(r)),
      ),
    ],
    [records, sketch],
  );
  // Keep the chosen config only if it exists for this sketch, else fall back.
  const config =
    selectedConfig && configs.includes(selectedConfig)
      ? selectedConfig
      : configs[0] || "";

  const rows = useMemo(
    () =>
      records
        .filter((r) => r.sketch === sketch && formatConfig(r) === config)
        .map((r) => ({
          impl: r.impl,
          workload: r.workload?.shape ?? "-",
          insert: insertMops(r),
          query: queryMops(r),
        })),
    [records, sketch, config],
  );

  const maxInsert = Math.max(1, ...rows.map((r) => r.insert ?? 0));
  const maxQuery = Math.max(1, ...rows.map((r) => r.query ?? 0));

  return (
    <div style={{ padding: "20px" }}>
      <h1>Throughput</h1>
      <p>
        Insertion and query throughput for a given sketch and configuration.
      </p>

      <div
        style={{
          display: "flex",
          gap: "10px",
          flexWrap: "wrap",
          margin: "16px 0",
        }}
      >
        {families.map((f) => (
          <button
            key={f}
            onClick={() => {
              setSelectedSketch(f);
              setSelectedConfig("");
            }}
            style={{
              padding: "8px 16px",
              borderRadius: "6px",
              border: "1px solid #ccc",
              cursor: "pointer",
              fontWeight: f === sketch ? "bold" : "normal",
              background: f === sketch ? "#222" : "#fff",
              color: f === sketch ? "#fff" : "#222",
              textTransform: "uppercase",
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {configs.length > 0 && (
        <label style={{ display: "inline-block", marginBottom: "16px" }}>
          Configuration:{" "}
          <select
            value={config}
            onChange={(e) => setSelectedConfig(e.target.value)}
          >
            {configs.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "8px",
          marginBottom: "8px",
        }}
      >
        <p style={{ margin: 0 }}>
          {sketch ? sketch.toUpperCase() : ""}
          {config ? ` · ${config}` : ""} — {rows.length} run
          {rows.length === 1 ? "" : "s"}
        </p>
        <button
          onClick={() => setLogScale((v) => !v)}
          style={{
            padding: "4px 12px",
            borderRadius: "6px",
            border: "1px solid #ccc",
            cursor: "pointer",
            background: logScale ? "#222" : "#fff",
            color: logScale ? "#fff" : "#222",
            fontSize: "0.85em",
          }}
        >
          {logScale ? "Log scale" : "Linear scale"}
        </button>
      </div>

      <table className="results-table">
        <thead>
          <tr>
            <th>Implementation</th>
            <th>Workload</th>
            <th>Insert Throughput</th>
            <th>Query Throughput</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((r, index) => (
            <tr key={index}>
              <td>{r.impl}</td>
              <td>{r.workload}</td>
              <td>
                <ThroughputBar
                  value={r.insert}
                  max={maxInsert}
                  color="#4f86c6"
                  logScale={logScale}
                />
              </td>
              <td>
                <ThroughputBar
                  value={r.query}
                  max={maxQuery}
                  color="#42b883"
                  logScale={logScale}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default Throughput;
