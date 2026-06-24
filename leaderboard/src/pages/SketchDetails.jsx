import { useEffect, useMemo, useState } from "react";
import { loadBenchmarkData } from "../utils/loadJson";
import DetailsModal from "../components/DetailsModal";
import "./ResultTable.css";

// Each sketch family reports accuracy under a different field, so the
// "right" accuracy metric depends on which sketch we're looking at.
function accuracyFor(item) {
  const acc = item.bench?.accuracy;
  if (!acc) return { value: null, label: "-" };

  switch (item.sketch) {
    case "hll":
      return { value: acc.relative_error, label: "rel-err" };
    case "kll":
      return { value: acc.mean_rank_err, label: "mean-rank-err" };
    case "cms":
    case "countsketch":
      return { value: acc.relative_error_mean, label: "rel-err-mean" };
    default:
      return {
        value:
          acc.relative_error ?? acc.mean_rank_err ?? acc.relative_error_mean,
        label: "accuracy",
      };
  }
}

function formatConfig(item) {
  const params = item.sketch_config?.params;
  if (!params || Object.keys(params).length === 0) return "-";
  return Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
}

function SketchDetails() {
  const [records, setRecords] = useState([]);
  const [selectedSketch, setSelectedSketch] = useState("");
  const [workload, setWorkload] = useState("all");
  const [selectedRecord, setSelectedRecord] = useState(null);

  useEffect(() => {
    loadBenchmarkData().then(setRecords);
  }, []);

  const families = useMemo(
    () => [...new Set(records.map((r) => r.sketch))].sort(),
    [records],
  );

  // Active family is the user's choice, falling back to the first available.
  // Deriving it (rather than syncing via an effect) keeps it in step with data.
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

  const rows = useMemo(
    () =>
      records.filter(
        (r) =>
          r.sketch === sketch &&
          (workload === "all" || r.workload?.shape === workload),
      ),
    [records, sketch, workload],
  );

  return (
    <div style={{ padding: "20px" }}>
      <h1>Sketch Details</h1>
      <p>Detailed benchmark results for a single sketch family.</p>

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
              setWorkload("all");
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

      {workloads.length > 0 && (
        <label style={{ display: "inline-block", marginBottom: "12px" }}>
          Workload:{" "}
          <select
            value={workload}
            onChange={(e) => setWorkload(e.target.value)}
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

      <p>
        Showing {rows.length} result{rows.length === 1 ? "" : "s"}
        {sketch ? ` for "${sketch}"` : ""}.
      </p>

      <table className="results-table">
        <thead>
          <tr>
            <th>Implementation</th>
            <th>Config</th>
            <th>Workload</th>
            <th>Memory</th>
            <th>Wall Time (ms)</th>
            <th>Query Throughput</th>
            <th>Accuracy</th>
            <th>Details</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((item, index) => {
            const acc = accuracyFor(item);
            return (
              <tr key={index}>
                <td>{item.impl}</td>

                <td>{formatConfig(item)}</td>

                <td>{item.workload?.shape ?? "-"}</td>

                <td>
                  {item.bench?.memory_bytes
                    ? `${(item.bench.memory_bytes / 1024).toFixed(1)} KB`
                    : "-"}
                </td>

                <td>
                  {item.bench?.wall_time_ms?.mean
                    ? item.bench.wall_time_ms.mean.toFixed(2)
                    : "-"}
                </td>

                <td>
                  {item.bench?.query_throughput_items_per_sec?.mean
                    ? item.bench.query_throughput_items_per_sec.mean.toLocaleString(
                        undefined,
                        { maximumFractionDigits: 0 },
                      )
                    : "-"}
                </td>

                <td>
                  {acc.value != null
                    ? `${acc.value.toFixed(4)} (${acc.label})`
                    : "-"}
                </td>

                <td>
                  <button onClick={() => setSelectedRecord(item)}>View</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <DetailsModal
        data={selectedRecord}
        onClose={() => setSelectedRecord(null)}
      />
    </div>
  );
}

export default SketchDetails;
