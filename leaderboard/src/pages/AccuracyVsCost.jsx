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
  Legend,
} from "recharts";

import "./AccuracyVsCost.css";

function AccuracyVsCost() {
  const [results, setResults] = useState([]);
  const [selectedMetric, setSelectedMetric] = useState("memory");
  const [selectedSketches, setSelectedSketches] = useState([]);
  const [xAxisScale, setXAxisScale] = useState("log");
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

  function getMemoryUnit(maxBytes) {
    if (maxBytes >= 1024 * 1024 * 1024) {
      return {
        unit: "GB",
        divisor: 1024 * 1024 * 1024,
      };
    }

    if (maxBytes >= 1024 * 1024) {
      return {
        unit: "MB",
        divisor: 1024 * 1024,
      };
    }

    return {
      unit: "KB",
      divisor: 1024,
    };
  }

  function generateLogTicks(min, max) {
    if (min <= 0 || max <= 0) return [];

    const ticks = [];

    // Start from the power of 2 just below or equal to min
    let tick = 2 ** Math.floor(Math.log2(min));

    while (tick <= max) {
      if (tick >= min) {
        ticks.push(tick);
      }

      tick *= 2;
    }

    return ticks;
  }

  // X-axis label based on the selected metric
  function getXAxisLabel(metric) {
    switch (metric) {
      case "memory":
        return "Memory";

      case "query":
        return "Query Throughput (Million items/sec)";

      default:
        return "";
    }
  }

  // Y-axis label and formatter based on the selected sketches
  function getYAxisConfig() {
    if (
      selectedSketches.includes("cms") ||
      selectedSketches.includes("countsketch")
    ) {
      return {
        label: "Accuracy (%)",
        formatter: (error) => Math.max(0, 100 - error),
      };
    }

    if (selectedSketches.includes("hll")) {
      return {
        label: "Relative Error",
        formatter: (error) => error,
      };
    }

    if (selectedSketches.includes("kll")) {
      return {
        label: "Mean Rank Error",
        formatter: (error) => error,
      };
    }

    return {
      label: "Value",
      formatter: (error) => error,
    };
  }

  function getAccuracyValue(item) {
    switch (item.sketch) {
      case "cms":
      case "countsketch":
        return item.accuracy?.relative_error_mean ?? null;

      case "hll":
        return item.accuracy?.relative_error ?? null;

      case "kll":
        return item.accuracy?.mean_rank_err ?? null;

      default:
        return null;
    }
  }

  const chartData = results
    .map((item) => {
      const cost = getCostValue(item, selectedMetric);
      const error = getAccuracyValue(item);
      const yAxis = getYAxisConfig();

      if (cost == null || error == null) return null;

      return {
        x: cost,
        y: yAxis.formatter(error),

        sketch: item.sketch,
        implementation: item.impl,
        language: item.language,
      };
    })
    .filter(Boolean);

  const sketches = [...new Set(results.map((item) => item.sketch))];

  const filteredData =
    selectedSketches.length === 0
      ? []
      : chartData.filter((item) => selectedSketches.includes(item.sketch));

  const skippedPoints = filteredData.filter(
    (item) => xAxisScale === "log" && item.x <= 0,
  );

  const groupedData = {};
  const plottedData = filteredData.filter(
    (item) => selectedMetric !== "memory" || item.x > 0,
  );

  const positiveXValues = plottedData
    .map((item) => item.x)
    .filter((value) => value > 0);

  const logTicks =
    selectedMetric === "memory" &&
    xAxisScale === "log" &&
    positiveXValues.length > 0
      ? generateLogTicks(
          Math.min(...positiveXValues),
          Math.max(...positiveXValues),
        )
      : undefined;

  const maxMemoryBytes =
    selectedMetric === "memory" && filteredData.length > 0
      ? Math.max(...filteredData.map((item) => item.x))
      : 0;

  const memoryScale = getMemoryUnit(maxMemoryBytes);

  plottedData.forEach((item) => {
    if (!groupedData[item.implementation]) {
      groupedData[item.implementation] = [];
    }

    groupedData[item.implementation].push(item);
  });

  function toggleSketch(sketch) {
    const sketchGroup =
      sketch === "cms" || sketch === "countsketch"
        ? "frequency"
        : sketch === "hll"
          ? "cardinality"
          : "quantile";

    // Remove if already selected
    if (selectedSketches.includes(sketch)) {
      setSelectedSketches(selectedSketches.filter((s) => s !== sketch));
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
      setSelectedSketches([...selectedSketches, sketch]);
    } else {
      setMessage(
        "These sketches estimate different statistics and cannot be compared together.",
      );

      setTimeout(() => {
        setMessage("");
      }, 3000);
    }
  }

  function formatMemory(value) {
    if (value >= 1024 ** 3) {
      return `${(value / 1024 ** 3).toFixed(2)} GB`;
    }

    if (value >= 1024 ** 2) {
      return `${(value / 1024 ** 2).toFixed(2)} MB`;
    }

    if (value >= 1024) {
      return `${(value / 1024).toFixed(2)} KB`;
    }

    return `${value} B`;
  }

  const implementationColors = {
    oxide: "#1f77b4",
    datasketches: "#ff7f0e",
    exact: "#2ca02c",
    polars: "#d62728",
    lib: "#9467bd",
    "lib-vector2d-fast": "#8c564b",
    "lib-vector2d-regular": "#e377c2",
    "lib-fastpath-parallel": "#7f7f7f",
    "lib-fixedmatrix-fast": "#bcbd22",
    "lib-hip": "#17becf",
  };

  const yAxis = getYAxisConfig();
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

        <label>
          <strong>X-Axis Scale:</strong>
        </label>

        <select
          className="metric-select"
          value={xAxisScale}
          onChange={(e) => setXAxisScale(e.target.value)}
        >
          <option value="linear">Linear</option>
          <option value="log">Logarithmic</option>
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

      {message && <div className="warning-message">{message}</div>}
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
              scale={xAxisScale}
              name={getXAxisLabel(selectedMetric)}
              domain={
                xAxisScale === "log" ? ["dataMin", "dataMax"] : ["auto", "auto"]
              }
              ticks={xAxisScale === "log" ? logTicks : undefined}
              allowDataOverflow={xAxisScale === "log"}
              label={{
                value: getXAxisLabel(selectedMetric),
                position: "insideBottom",
                offset: -10,
              }}
              tickFormatter={
                selectedMetric === "memory" ? formatMemory : undefined
              }
            />

            <YAxis
              type="number"
              dataKey="y"
              name={yAxis.label}
              domain={["auto", "auto"]}
              label={{
                value: yAxis.label,
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
                      <strong>
                        {selectedMetric === "memory"
                          ? "Memory"
                          : getXAxisLabel(selectedMetric)}
                        :
                      </strong>{" "}
                      {selectedMetric === "memory"
                        ? formatMemory(point.x)
                        : point.x.toFixed(2)}
                    </div>

                    <div>
                      <strong>{yAxis.label}:</strong> {point.y.toFixed(4)}
                    </div>
                  </div>
                );
              }}
            />

            <Legend verticalAlign="top" align="center" height={36} />

            {Object.entries(groupedData).map(([impl, data]) => (
              <Scatter
                key={impl}
                name={impl}
                data={data}
                fill={implementationColors[impl] || "#8884d8"}
              />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {selectedMetric === "memory" && skippedPoints.length > 0 && (
        <details className="skipped-points">
          <summary>
            Skipped data points with invalid memory values (
            {skippedPoints.length})
          </summary>

          <div className="skipped-points-content">
            {skippedPoints.map((point, index) => (
              <div key={`${point.sketch}-${point.implementation}-${index}`}>
                <strong>{point.sketch.toUpperCase()}</strong>
                {" — "}
                {point.implementation}
                {" — "}
                Memory: {point.x} Bytes
              </div>
            ))}
          </div>
        </details>
      )}

      <hr />

      <div className="summary-section">
        <h3>Dataset Summary</h3>

        <p>Total Records Loaded: {results.length}</p>

        <p>Points Plotted: {plottedData.length}</p>

        <p>Skipped Points: {skippedPoints.length}</p>

        <p>
          Current Cost Metric: {getXAxisLabel(selectedMetric, memoryScale.unit)}
        </p>

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
