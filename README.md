# sketch demo

Small showcase of `asap_sketchlib` sketches, plus a benchmark + leaderboard.

## Usage examples

```bash
cargo run --release -- all     # walk through every sketch with toy data
cargo run --release -- hll     # or: cms, cs, kll, dd
```

## Benchmark + leaderboard

```bash
cargo run --release -- bench
```

Benchmarks every sketch against a shared workload — 1M items, Zipf(s=1.1)
over 100k keys, deterministic seed — measuring:

- **insert throughput** (M items/s, mean ± stddev over 3 runs + 1 warmup)
- **query throughput** (each sketch's native query: `estimate`, `quantile`, ...)
- **accuracy vs an exact baseline** per category:
  - cardinality → relative error vs `HashSet` distinct count
  - frequency → mean relative error over the 1k most frequent keys vs `HashMap`
  - quantiles → tie-aware mean rank error over a 101-point grid vs sorted `Vec`

The exact baselines are benchmarked through the same pipeline, so each
category shows the speed/accuracy trade-off directly.

Output:

- ranked tables printed to the terminal
- `leaderboard.md` — markdown tables
- `leaderboard.html` — self-contained dark-mode page with throughput bars
  (open directly in a browser, no server needed)
