//! HyperLogLog — cardinality (distinct count) estimation.

use asap_sketchlib::{DataInput, ErtlMLE, HyperLogLog};

pub fn run() {
    println!("=== HyperLogLog: distinct user count ===");
    let mut hll = HyperLogLog::<ErtlMLE>::default();
    for user_id in [101, 202, 303, 101, 404, 202, 505, 101,102,101] {
        hll.insert(&DataInput::U64(user_id));
    }
    println!("true unique users : 5");
    println!("HLL estimate      : {:.0}", hll.estimate());

    // Sketches are mergeable — build one per node, combine for a global answer.
    println!("\n--- merge: distributed distinct count ---");
    let mut node_a = HyperLogLog::<ErtlMLE>::default();
    let mut node_b = HyperLogLog::<ErtlMLE>::default();
    for id in [1u64, 2, 3, 4, 5] {
        node_a.insert(&DataInput::U64(id));
    }
    for id in [4u64, 5, 6, 7, 8] {
        node_b.insert(&DataInput::U64(id));
    }
    node_a.merge(&node_b);
    println!("true union = 8, merged estimate ≈ {:.0}", node_a.estimate());
}
