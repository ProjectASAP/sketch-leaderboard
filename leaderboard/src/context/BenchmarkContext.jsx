import { createContext, useContext, useEffect, useState } from "react";
import { loadBenchmarkData } from "../services/benchmarkService";

const BenchmarkContext = createContext();

export function BenchmarkProvider({ children }) {
  const [benchmarks, setBenchmarks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      const data = await loadBenchmarkData();
      setBenchmarks(data);
      setLoading(false);
    }

    fetchData();
  }, []);

  return (
    <BenchmarkContext.Provider
      value={{
        benchmarks,
        loading,
      }}
    >
      {children}
    </BenchmarkContext.Provider>
  );
}

export function useBenchmark() {
  return useContext(BenchmarkContext);
}