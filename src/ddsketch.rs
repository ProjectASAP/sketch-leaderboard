//! DDSketch — quantile sketch with *relative*-error guarantees:
//! every quantile estimate is within alpha (e.g. 1%) of the true value,
//! which keeps tail percentiles (p99, p999) accurate even for skewed data.

use asap_sketchlib::DDSketch;

pub fn run() {
    println!("=== DDSketch: latency percentiles (alpha = 0.01) ===");
    let mut dd = DDSketch::new(0.01);
    for i in 0..1000 {
        let ms = (i as f64) * 0.5 + 1.0;
        dd.add(&ms);
    }
    for q in [0.50, 0.95, 0.99] {
        match dd.get_value_at_quantile(q) {
            Some(v) => println!("p{:<4} ≈ {v:.1} ms", (q * 100.0) as u32),
            None => println!("p{:<4}: sketch empty", (q * 100.0) as u32),
        }
    }
}
