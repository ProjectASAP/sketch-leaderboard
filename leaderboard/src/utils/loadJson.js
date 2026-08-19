import { parseBenchmarkJsonl, SchemaViolation } from "./benchmarkRecord";

// The one place all.jsonl enters the app: every page reads it through
// BenchmarkDataProvider -> useBenchmarkData(), never by fetching itself. That
// makes this the only gate the data passes, so validation belongs here rather
// than in each consumer.
export async function loadBenchmarkData() {
  const response = await fetch(`${import.meta.env.BASE_URL}data/all.jsonl`);

  // A missing data file is served as the SPA's index.html by most static
  // hosts, so without this check the first failure surfaces as a JSON parse
  // error on "<!doctype html>" — which reads like a corrupt data file rather
  // than an absent one.
  if (!response.ok) {
    throw new Error(
      `could not load data/all.jsonl: ${response.status} ${response.statusText}`,
    );
  }

  const text = await response.text();
  const { records, problems } = parseBenchmarkJsonl(text);

  // Errors mean the file is not what approxbench wrote. Refusing it is the
  // point: a partially-valid file rendered as if whole is how a wrong number
  // reaches the leaderboard without anyone noticing. Warnings ride along so
  // the UI can show them without blocking.
  if (problems.some((p) => p.severity === "error")) {
    throw new SchemaViolation(problems);
  }

  return { records, problems };
}
