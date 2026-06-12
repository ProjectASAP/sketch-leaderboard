//! Benchmark harness: runs every sketch in this demo against a shared
//! Zipf workload, measures insert/query throughput and accuracy vs an
//! exact baseline, then hands the results to the leaderboard renderer.
//!
//! Methodology (mirrors sketch-bench's macro benchmarks, simplified):
//! - 1M items drawn from a Zipf(s=1.1) distribution over 100k distinct
//!   keys, deterministic seed.
//! - Per entry: 1 warmup run + 3 measured runs; throughput = items/sec,
//!   reported as mean ± stddev.
//! - Frequency error = mean relative error over the 1k most frequent
//!   keys (the heavy-hitter use case CMS/CountSketch are sized for);
//!   cardinality error = relative error of the estimate; quantile
//!   error = mean rank error over a 101-point quantile grid, tie-aware
//!   so duplicate-heavy streams don't penalise correct answers.

use std::collections::{HashMap, HashSet};
use std::time::Instant;

use asap_sketchlib::{
    Count, CountMin, DDSketch, DataInput, ErtlMLE, FastPath, HyperLogLog, Vector2D, KLL,
};

use crate::leaderboard;

const WORKLOAD_SIZE: usize = 1_000_000;
const CARDINALITY: usize = 100_000;
const ZIPF_S: f64 = 1.1;
const SEED: u64 = 42;
const RUNS: usize = 3;
const FREQ_PROBES: usize = 1_000;
const QUANTILE_GRID: usize = 101;

#[derive(Clone, Copy)]
pub struct Stats {
    pub mean: f64,
    pub stddev: f64,
}

pub struct BenchResult {
    pub category: &'static str,
    pub name: &'static str,
    pub config: &'static str,
    pub is_baseline: bool,
    /// Insert throughput in million items/sec.
    pub insert_mops: Stats,
    /// Query throughput in million queries/sec.
    pub query_mops: f64,
    pub error: Option<f64>,
}

pub const ERROR_LABELS: [(&str, &str); 3] = [
    ("cardinality", "rel-err"),
    ("frequency", "mean rel-err (top-1k)"),
    ("quantiles", "mean rank-err"),
];

// ---------------------------------------------------------------- workload

struct SplitMix64(u64);

impl SplitMix64 {
    fn next(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }

    fn next_f64(&mut self) -> f64 {
        (self.next() >> 11) as f64 / (1u64 << 53) as f64
    }
}

/// Stable rank -> key mapping so keys are spread over the u64 space.
fn rank_to_key(rank: usize) -> u64 {
    SplitMix64(rank as u64 ^ 0xDEAD_BEEF_CAFE_F00D).next()
}

struct Workload {
    /// Zipf-distributed keys, one per stream item.
    keys: Vec<u64>,
    /// The same stream viewed as a skewed "latency" value in ms
    /// (rank-derived), used by the quantile sketches.
    values: Vec<f64>,
    true_counts: HashMap<u64, u64>,
    distinct: usize,
}

fn generate_workload() -> Workload {
    // Zipf CDF over CARDINALITY ranks.
    let mut cdf = Vec::with_capacity(CARDINALITY);
    let mut acc = 0.0;
    for i in 0..CARDINALITY {
        acc += 1.0 / ((i + 1) as f64).powf(ZIPF_S);
        cdf.push(acc);
    }
    let total = acc;

    let mut rng = SplitMix64(SEED);
    let mut keys = Vec::with_capacity(WORKLOAD_SIZE);
    let mut values = Vec::with_capacity(WORKLOAD_SIZE);
    let mut true_counts: HashMap<u64, u64> = HashMap::new();
    for _ in 0..WORKLOAD_SIZE {
        let u = rng.next_f64() * total;
        let rank = cdf.partition_point(|&c| c < u).min(CARDINALITY - 1);
        keys.push(rank_to_key(rank));
        values.push(rank as f64 * 0.1 + 1.0);
        *true_counts.entry(rank_to_key(rank)).or_insert(0) += 1;
    }
    let distinct = true_counts.len();
    Workload { keys, values, true_counts, distinct }
}

// ------------------------------------------------------------------ timing

/// Times `body` (which must rebuild + fill its sketch from scratch)
/// over 1 warmup + RUNS measured runs; returns throughput stats in
/// million items/sec for `items` processed per run.
fn time_insert(items: usize, mut body: impl FnMut()) -> Stats {
    body(); // warmup
    let mut samples = Vec::with_capacity(RUNS);
    for _ in 0..RUNS {
        let t0 = Instant::now();
        body();
        let secs = t0.elapsed().as_secs_f64();
        samples.push(items as f64 / secs / 1e6);
    }
    let mean = samples.iter().sum::<f64>() / samples.len() as f64;
    let var = samples.iter().map(|s| (s - mean).powi(2)).sum::<f64>()
        / (samples.len().max(2) - 1) as f64;
    Stats { mean, stddev: var.sqrt() }
}

