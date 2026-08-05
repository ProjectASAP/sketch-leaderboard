import { useBenchmarkData } from "../hooks/useBenchmarkData";
import "./DataHealthGate.css";

// Stands between the provider and the routes so a bad all.jsonl is reported
// rather than rendered around.
//
// Without this, a validation failure is invisible: the provider sets `error`,
// but not one of the seven pages reads it — they all destructure `records`
// alone. So a rejected file leaves records at [] and every page draws its
// empty state, which looks exactly like "no data yet". Detecting corruption
// and then silently swallowing the detection is the failure this component
// exists to prevent.

/**
 * Collapse problems that say the same thing about the same field.
 *
 * A v2 file produces one identical schema_version error on every one of its
 * 357 lines; listing them individually buries the single fact worth reading.
 */
function group(problems) {
  const byKind = new Map();
  for (const p of problems) {
    const key = `${p.field}::${p.message}`;
    const seen = byKind.get(key);
    if (seen) {
      seen.count += 1;
      seen.lastLine = p.line;
    } else {
      byKind.set(key, { ...p, count: 1, firstLine: p.line, lastLine: p.line });
    }
  }
  return [...byKind.values()].sort((a, b) => b.count - a.count);
}

function ProblemList({ items }) {
  return (
    <ul className="data-health__list">
      {items.map((p) => (
        <li key={`${p.field}::${p.message}`}>
          <code className="data-health__field">{p.field}</code>
          <span className="data-health__message">{p.message}</span>
          <span className="data-health__where">
            {p.count > 1
              ? `${p.count} records, first at line ${p.firstLine}`
              : `line ${p.firstLine}`}
          </span>
        </li>
      ))}
    </ul>
  );
}

function FailurePanel({ error }) {
  const problems = error.problems ?? [];
  const errors = group(problems.filter((p) => p.severity === "error"));

  // A file written by a different schema version is not damaged, and saying
  // "corrupted" about it would send someone hunting for a fault that isn't
  // there. It gets its own explanation.
  const versionOnly =
    errors.length > 0 && errors.every((p) => p.field === "schema_version");

  return (
    <div className="data-health data-health--fatal">
      <h1 className="data-health__title">
        {versionOnly
          ? "Benchmark data is the wrong schema version"
          : "Benchmark data failed validation"}
      </h1>

      <p className="data-health__lead">
        {versionOnly ? (
          <>
            <code>data/all.jsonl</code> was written by a different version of{" "}
            <code>approxbench</code>. Nothing is damaged — the file simply
            predates the schema this app reads. Regenerate it with{" "}
            <code>scripts/run_profiles.ps1 -Flat</code> and copy the result into{" "}
            <code>public/data/</code>.
          </>
        ) : (
          <>
            <code>data/all.jsonl</code> is not what <code>approxbench</code>{" "}
            wrote. Rather than rank on values that may be wrong, the pages are
            held back until the file is replaced.
          </>
        )}
      </p>

      {errors.length > 0 && <ProblemList items={errors} />}

      {!problems.length && <p className="data-health__lead">{error.message}</p>}
    </div>
  );
}

function WarningBanner({ problems }) {
  const warnings = group(problems.filter((p) => p.severity === "warning"));
  if (warnings.length === 0) return null;

  return (
    <div className="data-health data-health--warn">
      <strong className="data-health__badge">
        {warnings.length === 1
          ? "1 thing worth checking in the data"
          : `${warnings.length} things worth checking in the data`}
      </strong>
      <ProblemList items={warnings} />
    </div>
  );
}

/**
 * Renders `children` when the data is usable. On a fatal problem it replaces
 * them entirely; on warnings it shows a banner above them.
 */
export function DataHealthGate({ children }) {
  const { problems, loading, error } = useBenchmarkData();

  // Nothing to say yet — the pages already handle an empty record set, so
  // showing them mid-load avoids a flash of panel before the data lands.
  if (loading) return children;

  if (error) return <FailurePanel error={error} />;

  return (
    <>
      <WarningBanner problems={problems} />
      {children}
    </>
  );
}

export default DataHealthGate;
