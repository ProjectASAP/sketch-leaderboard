//! profiles.rs — reads run_profiles JSONL output and generates a self-contained
//! interactive HTML spreadsheet with filtering and ranked views.

use serde_json::{json, Value};
use std::fs;

struct Row {
    sketch: String,
    impl_: String,
    config: String,
    workload: String,
    insert_mops: f64,
    query_mops: Option<f64>,
    memory_bytes: u64,
    memory_human: String,
    accuracy: Option<f64>,
    acc_label: String,
}

fn read_jsonl(path: &str) -> Vec<Value> {
    let bytes = fs::read(path).unwrap_or_else(|e| {
        eprintln!("error reading {path}: {e}");
        std::process::exit(1);
    });
    // PowerShell Out-File writes UTF-16 LE with BOM; handle that transparently.
    let text = if bytes.starts_with(&[0xFF, 0xFE]) {
        let words: Vec<u16> = bytes[2..]
            .chunks_exact(2)
            .map(|c| u16::from_le_bytes([c[0], c[1]]))
            .collect();
        String::from_utf16_lossy(&words).to_owned()
    } else {
        String::from_utf8_lossy(&bytes).into_owned()
    };
    text.lines()
        .filter(|l| !l.trim().is_empty())
        .filter_map(|l| serde_json::from_str(l.trim()).ok())
        .collect()
}

fn extract_config(v: &Value) -> String {
    let params = &v["sketch_config"]["params"];
    let obj = match params.as_object() {
        Some(o) if !o.is_empty() => o,
        _ => return "—".to_string(),
    };
    obj.iter()
        .map(|(k, v)| format!("{k}={v}"))
        .collect::<Vec<_>>()
        .join(", ")
}

fn extract_accuracy(sketch: &str, bench: &Value) -> (Option<f64>, String) {
    let acc = &bench["accuracy"];
    if acc.is_null() || !acc.is_object() {
        return (None, "—".to_string());
    }
    match sketch {
        "hll" => (acc["relative_error"].as_f64(), "rel-err".to_string()),
        "kll" => (acc["mean_rank_err"].as_f64(), "mean-rank-err".to_string()),
        "cms" | "countsketch" => {
            (acc["relative_error_mean"].as_f64(), "rel-err-mean".to_string())
        }
        _ => {
            let v = acc["relative_error"]
                .as_f64()
                .or_else(|| acc["mean_rank_err"].as_f64())
                .or_else(|| acc["relative_error_mean"].as_f64());
            (v, "accuracy".to_string())
        }
    }
}

fn fmt_memory(bytes: u64) -> String {
    if bytes >= 1_048_576 {
        format!("{:.1} MB", bytes as f64 / 1_048_576.0)
    } else if bytes >= 1024 {
        format!("{:.1} KB", bytes as f64 / 1024.0)
    } else {
        format!("{bytes} B")
    }
}

fn parse_rows(records: &[Value]) -> Vec<Row> {
    records
        .iter()
        .filter_map(|v| {
            let sketch = v["sketch"].as_str()?.to_string();
            let impl_ = v["impl"].as_str()?.to_string();
            let config = extract_config(v);
            let workload = v["workload"]["shape"].as_str().unwrap_or("—").to_string();
            let workload_size = v["workload"]["size"].as_f64().unwrap_or(1_000_000.0);
            let bench = &v["bench"];
            let wall_ms = bench["wall_time_ms"]["mean"].as_f64()?;
            let insert_mops = workload_size / (wall_ms / 1000.0) / 1_000_000.0;
            let query_mops = bench["query_throughput_items_per_sec"]["mean"]
                .as_f64()
                .map(|q| q / 1_000_000.0);
            let memory_bytes = bench["memory_bytes"].as_u64().unwrap_or(0);
            let memory_human = fmt_memory(memory_bytes);
            let (accuracy, acc_label) = extract_accuracy(&sketch, bench);
            Some(Row {
                sketch,
                impl_,
                config,
                workload,
                insert_mops,
                query_mops,
                memory_bytes,
                memory_human,
                accuracy,
                acc_label,
            })
        })
        .collect()
}

