import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { loadBenchmarkData } from "../utils/loadJson";
import {
  formatConfig,
  insertMops,
  queryMops,
  fmtMemory,
  accuracyRows,
} from "../utils/metrics";
import "./ResultDetails.css";

function fmtNum(v, digits = 4) {
  if (v == null) return "—";
  if (Number.isInteger(v)) return v.toLocaleString();
  return v.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function ci95(arr) {
  if (!arr || arr.length < 2) return null;
  return `CI95 [${arr[0].toFixed(1)}, ${arr[1].toFixed(1)}]`;
}

function Stat({ label, value, sub }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

function Card({ title, children }) {
  return (
    <section className="detail-card">
      <h2>{title}</h2>
      <div className="stat-grid">{children}</div>
    </section>
  );
}

function ResultDetails() {
  const { index } = useParams();
  const [records, setRecords] = useState(null);

  useEffect(() => {
    loadBenchmarkData().then(setRecords);
  }, []);

  if (records === null) {
    return <div style={{ padding: "20px" }}>Loading…</div>;
  }

  const item = records[Number(index)];
  if (!item) {
    return (
      <div style={{ padding: "20px" }}>
        <p>Run not found.</p>
        <Link to="/results" className="back-link">
          ← Back to Results
        </Link>
      </div>
    );
  }

  const insert = insertMops(item);
  const query = queryMops(item);
  const qStddev = item.bench?.query_throughput_items_per_sec?.stddev;
  const wall = item.bench?.wall_time_ms;
  const cpu = item.bench?.cpu_time_ms;
  const w = item.workload ?? {};
  const accs = accuracyRows(item);

  return (
    <div className="detail-page">
      <Link to="/results" className="back-link">
        ← Back to Results
      </Link>

      <header className="detail-header">
        <h1>
          {item.sketch?.toUpperCase()} · {item.impl}
        </h1>
        <div className="badges">
          <span className="badge">{formatConfig(item)}</span>
          <span className="badge">{w.shape ?? "—"}</span>
          <span className="badge">{item.language ?? "—"}</span>
        </div>
      </header>

      <Card title="Throughput">
        <Stat
          label="Insert throughput"
          value={insert != null ? `${insert.toFixed(2)} M/s` : "—"}
          sub="derived: size ÷ wall time"
        />
        <Stat
          label="Query throughput"
          value={query != null ? `${query.toFixed(2)} M/s` : "—"}
          sub={
            qStddev != null
              ? `± ${(qStddev / 1e6).toFixed(2)} M/s`
              : "mean of runs"
          }
        />
      </Card>

      <Card title="Timing">
        <Stat
          label="Wall time"
          value={wall?.mean != null ? `${wall.mean.toFixed(2)} ms` : "—"}
          sub={
            wall ? `± ${wall.stddev?.toFixed(2)} · ${ci95(wall.ci95)}` : null
          }
        />
        <Stat
          label="CPU user"
          value={
            cpu?.user_ms?.mean != null
              ? `${cpu.user_ms.mean.toFixed(2)} ms`
              : "—"
          }
        />
        <Stat
          label="CPU sys"
          value={
            cpu?.sys_ms?.mean != null ? `${cpu.sys_ms.mean.toFixed(2)} ms` : "—"
          }
        />
      </Card>

      <Card title="Memory">
        <Stat
          label="Declared footprint"
          value={fmtMemory(item.bench?.memory_bytes)}
          sub="sketch's own size"
        />
        <Stat
          label="Heap in-use"
          value={
            item.bench?.heap_allocated_kb != null
              ? fmtMemory(item.bench.heap_allocated_kb * 1024)
              : "—"
          }
          sub="jemalloc at run end"
        />
        <Stat
          label="RSS peak"
          value={
            item.bench?.rss_peak_kb != null
              ? fmtMemory(item.bench.rss_peak_kb * 1024)
              : "—"
          }
          sub="process high-water mark"
        />
      </Card>

      <Card title="Accuracy">
        {accs.length ? (
          accs.map((a) => (
            <Stat key={a.label} label={a.label} value={fmtNum(a.value)} />
          ))
        ) : (
          <Stat label="Accuracy" value="N/A" sub="baseline / no comparator" />
        )}
      </Card>

      <Card title="Run setup">
        <Stat label="Workload" value={w.shape ?? "—"} />
        <Stat label="Size" value={fmtNum(w.size)} />
        <Stat label="Cardinality" value={fmtNum(w.cardinality)} />
        {w.zipf_s != null && <Stat label="Zipf s" value={w.zipf_s} />}
        <Stat label="Seed" value={w.seed ?? "—"} />
        <Stat label="Runs" value={item.runs ?? "—"} />
        <Stat label="Language" value={item.language ?? "—"} />
        <Stat label="Source" value={item.source ?? "—"} />
        <Stat
          label="Schema"
          value={item.schema_version != null ? `v${item.schema_version}` : "—"}
        />
        <Stat label="Timestamp" value={item.timestamp ?? "—"} />
      </Card>

      <details className="raw">
        <summary>Raw record</summary>
        <pre>{JSON.stringify(item, null, 2)}</pre>
      </details>
    </div>
  );
}

export default ResultDetails;
