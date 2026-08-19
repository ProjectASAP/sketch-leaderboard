import { useMemo, useState } from "react";
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
import { useBenchmarkData } from "../hooks/useBenchmarkData";
import "./ResultTable.css";

function formatConfig(item) {
  const params = item.sketch_config?.params;
  if (!params || Object.keys(params).length === 0) return "default";
  return Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
}

function insertMops(item) {
  const ins = item.insert_throughput_items_per_sec?.mean;
  return ins ? +(ins / 1e6).toFixed(3) : null;
}

function queryMops(item) {
  const q = item.query_throughput_items_per_sec?.mean;
  return q ? +(q / 1e6).toFixed(3) : null;
}

function accuracyFor(item) {
  const acc = item.accuracy;
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
      return "Relative Error";
    case "kll":
      return "Mean Rank Error";
    case "cms":
    case "countsketch":
      return "Relative Error Mean";
    default:
      return "Accuracy Error";
  }
}

function memoryUnit(maxKb) {
  if (maxKb >= 1024 * 1024) return "GB";
  if (maxKb >= 1024) return "MB";
  return "KB";
}

function memoryDivisor(unit) {
  if (unit === "GB") return 1024 * 1024;
  if (unit === "MB") return 1024;
  return 1;
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

function StackedChart({
  title,
  data,
  dataKeys,
  yLabel,
  lowerIsBetter,
  logScale,
}) {
  const scale = logScale ? "log" : "auto";
  const domain = logScale ? ["auto", "auto"] : [0, "auto"];

  return (
    <div style={{ width: "100%" }}>
      <h3 style={{ marginBottom: "8px", fontSize: "1.1em" }}>
        {title}
        {lowerIsBetter && (
          <span
            style={{ fontWeight: "normal", color: "#888", fontSize: "0.85em" }}
          >
            {" "}
            (lower is better)
          </span>
        )}
      </h3>
      <ResponsiveContainer width="100%" height={360}>
        <BarChart
          data={data}
          margin={{ top: 10, right: 30, left: 70, bottom: 90 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="impl"
            tick={{ fontSize: 14, fontWeight: 500 }}
            angle={-35}
            textAnchor="end"
            interval={0}
            label={{
              value: "Implementation",
              position: "insideBottom",
              offset: -70,
              style: { fontSize: 14, fill: "#333", fontWeight: 600 },
            }}
          />
          <YAxis
            scale={scale}
            domain={domain}
            allowDataOverflow
            tick={{ fontSize: 14, fontWeight: 500 }}
            width={60}
            label={{
              value: yLabel,
              angle: -90,
              position: "insideLeft",
              offset: -50,
              style: { fontSize: 14, fill: "#333", fontWeight: 600 },
            }}
          />
          <Tooltip
            formatter={(v, name) => [v != null ? v : "—", name]}
            contentStyle={{ fontSize: "13px" }}
          />
          {dataKeys.length > 1 && (
            <Legend
              verticalAlign="top"
              iconSize={12}
              wrapperStyle={{ fontSize: "13px" }}
            />
          )}
          {dataKeys.map(({ key, color, name }, i) => (
            <Bar
              key={key}
              dataKey={key}
              name={name}
              fill={color ?? IMPL_COLORS[i]}
              radius={[4, 4, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function Visualization() {
  const { records } = useBenchmarkData();
  const [selectedSketch, setSelectedSketch] = useState("");
  const [selectedWorkload, setSelectedWorkload] = useState("all");
  const [selectedConfig, setSelectedConfig] = useState("");
  const [logScale, setLogScale] = useState(false);

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
          (selectedWorkload === "all" ||
            r.workload?.shape === selectedWorkload),
      ),
    [records, sketch, config, selectedWorkload],
  );

  // Aggregate absolute means by impl
  const byImpl = useMemo(() => {
    const map = {};
    for (const r of filtered) {
      const key = r.impl;
      if (!map[key])
        map[key] = { impl: key, inserts: [], queries: [], mems: [], accs: [] };
      const ins = insertMops(r);
      const q = queryMops(r);
      const m = r.insert_heap_allocated_kb;
      const a = accuracyFor(r);
      if (ins != null) map[key].inserts.push(ins);
      if (q != null) map[key].queries.push(q);
      if (m != null) map[key].mems.push(m);
      if (a != null) map[key].accs.push(a);
    }
    return Object.values(map)
      .map((d) => ({
        impl: d.impl,
        insert: d.inserts.length
          ? +(d.inserts.reduce((a, b) => a + b, 0) / d.inserts.length).toFixed(
              3,
            )
          : null,
        query: d.queries.length
          ? +(d.queries.reduce((a, b) => a + b, 0) / d.queries.length).toFixed(
              3,
            )
          : null,
        memoryKb: d.mems.length
          ? +(d.mems.reduce((a, b) => a + b, 0) / d.mems.length).toFixed(1)
          : null,
        accuracy: d.accs.length
          ? +(d.accs.reduce((a, b) => a + b, 0) / d.accs.length).toFixed(4)
          : null,
      }))
      .sort((a, b) => (b.query ?? 0) - (a.query ?? 0));
  }, [filtered]);

  // Auto-scale memory unit based on max value
  const unit = useMemo(() => {
    const maxKb = Math.max(0, ...byImpl.map((r) => r.memoryKb ?? 0));
    return memoryUnit(maxKb);
  }, [byImpl]);

  const memoryData = useMemo(() => {
    const div = memoryDivisor(unit);
    return byImpl.map((r) => ({
      ...r,
      memory: r.memoryKb != null ? +(r.memoryKb / div).toFixed(3) : null,
    }));
  }, [byImpl, unit]);

  const hasAccuracy = byImpl.some((r) => r.accuracy != null);
  const hasMemory = byImpl.some((r) => r.memoryKb != null);

  return (
    <div style={{ padding: "20px" }}>
      <h1>Visualization</h1>
      <p>Multi-metric comparison across implementations.</p>

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

      <div
        style={{
          display: "flex",
          gap: "20px",
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: "16px",
        }}
      >
        {workloads.length > 0 && (
          <label>
            Workload:{" "}
            <select
              value={selectedWorkload}
              onChange={(e) => setSelectedWorkload(e.target.value)}
            >
              <option value="all">All</option>
              {workloads.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
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
                <option key={c} value={c}>
                  {c}
                </option>
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

      <p style={{ color: "#555", fontSize: "0.9em", marginBottom: "28px" }}>
        {sketch.toUpperCase()}
        {config !== "default" ? ` · ${config}` : ""}
        {selectedWorkload !== "all" ? ` · ${selectedWorkload}` : ""} —{" "}
        {byImpl.length} implementation{byImpl.length === 1 ? "" : "s"}
        {filtered.length !== byImpl.length
          ? `, ${filtered.length} records averaged`
          : ""}
      </p>

      {byImpl.length === 0 ? (
        <p style={{ color: "#888" }}>No data for this selection.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "48px" }}>
          <StackedChart
            title="Throughput"
            data={byImpl}
            dataKeys={[
              { key: "insert", name: "Insert", color: "#4f86c6" },
              { key: "query", name: "Query", color: "#42b883" },
            ]}
            yLabel="M items/s"
            logScale={logScale}
          />
          {hasMemory && (
            <StackedChart
              title="Memory (heap)"
              data={memoryData}
              dataKeys={[{ key: "memory", name: "Heap", color: "#e06c75" }]}
              yLabel={unit}
              logScale={logScale}
            />
          )}
          {hasAccuracy && selectedWorkload === "all" && (
            <div
              style={{
                padding: "16px 20px",
                background: "#f5f5f5",
                borderRadius: "8px",
                border: "1px solid #e0e0e0",
              }}
            >
              <strong>{accuracyLabel(sketch)}</strong>
              <p
                style={{ margin: "6px 0 0", color: "#666", fontSize: "0.9em" }}
              >
                Select a specific workload above to compare error rates —
                averaging across workloads with very different characteristics
                gives misleading results.
              </p>
            </div>
          )}
          {hasAccuracy && selectedWorkload !== "all" && (
            <StackedChart
              title={accuracyLabel(sketch)}
              data={byImpl}
              dataKeys={[{ key: "accuracy", name: "Error", color: "#e5c07b" }]}
              yLabel="% relative error"
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
