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
  const [selectedSketch, setSelectedSketch] = useState("all");

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
        return item.bench?.memory_bytes ?? null;

      case "query":
        return item.bench?.query_throughput_items_per_sec?.mean
          ? item.bench.query_throughput_items_per_sec.mean / 1000000
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
      const error = item.bench?.accuracy?.relative_error_mean;

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

  const sketches = [
    "all",
    ...new Set(results.map((item) => item.sketch)),
  ];

  const filteredData = chartData.filter(
    (item) =>
      selectedSketch === "all" ||
      item.sketch === selectedSketch
  );

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

        <label style={{ marginLeft: "20px" }}>
          <strong>Sketch:</strong>
        </label>

        <select
          className="metric-select"
          value={selectedSketch}
          onChange={(e) => setSelectedSketch(e.target.value)}
        >
          {sketches.map((sketch) => (
            <option key={sketch} value={sketch}>
              {sketch.toUpperCase()}
            </option>
          ))}
        </select>
      </div>

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
                typeof value === "number"
                  ? value.toFixed(2)
                  : value,
                name,
              ]}
              content={({ active, payload }) => {
                if (!active || !payload || payload.length === 0)
                  return null;

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
                      <strong>Accuracy:</strong>{" "}
                      {point.y.toFixed(2)}%
                    </div>
                  </div>
                );
              }}
            />

            <Scatter
              data={filteredData}
              fill="#1976d2"
            />
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
          Selected Sketch:{" "}
          {selectedSketch === "all"
            ? "All Sketches"
            : selectedSketch.toUpperCase()}
        </p>
      </div>
    </div>
  );
}

export default AccuracyVsCost;