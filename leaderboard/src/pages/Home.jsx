import { useBenchmark } from "../context/BenchmarkContext";

function Home() {
  const { benchmarks, loading } = useBenchmark();

  return (
    <div style={{ padding: "30px" }}>
      <h1>Sketch Leaderboard</h1>

      {loading ? (
        <p>Loading benchmarks...</p>
      ) : (
        <>
          <p>Total Benchmarks: {benchmarks.length}</p>

          <pre>{JSON.stringify(benchmarks[0], null, 2)}</pre>
        </>
      )}
    </div>
  );
}

export default Home;