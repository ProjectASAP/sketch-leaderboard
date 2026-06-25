import { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { loadBenchmarkData } from "../utils/loadJson";
import "./ResultTable.css";

function formatConfig(item) {
  const params = item.sketch_config?.params;
  if (!params || Object.keys(params).length === 0) return "default";
  return Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
}

function insertMops(item) {
  const wall = item.bench?.wall_time_ms?.mean;
  const size = item.workload?.size;
  if (!wall || !size) return null;
  return +(size / (wall / 1000) / 1e6).toFixed(3);
}

function queryMops(item) {
  const q = item.bench?.query_throughput_items_per_sec?.mean;
  return q ? +(q / 1e6).toFixed(3) : null;
}

function accuracyFor(item) {
  const acc = item.bench?.accuracy;
  if (!acc) return null;
  switch (item.sketch) {
    case "hll":
      return acc.relative_error != null ? +acc.relative_error.toFixed(4) : null;
    case "kll":
      return acc.mean_rank_err != null ? +acc.mean_rank_err.toFixed(4) : null;
    case "cms":
    case "countsketch":
      return acc.relative_error_mean != null
        ? +acc.relative_error_mean.toFixed(4)
        : null;
    default:
      return null;
  }
}

function accuracyLabel(sketch) {
  switch (sketch) {
    case "hll":
      return "Relative error";
    case "kll":
      return "Mean rank error";
    case "cms":
    case "countsketch":
      return "Relative error mean";
    default:
      return "Accuracy";
  }
}

const IMPL_COLORS = [
  "#4f86c6",
  "#42b883",
  "#e06c75",
  "#e5c07b",
  "#c678dd",
  "#56b6c2",
  "#98c379",
  "#d19a66",
  "#be5046",
  "#61afef",
];

function MiniChart({ title, data, dataKeys, yLabel, lowerIsBetter, logScale }) {
  const scale = logScale ? "log" : "auto";
  const domain = logScale ? ["auto", "auto"] : [0, "auto"];

  return (
    <div style={{ flex: 1, minWidth: "280px" }}>
      <h3 style={{ marginBottom: "4px", fontSize: "1em" }}>
        {title}
        {lowerIsBetter && (
          <span style={{ fontWeight: "normal", color: "#888", fontSize: "0.85em" }}>
            {" "}(lower is better)
          </span>
        )}
      </h3>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="impl"
            tick={{ fontSize: 11 }}
            angle={-35}
            textAnchor="end"
            interval={0}
          />
          <YAxis
            scale={scale}
            domain={domain}
            allowDataOverflow
            tick={{ fontSize: 11 }}
            label={{
              value: yLabel,
              angle: -90,
              position: "insideLeft",
              offset: 10,
              style: { fontSize: 11, fill: "#555" },
            }}
          />
          <Tooltip formatter={(v) => (v != null ? v : "—")} />
          {dataKeys.length > 1 && <Legend verticalAlign="top" iconSize={10} />}
          {dataKeys.map(({ key, color, name }, i) => (
            <Bar key={key} dataKey={key} name={name} fill={color ?? IMPL_COLORS[i]} radius={[3, 3, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function Visualization() {
  const [records, setRecords] = useState([]);
  const [selectedSketch, setSelectedSketch] = useState("");
  const [selectedWorkload, setSelectedWorkload] = useState("all");
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

  const workloads = useMemo(
    () =>
      [
        ...new Set(
          records
            .filter((r) => r.sketch === sketch)
            .map((r) => r.workload?.shape),
        ),
      ].filter(Boolean),
    [records, sketch],
  );

  const configs = useMemo(
    () => [
      ...new Set(
        records
          .filter(
            (r) =>
              r.sketch === sketch &&
              (selectedWorkload === "all" ||
                r.workload?.shape === selectedWorkload),
          )
          .map((r) => formatConfig(r)),
      ),
    ],
    [records, sketch, selectedWorkload],
  );
  const config =
    selectedConfig && configs.includes(selectedConfig)
      ? selectedConfig
      : configs[0] || "";

  const filtered = useMemo(
    () =>
      records.filter(
        (r) =>
          r.sketch === sketch &&
          formatConfig(r) === config &&
          (selectedWorkload === "all" || r.workload?.shape === selectedWorkload),
      ),
    [records, sketch, config, selectedWorkload],
  );

  // Aggregate by impl (average across matching records)
  const byImpl = useMemo(() => {
    const map = {};
    for (const r of filtered) {
      const key = r.impl;
      if (!map[key]) map[key] = { impl: key, inserts: [], queries: [], mems: [], accs: [] };
      const ins = insertMops(r);
      const q = queryMops(r);
      const m = r.bench?.heap_allocated_kb;
      const a = accuracyFor(r);
      if (ins != null) map[key].inserts.push(ins);
      if (q != null) map[key].queries.push(q);
      if (m != null) map[key].mems.push(m);
      if (a != null) map[key].accs.push(a);
    }
    return Object.values(map)
      .map((d) => ({
        impl: d.impl,
        insert: d.inserts.length ? +(d.inserts.reduce((a, b) => a + b, 0) / d.inserts.length).toFixed(3) : null,
        query: d.queries.length ? +(d.queries.reduce((a, b) => a + b, 0) / d.queries.length).toFixed(3) : null,
        memory: d.mems.length ? +(d.mems.reduce((a, b) => a + b, 0) / d.mems.length).toFixed(1) : null,
        accuracy: d.accs.length ? +(d.accs.reduce((a, b) => a + b, 0) / d.accs.length).toFixed(4) : null,
      }))
      .sort((a, b) => (b.query ?? 0) - (a.query ?? 0));
  }, [filtered]);

  const hasAccuracy = byImpl.some((r) => r.accuracy != null);

  return (
    <div style={{ padding: "20px" }}>
      <h1>Visualization</h1>
      <p>Multi-metric comparison across implementations.</p>

      {/* Sketch family selector */}
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", margin: "16px 0" }}>
        {families.map((f) => (
          <button
            key={f}
            onClick={() => {
              setSelectedSketch(f);
              setSelectedConfig("");
              setSelectedWorkload("all");
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

      {/* Workload + config filters + log scale toggle */}
      <div style={{ display: "flex", gap: "20px", flexWrap: "wrap", alignItems: "center", marginBottom: "16px" }}>
        {workloads.length > 0 && (
          <label>
            Workload:{" "}
            <select value={selectedWorkload} onChange={(e) => setSelectedWorkload(e.target.value)}>
              <option value="all">All</option>
              {workloads.map((w) => (
                <option key={w} value={w}>{w}</option>
              ))}
            </select>
          </label>
        )}
        {configs.length > 0 && (
          <label>
            Configuration:{" "}
            <select
              value={config}
              onChange={(e) => setSelectedConfig(e.target.value)}
            >
              {configs.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
        )}
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

      <p style={{ color: "#555", fontSize: "0.9em", marginBottom: "20px" }}>
        {sketch.toUpperCase()}
        {config !== "default" ? ` · ${config}` : ""}
        {selectedWorkload !== "all" ? ` · ${selectedWorkload}` : ""} —{" "}
        {byImpl.length} implementation{byImpl.length === 1 ? "" : "s"}
        {filtered.length !== byImpl.length ? `, ${filtered.length} records averaged` : ""}
      </p>

      {byImpl.length === 0 ? (
        <p style={{ color: "#888" }}>No data for this selection.</p>
      ) : (
        <div style={{ display: "flex", gap: "32px", flexWrap: "wrap" }}>
          <MiniChart
            title="Throughput"
            data={byImpl}
            dataKeys={[
              { key: "insert", name: "Insert", color: "#4f86c6" },
              { key: "query", name: "Query", color: "#42b883" },
            ]}
            yLabel="M items/s"
            logScale={logScale}
          />
          <MiniChart
            title="Memory (heap)"
            data={byImpl}
            dataKeys={[{ key: "memory", name: "Heap", color: "#e06c75" }]}
            yLabel="KB"
            logScale={logScale}
          />
          {hasAccuracy && (
            <MiniChart
              title={accuracyLabel(sketch)}
              data={byImpl}
              dataKeys={[{ key: "accuracy", name: "Error", color: "#e5c07b" }]}
              yLabel="error"
              lowerIsBetter
              logScale={logScale}
            />
          )}
        </div>
      )}
    </div>
  );
}

export default Visualization;
