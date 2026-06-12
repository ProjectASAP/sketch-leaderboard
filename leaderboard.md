# sketch demo leaderboard

_zipf(s=1.1) workload, 1000000 items over 64757 distinct keys, 3 runs (+1 warmup), seed 42. Ranked by mean insert throughput; exact baselines included for reference._

## cardinality

| rank | sketch | config | insert (M items/s) | query (M ops/s) | rel-err |
|---:|---|---|---:|---:|---:|
| 1 | exact HashSet | baseline | 2.66 ± 0.11 | 87.70 | 0.0000 |
| 2 | HyperLogLog (ErtlMLE) | default precision | 2.39 ± 0.26 | 0.01 | 0.0008 |

## frequency

| rank | sketch | config | insert (M items/s) | query (M ops/s) | mean rel-err (top-1k) |
|---:|---|---|---:|---:|---:|
| 1 | exact HashMap | baseline | 2.87 ± 0.22 | 3.19 | 0.0000 |
| 2 | CountMin (FastPath) | 5 x 2048 i32 | 1.59 ± 0.04 | 1.57 | 0.6274 |
| 3 | CountSketch (FastPath) | 5 x 2048 i32 | 1.45 ± 0.02 | 1.11 | 0.2178 |

## quantiles

| rank | sketch | config | insert (M items/s) | query (M ops/s) | mean rank-err |
|---:|---|---|---:|---:|---:|
| 1 | DDSketch | alpha = 0.01 | 20.44 ± 0.96 | 0.33 | 0.0130 |
| 2 | KLL | default k | 5.32 ± 0.10 | 0.01 | 0.0017 |
| 3 | exact sorted Vec | baseline | 1.59 ± 0.03 | 7.46 | 0.0000 |