fn rows_to_json(rows: &[Row]) -> String {
    let arr: Vec<Value> = rows
        .iter()
        .map(|r| {
            json!({
                "sketch": r.sketch,
                "impl": r.impl_,
                "config": r.config,
                "workload": r.workload,
                "insert_mops": (r.insert_mops * 100.0).round() / 100.0,
                "query_mops": r.query_mops.map(|q| (q * 100.0).round() / 100.0),
                "memory_bytes": r.memory_bytes,
                "memory_human": r.memory_human,
                "accuracy": r.accuracy,
                "acc_label": r.acc_label,
            })
        })
        .collect();
    serde_json::to_string(&arr).unwrap()
}

fn build_html(rows: &[Row], source: &str) -> String {
    let data_json = rows_to_json(rows);
    HTML_TEMPLATE
        .replace("__DATA__", &data_json)
        .replace("__SOURCE__", source)
}

pub fn run(path: &str) {
    println!("reading {path} ...");
    let records = read_jsonl(path);
    println!("{} records parsed", records.len());
    let rows = parse_rows(&records);
    println!("{} rows extracted", rows.len());
    let html = build_html(&rows, path);
    match fs::write("profiles.html", &html) {
        Ok(()) => println!("wrote profiles.html"),
        Err(e) => eprintln!("failed to write profiles.html: {e}"),
    }
}

// ------------------------------------------------------------------ template

const HTML_TEMPLATE: &str = r#"<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>sketch-bench profiles</title>
<style>
  :root{--bg:#0f1419;--card:#1a2129;--text:#e6e8ea;--dim:#8a939e;
        --accent:#4fc3f7;--border:#2a323c;--hover:#1e2730}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--text);
       font:13px/1.5 "Segoe UI",system-ui,sans-serif}
  header{padding:1.25rem 1.5rem .75rem;border-bottom:1px solid var(--border);
         position:sticky;top:0;background:var(--bg);z-index:20}
  h1{margin:0 0 .5rem;font-size:1.4rem}
  .source{color:var(--dim);font-size:.75rem;margin-bottom:.6rem;word-break:break-all}
  .controls{display:flex;align-items:center;gap:1rem;flex-wrap:wrap}
  .tabs{display:flex;gap:.3rem}
  .tab{background:var(--card);border:1px solid var(--border);color:var(--dim);
       padding:.3rem .75rem;border-radius:4px;cursor:pointer;
       font-size:.8rem;font-family:inherit}
  .tab.active{background:var(--accent);border-color:var(--accent);
              color:#031b26;font-weight:700}
  .tab:hover:not(.active){color:var(--text);border-color:var(--accent)}
  select{background:var(--card);border:1px solid var(--border);color:var(--text);
         padding:.28rem .5rem;border-radius:4px;font-size:.8rem;font-family:inherit}
  #info{color:var(--dim);font-size:.75rem;padding:.35rem 1.5rem;
        border-bottom:1px solid var(--border)}
  .wrap{overflow:auto;max-height:calc(100vh - 170px)}
  table{border-collapse:collapse;width:100%;font-size:.8rem}
  thead{position:sticky;top:0;background:var(--card);z-index:10}
  th{padding:.45rem .75rem;text-align:left;border-bottom:2px solid var(--border);
     color:var(--dim);font-size:.72rem;text-transform:uppercase;letter-spacing:.04em;
     cursor:pointer;white-space:nowrap;user-select:none}
  th:hover{color:var(--text)}
  th.sorted{color:var(--accent)}
  th.r,td.r{text-align:right}
  td{padding:.35rem .75rem;border-bottom:1px solid rgba(255,255,255,.04);white-space:nowrap}
  tr:hover td{background:var(--hover)}
  td.cfg{color:var(--dim);font-size:.75rem;max-width:200px;
         overflow:hidden;text-overflow:ellipsis}
  td.na{color:var(--dim)}
</style>
</head>
<body>
<header>
<h1>&#128202; sketch-bench profiles</h1>
<div class="source">__SOURCE__</div>
<div class="controls">
  <div class="tabs">
    <button class="tab active" data-view="all">All Data</button>
    <button class="tab" data-view="insert">&#8679; Best Insert</button>
    <button class="tab" data-view="query">&#8679; Best Query</button>
    <button class="tab" data-view="memory">&#8681; Least Memory</button>
  </div>
  <div style="display:flex;gap:.5rem">
    <select id="fsk"><option value="">All sketches</option></select>
    <select id="fwk"><option value="">All workloads</option></select>
  </div>
