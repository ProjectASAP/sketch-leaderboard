mod bench;
mod countmin;
mod countsketch;
mod ddsketch;
mod hll;
mod kll;
mod leaderboard;

fn main() {
    let arg = std::env::args().nth(1);
    match arg.as_deref() {
        None | Some("all") => {
            hll::run();
            println!();
            countmin::run();
            println!();
            countsketch::run();
            println!();
            kll::run();
            println!();
            ddsketch::run();
        }
        Some("hll") => hll::run(),
        Some("cms") | Some("countmin") => countmin::run(),
        Some("cs") | Some("countsketch") => countsketch::run(),
        Some("kll") => kll::run(),
        Some("dd") | Some("ddsketch") => ddsketch::run(),
        Some("bench") | Some("leaderboard") => bench::run(),
        Some(other) => {
            eprintln!("unknown sketch: {other}");
            eprintln!("usage: cargo run -- [all|hll|cms|cs|kll|dd|bench]");
            std::process::exit(1);
        }
    }
}
