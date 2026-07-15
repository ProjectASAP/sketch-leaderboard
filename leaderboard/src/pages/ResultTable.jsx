import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { loadBenchmarkData } from "../utils/loadJson";
import "./ResultTable.css";

function ResultTable() {
  const [results, setResults] = useState([]);
  const [sketchFilter, setSketchFilter] = useState("all");

  useEffect(() => {
    async function fetchData() {
      const data = await loadBenchmarkData();
      setResults(data);
    }

    fetchData();
  }, []);

  const families = [...new Set(results.map((r) => r.sketch))].sort();
  // Keep each row's original index so detail links stay correct when filtered.
  const shown = results
    .map((item, index) => ({ item, index }))
    .filter(
      ({ item }) => sketchFilter === "all" || item.sketch === sketchFilter,
    );

  return (
    <div style={{ padding: "20px" }}>
      <h1>Benchmark Results</h1>

      <div style={{ margin: "12px 0" }}>
        <label>
          Sketch:{" "}
          <select
            value={sketchFilter}
            onChange={(e) => setSketchFilter(e.target.value)}
          >
            <option value="all">All</option>
            {families.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p>
        Showing {shown.length} of {results.length} records
      </p>

      <table className="results-table">
        <thead>
          <tr>
            <th>Sketch</th>
            <th>Implementation</th>
            <th>Language</th>
            <th>Workload</th>
            <th>Size</th>
            <th>Cardinality</th>
            <th>Memory</th>
            <th>Insert Wall Time (ms)</th>
            <th>Query Throughput</th>
            <th>Accuracy (%)</th>
            <th>Details</th>
          </tr>
        </thead>

        <tbody>
          {shown.map(({ item, index }) => (
            <tr key={index}>
              <td>{item.sketch}</td>

              <td>{item.impl}</td>

              <td>{item.language}</td>

              <td>{item.workload?.shape ?? "-"}</td>

              <td>{item.workload?.size?.toLocaleString() ?? "-"}</td>

              <td>{item.workload?.cardinality?.toLocaleString() ?? "-"}</td>

              <td>
                {item.memory_bytes
                  ? `${(item.memory_bytes / 1024).toFixed(1)} KB`
                  : "-"}
              </td>

              <td>
                {item.insert_wall_time_ms?.mean
                  ? item.insert_wall_time_ms.mean.toFixed(2)
                  : "-"}
              </td>

              <td>
                {item.query_throughput_items_per_sec?.mean
                  ? item.query_throughput_items_per_sec.mean.toLocaleString(
                      undefined,
                      {
                        maximumFractionDigits: 0,
                      },
                    )
                  : "-"}
              </td>

              <td>
                {item.accuracy?.relative_error_mean
                  ? `${item.accuracy.relative_error_mean.toFixed(2)}%`
                  : "-"}
              </td>

              <td>
                <Link to={`/results/${index}`}>View</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default ResultTable;
