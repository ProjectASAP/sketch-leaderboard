import { useEffect, useState } from "react";
import { loadBenchmarkData } from "../utils/loadJson";
import { BenchmarkDataContext } from "./benchmarkDataContextValue";

// Loads all.jsonl once and holds it as the single in-memory struct every
// page reads from via useBenchmarkData(), instead of each page fetching
// and parsing the file itself.
export function BenchmarkDataProvider({ children }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    loadBenchmarkData()
      .then((data) => {
        if (!cancelled) setRecords(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <BenchmarkDataContext.Provider value={{ records, loading, error }}>
      {children}
    </BenchmarkDataContext.Provider>
  );
}