</div>
</header>
<div id="info"></div>
<div class="wrap">
<table>
<thead><tr>
  <th data-col="sketch">Sketch</th>
  <th data-col="impl">Impl</th>
  <th data-col="config">Config</th>
  <th data-col="workload">Workload</th>
  <th data-col="insert_mops" class="r">Insert&nbsp;M/s</th>
  <th data-col="query_mops" class="r">Query&nbsp;M/s</th>
  <th data-col="memory_bytes" class="r">Memory</th>
  <th data-col="accuracy" class="r">Accuracy</th>
  <th data-col="acc_label">Metric</th>
</tr></thead>
<tbody id="tb"></tbody>
</table>
</div>
<script>
const DATA=__DATA__;
const VS={
  all:{c:'sketch',d:'asc'},
  insert:{c:'insert_mops',d:'desc'},
  query:{c:'query_mops',d:'desc'},
  memory:{c:'memory_bytes',d:'asc'}
};
let S={view:'all',sketch:'',workload:'',col:'sketch',dir:'asc'};

function cmp(a,b,d){
  if(a===null&&b===null)return 0;
  if(a===null)return d==='asc'?1:-1;
  if(b===null)return d==='asc'?-1:1;
  if(typeof a==='string')return d==='asc'?a.localeCompare(b):b.localeCompare(a);
  return d==='asc'?a-b:b-a;
}
function cell(v,dp){
  return v===null||v===undefined
    ?'<td class="r na">—</td>'
    :`<td class="r">${typeof v==='number'?v.toFixed(dp):v}</td>`;
}
function render(){
  let rows=DATA.filter(r=>{
    if(S.sketch&&r.sketch!==S.sketch)return false;
    if(S.workload&&r.workload!==S.workload)return false;
    if(S.view==='query'&&r.query_mops===null)return false;
    return true;
  });
  rows.sort((a,b)=>cmp(a[S.col],b[S.col],S.dir));
  document.getElementById('tb').innerHTML=rows.map(r=>`<tr>
    <td>${r.sketch}</td>
    <td>${r.impl}</td>
    <td class="cfg" title="${r.config}">${r.config}</td>
    <td>${r.workload}</td>
    ${cell(r.insert_mops,2)}
    ${cell(r.query_mops,2)}
    <td class="r">${r.memory_human}</td>
    ${cell(r.accuracy,4)}
    <td class="na">${r.acc_label}</td>
  </tr>`).join('');
  document.getElementById('info').textContent=
    `${rows.length} of ${DATA.length} rows`;
  document.querySelectorAll('th[data-col]').forEach(th=>{
    const sorted=th.dataset.col===S.col;
    th.classList.toggle('sorted',sorted);
    th.textContent=th.dataset.lbl+(sorted?(S.dir==='asc'?' ▲':' ▼'):'');
  });
}

document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>{
  document.querySelector('.tab.active').classList.remove('active');
  b.classList.add('active');
  const v=VS[b.dataset.view];
  S={...S,view:b.dataset.view,col:v.c,dir:v.d};
  render();
}));
document.getElementById('fsk').addEventListener('change',e=>{
  S.sketch=e.target.value;render();
});
document.getElementById('fwk').addEventListener('change',e=>{
  S.workload=e.target.value;render();
});
document.querySelectorAll('th[data-col]').forEach(th=>{
  th.dataset.lbl=th.textContent;
  th.addEventListener('click',()=>{
    const c=th.dataset.col;
    S.dir=S.col===c?(S.dir==='asc'?'desc':'asc')
                   :(c==='memory_bytes'?'asc':'desc');
    S.col=c;
    render();
  });
});

[...new Set(DATA.map(r=>r.sketch))].sort()
  .forEach(s=>document.getElementById('fsk').add(new Option(s,s)));
[...new Set(DATA.map(r=>r.workload))].sort()
  .forEach(w=>document.getElementById('fwk').add(new Option(w,w)));
render();
</script>
</body>
</html>"#;
