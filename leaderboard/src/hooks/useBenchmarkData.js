import { useContext } from "react";
import { BenchmarkDataContext } from "../context/benchmarkDataContextValue";

export function useBenchmarkData() {
  const ctx = useContext(BenchmarkDataContext);
  if (!ctx) {
    throw new Error(
      "useBenchmarkData must be used within a BenchmarkDataProvider",
    );
  }
  return ctx;
}
