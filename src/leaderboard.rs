//! Leaderboard renderer: ranks bench results by insert throughput
//! within each category, prints the standings to the terminal, and
//! writes `leaderboard.md` + `leaderboard.html` (self-contained, no
//! external assets) into the repo root.

use std::fmt::Write as _;
use std::fs;

use crate::bench::{BenchResult, ERROR_LABELS};

const MEDALS: [&str; 3] = ["1.", "2.", "3."];
const BAR_WIDTH: usize = 30;

fn error_label(category: &str) -> &'static str {
    ERROR_LABELS
        .iter()
        .find(|(c, _)| *c == category)
        .map(|(_, l)| *l)
        .unwrap_or("error")
}

fn fmt_err(e: Option<f64>) -> String {
    match e {
        Some(v) => format!("{v:.4}"),
        None => "—".to_string(),
    }
}

/// Groups results by category, keeping the bench's category order,
/// and sorts each group by mean insert throughput, descending.
fn ranked(results: &[BenchResult]) -> Vec<(&'static str, Vec<&BenchResult>)> {
    let mut groups: Vec<(&'static str, Vec<&BenchResult>)> = Vec::new();
    for r in results {
        match groups.iter_mut().find(|(c, _)| *c == r.category) {
            Some((_, v)) => v.push(r),
            None => groups.push((r.category, vec![r])),
        }
    }
    for (_, v) in &mut groups {
        v.sort_by(|a, b| b.insert_mops.mean.partial_cmp(&a.insert_mops.mean).unwrap());
    }
    groups
}

// ---------------------------------------------------------------- terminal

fn print_terminal(groups: &[(&'static str, Vec<&BenchResult>)], workload: &str) {
    println!("==================== LEADERBOARD ====================");
    println!("{workload}\n");
    for (category, rows) in groups {
        let max = rows
            .iter()
            .map(|r| r.insert_mops.mean)
            .fold(f64::MIN, f64::max);
        println!("--- {category} (ranked by insert throughput) ---");
        for (i, r) in rows.iter().enumerate() {
            let filled = ((r.insert_mops.mean / max) * BAR_WIDTH as f64).round() as usize;
            let bar: String = "#".repeat(filled.max(1)) + &" ".repeat(BAR_WIDTH - filled.min(BAR_WIDTH));
            let rank = MEDALS.get(i).copied().unwrap_or("  ");
            let tag = if r.is_baseline { " [baseline]" } else { "" };
            println!(
                "{rank} {:<24} {:>7.2} M/s ±{:>5.2} |{bar}| query {:>8.2} M/s  {} {}{tag}",
                r.name,
                r.insert_mops.mean,
                r.insert_mops.stddev,
                r.query_mops,
                error_label(category),
                fmt_err(r.error),
            );
        }
        println!();
    }
}

// ---------------------------------------------------------------- markdown

fn build_markdown(groups: &[(&'static str, Vec<&BenchResult>)], workload: &str) -> String {
    let mut md = String::new();
    let _ = writeln!(md, "# sketch demo leaderboard\n");
    let _ = writeln!(
        md,
        "_{workload}. Ranked by mean insert throughput; exact baselines included for reference._\n"
    );
    for (category, rows) in groups {
        let _ = writeln!(md, "## {category}\n");
        let _ = writeln!(
            md,
            "| rank | sketch | config | insert (M items/s) | query (M ops/s) | {} |",
            error_label(category)
        );
        let _ = writeln!(md, "|---:|---|---|---:|---:|---:|");
        for (i, r) in rows.iter().enumerate() {
            let _ = writeln!(
                md,
                "| {} | {} | {} | {:.2} ± {:.2} | {:.2} | {} |",
                i + 1,
                r.name,
                r.config,
                r.insert_mops.mean,
                r.insert_mops.stddev,
                r.query_mops,
                fmt_err(r.error),
            );
        }
        let _ = writeln!(md);
    }
    md
}

// -------------------------------------------------------------------- html

fn build_html(groups: &[(&'static str, Vec<&BenchResult>)], workload: &str) -> String {
    let mut sections = String::new();
    for (category, rows) in groups {
        let max = rows
            .iter()
            .map(|r| r.insert_mops.mean)
            .fold(f64::MIN, f64::max);
        let mut body = String::new();
        for (i, r) in rows.iter().enumerate() {
            let pct = r.insert_mops.mean / max * 100.0;
            let cls = format!(
                "r{}{}",
                i + 1,
                if r.is_baseline { " baseline" } else { "" }
            );
            let _ = write!(
                body,
                r#"<tr class="{cls}"><td class="rank">{rank}</td>
<td class="impl">{name} <span class="cfg">{config}</span></td>
<td class="barcell"><div class="bar"><span style="width:{pct:.1}%"></span><em>{mean:.2} M/s</em></div></td>
<td>{query:.2}</td><td>{err}</td></tr>"#,
                rank = i + 1,
                name = r.name,
                config = r.config,
                mean = r.insert_mops.mean,
                query = r.query_mops,
                err = fmt_err(r.error),
            );
        }
        let _ = write!(
            sections,
            r#"<section><h2>{category}</h2><table>
<tr><th></th><th class="impl">sketch · config</th><th>insert throughput</th>
<th>query M ops/s</th><th>{err_label}</th></tr>{body}</table></section>"#,
            err_label = error_label(category),
        );
    }

    format!(
        r#"<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>sketch demo leaderboard</title>
<style>
  :root {{
    --bg: #0f1419; --card: #1a2129; --text: #e6e8ea; --dim: #8a939e;
    --accent: #4fc3f7; --bar: linear-gradient(90deg, #1de9b6, #4fc3f7);
    --gold: #ffd54f; --silver: #cfd8dc; --bronze: #ffab91;
  }}
  * {{ box-sizing: border-box; }}
  body {{
    margin: 0; padding: 2rem clamp(1rem, 5vw, 4rem);
    background: var(--bg); color: var(--text);
    font: 15px/1.5 "Segoe UI", system-ui, sans-serif;
  }}
  h1 {{ font-size: 1.9rem; margin: 0 0 .25rem; }}
  .sub {{ color: var(--dim); margin-bottom: 2rem; }}
  section {{ margin-bottom: 2.5rem; }}
  h2 {{ font-size: 1.25rem; border-bottom: 1px solid #2a323c; padding-bottom: .4rem;
       text-transform: capitalize; }}
  table {{ border-collapse: collapse; width: 100%; }}
  th, td {{ padding: .5rem .75rem; text-align: right; white-space: nowrap; }}
  th {{ color: var(--dim); font-size: .78rem; text-transform: uppercase;
       letter-spacing: .05em; border-bottom: 1px solid #2a323c; }}
  td.impl, th.impl {{ text-align: left; }}
  tr:nth-child(even) td {{ background: rgba(255,255,255,.025); }}
  td.rank {{ font-weight: 700; width: 3rem; }}
  .r1 td.rank {{ color: var(--gold); }}
  .r2 td.rank {{ color: var(--silver); }}
  .r3 td.rank {{ color: var(--bronze); }}
  .baseline td {{ opacity: .55; }}
  .barcell {{ width: 34%; min-width: 200px; }}
  .bar {{ position: relative; background: #232c36; border-radius: 4px;
         height: 18px; overflow: hidden; }}
  .bar > span {{ position: absolute; inset: 0 auto 0 0; border-radius: 4px;
                background: var(--bar); }}
  .bar > em {{ position: absolute; inset: 0; font-style: normal; font-size: .78rem;
              display: flex; align-items: center; padding-left: .5rem;
              color: #02131a; font-weight: 600;
              text-shadow: 0 0 4px rgba(255,255,255,.45); }}
  .cfg {{ color: var(--dim); font-size: .82rem; }}
  footer {{ color: var(--dim); font-size: .8rem; margin-top: 3rem; }}
</style>
</head>
<body>
<h1>&#127942; sketch demo leaderboard</h1>
<div class="sub">{workload}</div>
{sections}
<footer>Generated by <code>cargo run --release -- bench</code> (asap_sketchlib demo).
Exact baselines shown dimmed for reference.</footer>
</body>
</html>
"#
    )
}

// -------------------------------------------------------------------- main

pub fn render(results: &[BenchResult], workload: &str) {
    let groups = ranked(results);
    print_terminal(&groups, workload);

    let md = build_markdown(&groups, workload);
    let html = build_html(&groups, workload);
    match fs::write("leaderboard.md", md) {
        Ok(()) => println!("wrote leaderboard.md"),
        Err(e) => eprintln!("failed to write leaderboard.md: {e}"),
    }
    match fs::write("leaderboard.html", html) {
        Ok(()) => println!("wrote leaderboard.html"),
        Err(e) => eprintln!("failed to write leaderboard.html: {e}"),
    }
}
