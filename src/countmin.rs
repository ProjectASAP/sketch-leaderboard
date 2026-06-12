//! Count-Min Sketch — frequency estimation (over-counts, never under-counts).

use asap_sketchlib::{CountMin, DataInput, FastPath, Vector2D};

pub fn run() {
    println!("=== CountMin: event frequency ===");
    let mut cms = CountMin::<Vector2D<i32>, FastPath>::with_dimensions(3,100);
    let events = [
        ("page_view", 10000),
        ("click", 5000),
        ("signup", 1000),
        ("purchase", 500),
    ];
    for &(event, count) in &events {
        for _ in 0..count {
            cms.insert(&DataInput::Str(event));
        }
    }
    for &(event, true_count) in &events {
        let est = cms.estimate(&DataInput::Str(event));
        println!("{event:>10}: estimate = {est:>5}, true = {true_count}");
    }
    println!("{}",cms.estimate(&DataInput::Str("never_seen")));
}
