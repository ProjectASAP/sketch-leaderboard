import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { loadBenchmarkData } from "../utils/loadJson";
import "./ResultTable.css";

function ResultTable() {
  const [results, setResults] = useState([]);

  useEffect(() => {
    async function fetchData() {
      const data = await loadBenchmarkData();
      setResults(data);
    }

    fetchData();
  }, []);

  return (
    <div style={{ padding: "20px" }}>
      <h1>Benchmark Results</h1>

      <p>Total Records: {results.length}</p>

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
            <th>Wall Time (ms)</th>
            <th>Query Throughput</th>
            <th>Accuracy (%)</th>
            <th>Details</th>
          </tr>
        </thead>

        <tbody>
          {results.map((item, index) => (
            <tr key={index}>
              <td>{item.sketch}</td>

              <td>{item.impl}</td>

              <td>{item.language}</td>

              <td>{item.workload?.shape ?? "-"}</td>

              <td>{item.workload?.size?.toLocaleString() ?? "-"}</td>

              <td>{item.workload?.cardinality?.toLocaleString() ?? "-"}</td>

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
                      {
                        maximumFractionDigits: 0,
                      },
                    )
                  : "-"}
              </td>

              <td>
                {item.bench?.accuracy?.relative_error_mean
                  ? `${item.bench.accuracy.relative_error_mean.toFixed(2)}%`
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
