import { useEffect, useState } from "react";
import { loadBenchmarkData } from "../utils/loadJson";

import {
  ScatterChart,
  Scatter,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import "./AccuracyVsCost.css";

function AccuracyVsCost() {
  const [results, setResults] = useState([]);
  const [selectedMetric, setSelectedMetric] = useState("memory");
  const [selectedSketches, setSelectedSketches] = useState([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function fetchData() {
      const data = await loadBenchmarkData();
      setResults(data);
    }

    fetchData();
  }, []);

  function getCostValue(item, metric) {
    switch (metric) {
      case "memory":
        return item.memory_bytes ?? null;

      case "query":
        return item.query_throughput_items_per_sec?.mean
          ? item.query_throughput_items_per_sec.mean / 1000000
          : null;

      default:
        return null;
    }
  }

  function getXAxisLabel(metric) {
    switch (metric) {
      case "memory":
        return "Memory (Bytes)";

      case "query":
        return "Query Throughput (Million items/sec)";

      default:
        return "";
    }
  }

  const chartData = results
    .map((item) => {
      const cost = getCostValue(item, selectedMetric);
      const error = item.accuracy?.relative_error_mean;

      if (cost == null || error == null) return null;

      return {
        x: cost,
        y: Math.max(0, 100 - error),

        sketch: item.sketch,
        implementation: item.impl,
        language: item.language,
      };
    })
    .filter(Boolean);

  const sketches = [...new Set(results.map((item) => item.sketch))];

  const filteredData =
    selectedSketches.length === 0
      ? chartData
      : chartData.filter((item) =>
        selectedSketches.includes(item.sketch),
      );


  function toggleSketch(sketch) {
    const sketchGroup =
      sketch === "cms" || sketch === "countsketch"
        ? "frequency"
        : sketch === "hll"
          ? "cardinality"
          : "quantile";

    // Remove if already selected
    if (selectedSketches.includes(sketch)) {
      setSelectedSketches(
        selectedSketches.filter((s) => s !== sketch)
      );
      return;
    }

    // No sketches selected
    if (selectedSketches.length === 0) {
      setSelectedSketches([sketch]);
      return;
    }

    // Find current group
    const currentGroup =
      selectedSketches.includes("cms") ||
        selectedSketches.includes("countsketch")
        ? "frequency"
        : selectedSketches.includes("hll")
          ? "cardinality"
          : "quantile";

    // Allow only sketches from the same statistic
    if (currentGroup === sketchGroup) {
      setSelectedSketches([
        ...selectedSketches,
        sketch,
      ]);
    } else {
      setMessage(
        "These sketches estimate different statistics and cannot be compared together."
      );

      setTimeout(() => {
        setMessage("");
      }, 3000);
    }
  }

  return (
    <div className="accuracy-container">
      <h1>Accuracy vs Cost Tradeoff</h1>

      <p className="page-description">
        Compare the tradeoff between sketch accuracy and different cost metrics.
      </p>

      <hr />

      <div className="control-panel">
        <label>
          <strong>Cost Metric:</strong>
        </label>

        <select
          className="metric-select"
          value={selectedMetric}
          onChange={(e) => setSelectedMetric(e.target.value)}
        >
          <option value="memory">Memory</option>
          <option value="query">Query Throughput</option>
        </select>

        <div className="sketch-filter">
          <strong>Sketches:</strong>

          {sketches.map((sketch) => (
            <label key={sketch} className="checkbox-label">
              <input
                type="checkbox"
                checked={selectedSketches.includes(sketch)}
                onChange={() => toggleSketch(sketch)}
              />
              {sketch.toUpperCase()}
            </label>
          ))}
        </div>
      </div>

      {message && (
        <div className="warning-message">
          {message}
        </div>
      )}
      <hr />

      <div className="chart-container">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart
            margin={{
              top: 20,
              right: 20,
              bottom: 20,
              left: 20,
            }}
          >
            <CartesianGrid />

            <XAxis
              type="number"
              dataKey="x"
              name={getXAxisLabel(selectedMetric)}
              label={{
                value: getXAxisLabel(selectedMetric),
                position: "insideBottom",
                offset: -10,
              }}
            />

            <YAxis
              type="number"
              dataKey="y"
              name="Accuracy (%)"
              domain={[0, 100]}
              label={{
                value: "Accuracy (%)",
                angle: -90,
                position: "insideLeft",
              }}
            />

            <Tooltip
              formatter={(value, name) => [
                typeof value === "number" ? value.toFixed(2) : value,
                name,
              ]}
              content={({ active, payload }) => {
                if (!active || !payload || payload.length === 0) return null;

                const point = payload[0].payload;

                return (
                  <div
                    style={{
                      background: "white",
                      border: "1px solid #ccc",
                      padding: "10px",
                      borderRadius: "6px",
                    }}
                  >
                    <strong>{point.sketch.toUpperCase()}</strong>

                    <br />

                    {point.implementation}

                    <br />

                    {point.language}

                    <hr />

                    <div>
                      <strong>{getXAxisLabel(selectedMetric)}:</strong>{" "}
                      {selectedMetric === "memory"
                        ? point.x
                        : point.x.toFixed(2)}
                    </div>

                    <div>
                      <strong>Accuracy:</strong> {point.y.toFixed(2)}%
                    </div>
                  </div>
                );
              }}
            />

            <Scatter data={filteredData} fill="#1976d2" />
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      <hr />

      <div className="summary-section">
        <h3>Dataset Summary</h3>

        <p>Total Records Loaded: {results.length}</p>

        <p>Points Plotted: {filteredData.length}</p>

        <p>Current Cost Metric: {getXAxisLabel(selectedMetric)}</p>

        <p>
          Selected Sketches:{" "}
          {selectedSketches.length === 0
            ? "None"
            : selectedSketches.join(", ").toUpperCase()}
        </p>
      </div>
    </div>
  );
}

export default AccuracyVsCost;
