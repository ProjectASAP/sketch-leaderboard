//! Count Sketch — frequency estimation with signed counters.
//! Unlike CountMin it is unbiased (can under- or over-estimate),
//! which makes it better at heavy hitters under adversarial noise.

use asap_sketchlib::{Count, DataInput, FastPath, Vector2D};

pub fn run() {
    println!("=== CountSketch: event frequency (unbiased) ===");
    let mut cs = Count::<Vector2D<i32>, FastPath>::with_dimensions(3, 4);
    let events = [
        ("page_view", 1000),
        ("click", 500),
        ("signup", 100),
        ("purchase", 50),
    ];
    for &(event, count) in &events {
        for _ in 0..count {
            cs.insert(&DataInput::Str(event));
        }
    }
    for &(event, true_count) in &events {
        let est = cs.estimate(&DataInput::Str(event));
        println!("{event:>10}: estimate = {est:>5}, true = {true_count}");
    }
}