/// Times `queries` invocations of `body`; returns M queries/sec.
fn time_query(queries: usize, mut body: impl FnMut()) -> f64 {
    let t0 = Instant::now();
    body();
    queries as f64 / t0.elapsed().as_secs_f64() / 1e6
}

// ------------------------------------------------------------- cardinality

fn bench_cardinality(w: &Workload) -> Vec<BenchResult> {
    let mut results = Vec::new();

    // HLL (ErtlMLE)
    let mut hll = HyperLogLog::<ErtlMLE>::default();
    let insert = time_insert(w.keys.len(), || {
        let mut s = HyperLogLog::<ErtlMLE>::default();
        for k in &w.keys {
            s.insert(&DataInput::U64(*k));
        }
        hll = s;
    });
    let est_queries = 1_000;
    let mut est = 0.0;
    let query = time_query(est_queries, || {
        for _ in 0..est_queries {
            est = std::hint::black_box(hll.estimate()) as f64;
        }
    });
    let err = (est - w.distinct as f64).abs() / w.distinct as f64;
    results.push(BenchResult {
        category: "cardinality",
        name: "HyperLogLog (ErtlMLE)",
        config: "default precision",
        is_baseline: false,
        insert_mops: insert,
        query_mops: query,
        error: Some(err),
    });

    // exact baseline: HashSet
    let mut set = HashSet::new();
    let insert = time_insert(w.keys.len(), || {
        let mut s = HashSet::with_capacity(w.distinct * 2);
        for k in &w.keys {
            s.insert(*k);
        }
        set = s;
    });
    let len_queries = 1_000_000;
    let mut n = 0usize;
    let query = time_query(len_queries, || {
        for _ in 0..len_queries {
            n = std::hint::black_box(set.len());
        }
    });
    results.push(BenchResult {
        category: "cardinality",
        name: "exact HashSet",
        config: "baseline",
        is_baseline: true,
        insert_mops: insert,
        query_mops: query,
        error: Some((n as f64 - w.distinct as f64).abs() / w.distinct as f64),
    });

    results
}

// --------------------------------------------------------------- frequency

/// The most frequent keys, used as the accuracy probe set.
fn probe_keys(w: &Workload) -> Vec<(u64, u64)> {
    let mut probes: Vec<(u64, u64)> = w.true_counts.iter().map(|(k, c)| (*k, *c)).collect();
    probes.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
    probes.truncate(FREQ_PROBES);
    probes
}

fn bench_frequency(w: &Workload) -> Vec<BenchResult> {
    let mut results = Vec::new();
    let probes = probe_keys(w);

    // CountMin
    let mut cms = CountMin::<Vector2D<i32>, FastPath>::with_dimensions(5, 2048);
    let insert = time_insert(w.keys.len(), || {
        let mut s = CountMin::<Vector2D<i32>, FastPath>::with_dimensions(5, 2048);
        for k in &w.keys {
            s.insert(&DataInput::U64(*k));
        }
        cms = s;
    });
    let mut err_sum = 0.0;
    let query = time_query(probes.len(), || {
        err_sum = 0.0;
        for (k, truth) in &probes {
            let est = cms.estimate(&DataInput::U64(*k)) as f64;
            err_sum += (est - *truth as f64).abs() / *truth as f64;
        }
    });
    results.push(BenchResult {
        category: "frequency",
        name: "CountMin (FastPath)",
        config: "5 x 2048 i32",
        is_baseline: false,
        insert_mops: insert,
        query_mops: query,
        error: Some(err_sum / probes.len() as f64),
    });

    // CountSketch
    let mut cs = Count::<Vector2D<i32>, FastPath>::with_dimensions(5, 2048);
    let insert = time_insert(w.keys.len(), || {
        let mut s = Count::<Vector2D<i32>, FastPath>::with_dimensions(5, 2048);
        for k in &w.keys {
            s.insert(&DataInput::U64(*k));
        }
        cs = s;
    });
    let mut err_sum = 0.0;
    let query = time_query(probes.len(), || {
        err_sum = 0.0;
        for (k, truth) in &probes {
            let est = cs.estimate(&DataInput::U64(*k)) as f64;
            err_sum += (est - *truth as f64).abs() / *truth as f64;
        }
    });
    results.push(BenchResult {
        category: "frequency",
        name: "CountSketch (FastPath)",
        config: "5 x 2048 i32",
        is_baseline: false,
        insert_mops: insert,
        query_mops: query,
        error: Some(err_sum / probes.len() as f64),
    });

    // exact baseline: HashMap
    let mut map: HashMap<u64, u64> = HashMap::new();
    let insert = time_insert(w.keys.len(), || {
        let mut m: HashMap<u64, u64> = HashMap::with_capacity(w.distinct * 2);
        for k in &w.keys {
            *m.entry(*k).or_insert(0) += 1;
        }
        map = m;
    });
    let mut err_sum = 0.0;
    let query = time_query(probes.len(), || {
        err_sum = 0.0;
        for (k, truth) in &probes {
            let est = *map.get(k).unwrap_or(&0) as f64;
            err_sum += (est - *truth as f64).abs() / *truth as f64;
        }
    });
    results.push(BenchResult {
        category: "frequency",
        name: "exact HashMap",
        config: "baseline",
        is_baseline: true,
        insert_mops: insert,
        query_mops: query,
        error: Some(err_sum / probes.len() as f64),
    });

    results
}

