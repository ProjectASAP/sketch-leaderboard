//! KLL — quantile sketch with rank-error guarantees.

use asap_sketchlib::KLL;

pub fn run() {
    println!("=== KLL: latency percentiles ===");
    let mut kll = KLL::<f64>::default();
    for i in 0..1000 {
        let ms = (i as f64) * 0.5 + 1.0;
        kll.update(&ms);
    }
    println!("p50 (median) ≈ {:.1} ms", kll.quantile(0.50));
    println!("p95          ≈ {:.1} ms", kll.quantile(0.95));
    println!("p99          ≈ {:.1} ms", kll.quantile(0.99));
    println!("p99.9        ≈ {:.1} ms", kll.quantile(0.999));
    println!("p10          ≈ {:.1} ms", kll.quantile(0.10));
}