// --------------------------------------------------------------- quantiles

/// Mean rank error of `estimate(q)` against the sorted truth over a
/// 101-point quantile grid. Tie-aware: a returned value `v` occupies
/// the whole rank interval [count(< v), count(<= v)] / n, and the
/// error is the distance from q to that interval (zero if q falls
/// inside it), so duplicate-heavy streams don't penalise exact answers.
fn rank_error(sorted: &[f64], mut estimate: impl FnMut(f64) -> f64) -> f64 {
    let n = sorted.len() as f64;
    let mut sum = 0.0;
    for i in 0..QUANTILE_GRID {
        let q = i as f64 / (QUANTILE_GRID - 1) as f64;
        let est = estimate(q);
        let lo = sorted.partition_point(|&v| v < est) as f64 / n;
        let hi = sorted.partition_point(|&v| v <= est) as f64 / n;
        sum += if q < lo {
            lo - q
        } else if q > hi {
            q - hi
        } else {
            0.0
        };
    }
    sum / QUANTILE_GRID as f64
}

fn bench_quantiles(w: &Workload) -> Vec<BenchResult> {
    let mut results = Vec::new();
    let mut sorted = w.values.clone();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let query_reps = 10_000;

    // KLL
    let mut kll = KLL::<f64>::default();
    let insert = time_insert(w.values.len(), || {
        let mut s = KLL::<f64>::default();
        for v in &w.values {
            s.update(v);
        }
        kll = s;
    });
    let mut sink = 0.0;
    let query = time_query(query_reps, || {
        for i in 0..query_reps {
            sink += kll.quantile((i % 100) as f64 / 100.0);
        }
    });
    std::hint::black_box(sink);
    let err = rank_error(&sorted, |q| kll.quantile(q));
    results.push(BenchResult {
        category: "quantiles",
        name: "KLL",
        config: "default k",
        is_baseline: false,
        insert_mops: insert,
        query_mops: query,
        error: Some(err),
    });

    // DDSketch
    let mut dd = DDSketch::new(0.01);
    let insert = time_insert(w.values.len(), || {
        let mut s = DDSketch::new(0.01);
        for v in &w.values {
            s.add(v);
        }
        dd = s;
    });
    let mut sink = 0.0;
    let query = time_query(query_reps, || {
        for i in 0..query_reps {
            sink += dd
                .get_value_at_quantile((i % 100) as f64 / 100.0)
                .unwrap_or(0.0);
        }
    });
    std::hint::black_box(sink);
    let err = rank_error(&sorted, |q| dd.get_value_at_quantile(q).unwrap_or(0.0));
    results.push(BenchResult {
        category: "quantiles",
        name: "DDSketch",
        config: "alpha = 0.01",
        is_baseline: false,
        insert_mops: insert,
        query_mops: query,
        error: Some(err),
    });

    // exact baseline: sort + index
    let mut exact = Vec::new();
    let insert = time_insert(w.values.len(), || {
        let mut v = w.values.clone();
        v.sort_by(|a, b| a.partial_cmp(b).unwrap());
        exact = v;
    });
    let exact_quantile = |q: f64| {
        let idx = ((q * (exact.len() - 1) as f64).round() as usize).min(exact.len() - 1);
        exact[idx]
    };
    let mut sink = 0.0;
    let query = time_query(query_reps, || {
        for i in 0..query_reps {
            sink += exact_quantile((i % 100) as f64 / 100.0);
        }
    });
    std::hint::black_box(sink);
    let err = rank_error(&sorted, exact_quantile);
    results.push(BenchResult {
        category: "quantiles",
        name: "exact sorted Vec",
        config: "baseline",
        is_baseline: true,
        insert_mops: insert,
        query_mops: query,
        error: Some(err),
    });

    results
}

// -------------------------------------------------------------------- run

pub fn run() {
    println!(
        "generating workload: {WORKLOAD_SIZE} items, zipf(s={ZIPF_S}) over {CARDINALITY} keys, seed {SEED} ..."
    );
    let w = generate_workload();
    println!("distinct keys: {}\n", w.distinct);

    let mut results = Vec::new();
    println!("benchmarking cardinality sketches ...");
    results.extend(bench_cardinality(&w));
    println!("benchmarking frequency sketches ...");
    results.extend(bench_frequency(&w));
    println!("benchmarking quantile sketches ...");
    results.extend(bench_quantiles(&w));
    println!();

    let workload_desc = format!(
        "zipf(s={ZIPF_S}) workload, {WORKLOAD_SIZE} items over {} distinct keys, {RUNS} runs (+1 warmup), seed {SEED}",
        w.distinct
    );
    leaderboard::render(&results, &workload_desc);
}
