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

const HTML_TEMPLATE: &str = r##"<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>sketch-bench profiles</title>
<style>
  :root{
    --bg:#0b0f14; --bg2:#0f141b; --card:#151c25; --card2:#1a2330;
    --text:#e9edf2; --dim:#8a96a6; --faint:#5c6675;
    --accent:#5ad1ff; --accent2:#7c8cff; --good:#5be9b9; --warn:#ffd166; --bad:#ff7a92;
    --border:#222c39; --glow:rgba(90,209,255,.14);
  }
  *{box-sizing:border-box}
  html,body{height:100%}
  body{margin:0;color:var(--text);
       font:13px/1.55 "Segoe UI",system-ui,-apple-system,sans-serif;
       background:
         radial-gradient(1100px 600px at 12% -8%, rgba(124,140,255,.16), transparent 60%),
         radial-gradient(1000px 620px at 100% 0%, rgba(90,209,255,.12), transparent 55%),
         var(--bg);
       -webkit-font-smoothing:antialiased}

  /* ---- header ---- */
  header{padding:1.4rem 1.6rem 1rem;position:sticky;top:0;z-index:30;
         background:linear-gradient(180deg, rgba(11,15,20,.92), rgba(11,15,20,.72));
         backdrop-filter:blur(10px);border-bottom:1px solid var(--border)}
  .title{display:flex;align-items:center;gap:.6rem;flex-wrap:wrap}
  h1{margin:0;font-size:1.5rem;letter-spacing:-.01em;font-weight:700;
     background:linear-gradient(90deg,#fff,#9fd9ff 60%,#9aa8ff);
     -webkit-background-clip:text;background-clip:text;color:transparent}
  .pill{font-size:.66rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;
        color:#04202b;background:linear-gradient(90deg,var(--accent),#8fe3ff);
        padding:.16rem .5rem;border-radius:999px}
  .source{color:var(--faint);font-size:.72rem;margin:.45rem 0 0;word-break:break-all;
          font-family:ui-monospace,"Cascadia Code",Consolas,monospace}

  /* ---- toolbar ---- */
  .toolbar{display:flex;align-items:center;gap:1rem;flex-wrap:wrap;margin-top:1rem}
  .tabs{display:flex;gap:.3rem;background:var(--card);padding:.25rem;border-radius:11px;
        border:1px solid var(--border)}
  .tab{background:transparent;border:0;color:var(--dim);padding:.4rem .8rem;border-radius:8px;
       cursor:pointer;font:inherit;font-size:.78rem;font-weight:600;display:flex;gap:.35rem;
       align-items:center;transition:.18s}
  .tab:hover:not(.active){color:var(--text);background:var(--card2)}
  .tab.active{color:#04202b;background:linear-gradient(90deg,var(--accent),#8fe3ff);
              box-shadow:0 4px 16px var(--glow)}

  .search{position:relative;flex:1;min-width:200px;max-width:340px}
  .search input{width:100%;background:var(--card);border:1px solid var(--border);
       color:var(--text);padding:.5rem .7rem .5rem 2rem;border-radius:10px;
       font:inherit;font-size:.82rem;transition:.18s}
  .search input:focus{outline:0;border-color:var(--accent);box-shadow:0 0 0 3px var(--glow)}
  .search svg{position:absolute;left:.6rem;top:50%;transform:translateY(-50%);
       width:14px;height:14px;stroke:var(--faint);fill:none;stroke-width:2}
  .btn{background:var(--card);border:1px solid var(--border);color:var(--dim);
       padding:.5rem .8rem;border-radius:10px;cursor:pointer;font:inherit;font-size:.78rem;
       font-weight:600;transition:.18s}
  .btn:hover{color:var(--text);border-color:var(--accent2)}

  /* ---- facet chips ---- */
  .facets{padding:.85rem 1.6rem;display:flex;flex-direction:column;gap:.55rem;
          border-bottom:1px solid var(--border);
          background:linear-gradient(180deg,rgba(21,28,37,.5),transparent)}
  .facet{display:flex;align-items:center;gap:.55rem;flex-wrap:wrap}
  .facet-label{font-size:.66rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;
       color:var(--faint);min-width:74px}
  .chip{background:var(--card);border:1px solid var(--border);color:var(--dim);
        padding:.28rem .7rem;border-radius:999px;cursor:pointer;font:inherit;font-size:.76rem;
        font-weight:600;transition:.16s;display:flex;align-items:center;gap:.35rem;
        white-space:nowrap;user-select:none}
  .chip:hover{color:var(--text);border-color:var(--accent2);transform:translateY(-1px)}
  .chip .dot{width:7px;height:7px;border-radius:50%;background:currentColor;opacity:.55}
  .chip.on{color:#04202b;border-color:transparent;
           background:linear-gradient(90deg,var(--accent),#8fe3ff);
           box-shadow:0 3px 12px var(--glow)}
  .chip.on .dot{opacity:1;background:#04202b}

  /* ---- statistic (numeric) filters ---- */
  .statbar{padding:.7rem 1.6rem;display:flex;gap:1.2rem;flex-wrap:wrap;align-items:center;
           border-bottom:1px solid var(--border)}
  .statbar > .facet-label{min-width:74px}
  .statf{display:flex;align-items:center;gap:.4rem}
  .statf .nm{font-size:.68rem;font-weight:700;color:var(--dim)}
  .statf input{width:60px;background:var(--card);border:1px solid var(--border);color:var(--text);
       padding:.3rem .45rem;border-radius:7px;font:inherit;font-size:.76rem;text-align:right;
       transition:.15s}
  .statf input::-webkit-inner-spin-button{opacity:.35}
  .statf input:focus{outline:0;border-color:var(--accent);box-shadow:0 0 0 3px var(--glow)}
  .statf input.set{border-color:var(--accent);color:var(--accent)}
  .statf .sep{color:var(--faint);font-size:.7rem}

  /* ---- info bar ---- */
  #info{color:var(--dim);font-size:.74rem;padding:.5rem 1.6rem;display:flex;
        align-items:center;gap:.5rem;border-bottom:1px solid var(--border)}
  #info b{color:var(--accent)}

  /* ---- table ---- */
  .wrap{overflow:auto;max-height:calc(100vh - 320px)}
  table{border-collapse:separate;border-spacing:0;width:100%;font-size:.8rem}
  thead{position:sticky;top:0;z-index:10}
  th{padding:.6rem .85rem;text-align:left;background:var(--bg2);
     border-bottom:1px solid var(--border);color:var(--dim);font-size:.68rem;
     text-transform:uppercase;letter-spacing:.05em;cursor:pointer;white-space:nowrap;
     user-select:none;transition:.15s;font-weight:700}
  th:hover{color:var(--text)}
  th.sorted{color:var(--accent)}
  th.r,td.r{text-align:right}
  td{padding:.4rem .85rem;border-bottom:1px solid rgba(255,255,255,.045);white-space:nowrap}
  tbody tr{transition:background .12s}
  tbody tr:hover td{background:rgba(90,209,255,.06)}
  td.cfg{color:var(--dim);font-size:.74rem;font-family:ui-monospace,Consolas,monospace;
         max-width:190px;overflow:hidden;text-overflow:ellipsis}
  .na{color:var(--faint)}

  .badge{display:inline-block;padding:.14rem .5rem;border-radius:6px;font-size:.72rem;
         font-weight:600;border:1px solid transparent}
  .sketch-tag{font-weight:700;letter-spacing:.02em}

  /* inline metric bar */
  .metric{display:flex;align-items:center;justify-content:flex-end;gap:.5rem}
  .metric .bar{height:6px;border-radius:3px;min-width:2px;
       background:linear-gradient(90deg,var(--accent2),var(--accent))}
  .metric.q .bar{background:linear-gradient(90deg,#3a8f7d,var(--good))}
  .metric .val{min-width:46px;text-align:right;font-variant-numeric:tabular-nums}
  .best td{background:rgba(91,233,185,.08)!important}
  .best .rankdot{color:var(--good)}

  .empty{padding:3rem 1.6rem;text-align:center;color:var(--dim)}
  .empty svg{width:40px;height:40px;stroke:var(--faint);fill:none;stroke-width:1.5;margin-bottom:.6rem}

  ::-webkit-scrollbar{width:10px;height:10px}
  ::-webkit-scrollbar-thumb{background:#2a3543;border-radius:6px;border:2px solid var(--bg)}
  ::-webkit-scrollbar-thumb:hover{background:#37475a}
</style>
</head>
<body>
<header>
  <div class="title">
    <h1>sketch-bench profiles</h1>
    <span class="pill" id="rowpill">&nbsp;</span>
  </div>
  <div class="source">__SOURCE__</div>
  <div class="toolbar">
    <div class="tabs">
      <button class="tab active" data-view="all">&#9776; All</button>
      <button class="tab" data-view="insert">&#9889; Best Insert</button>
      <button class="tab" data-view="query">&#128270; Best Query</button>
      <button class="tab" data-view="memory">&#129518; Least Memory</button>
    </div>
    <label class="search">
      <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
      <input id="q" type="text" placeholder="Search impl, config, sketch...">
    </label>
    <button class="btn" id="reset">Reset filters</button>
  </div>
</header>

<div class="facets" id="facets"></div>
<div class="statbar" id="statbar"><span class="facet-label">Stats</span></div>
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
<div class="empty" id="empty" style="display:none">
  <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
  <div>No runs match your filters.</div>
</div>

<script>
const DATA=__DATA__;

/* ---------- config ---------- */
const VS={
  all:{c:'sketch',d:'asc'},
  insert:{c:'insert_mops',d:'desc'},
  query:{c:'query_mops',d:'desc'},
  memory:{c:'memory_bytes',d:'asc'}
};
// categorical facets: multi-select within a group (OR), across groups (AND). empty = all.
const FACETS=[
  {key:'sketch',  label:'Sketch'},
  {key:'workload',label:'Workload'},
  {key:'impl',    label:'Impl'},
  {key:'acc_label',label:'Metric'}
];
// numeric statistic filters: min/max range per metric. scale converts input -> row units.
const NUMF=[
  {key:'insert_mops', label:'Insert M/s', scale:1},
  {key:'query_mops',  label:'Query M/s',  scale:1},
  {key:'memory_bytes',label:'Memory KB',  scale:1024},
  {key:'accuracy',    label:'Accuracy',   scale:1}
];
const SKETCH_COLOR={cms:'#5ad1ff',countsketch:'#7c8cff',hll:'#5be9b9',kll:'#ffd166'};
function implColor(s){let h=0;for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))%360;return h;}

let S={view:'all',col:'sketch',dir:'asc',q:'',
       sel:{sketch:new Set(),workload:new Set(),impl:new Set(),acc_label:new Set()},
       num:{insert_mops:{min:null,max:null},query_mops:{min:null,max:null},
            memory_bytes:{min:null,max:null},accuracy:{min:null,max:null}}};

const MAXI=Math.max(...DATA.map(r=>r.insert_mops||0));
const MAXQ=Math.max(...DATA.map(r=>r.query_mops||0));

/* ---------- helpers ---------- */
function cmp(a,b,d){
  if(a===null&&b===null)return 0;
  if(a===null)return 1; if(b===null)return -1;          // nulls always last
  if(typeof a==='string')return d==='asc'?a.localeCompare(b):b.localeCompare(a);
  return d==='asc'?a-b:b-a;
}
function esc(s){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}

function metricCell(v,max,cls){
  if(v===null||v===undefined)return '<td class="r na">&mdash;</td>';
  const w=Math.max(2,Math.round((v/max)*70));
  return '<td class="r"><div class="metric '+cls+'"><span class="bar" style="width:'+w+'px"></span>'+
         '<span class="val">'+v.toFixed(2)+'</span></div></td>';
}
function accCell(v){
  if(v===null||v===undefined)return '<td class="r na">&mdash;</td>';
  return '<td class="r" style="font-variant-numeric:tabular-nums">'+v.toFixed(4)+'</td>';
}

/* ---------- categorical facets ---------- */
function buildFacets(){
  const host=document.getElementById('facets');
  host.innerHTML='';
  FACETS.forEach(f=>{
    const vals=[...new Set(DATA.map(r=>r[f.key]))].sort();
    const row=document.createElement('div');row.className='facet';
    row.innerHTML='<span class="facet-label">'+f.label+'</span>';
    vals.forEach(v=>{
      const chip=document.createElement('button');
      chip.className='chip';chip.dataset.key=f.key;chip.dataset.val=v;
      chip.innerHTML='<span class="dot"></span>'+esc(v);
      chip.addEventListener('click',()=>{
        const set=S.sel[f.key];
        set.has(v)?set.delete(v):set.add(v);
        chip.classList.toggle('on',set.has(v));
        render();
      });
      row.appendChild(chip);
    });
    host.appendChild(row);
  });
}

/* ---------- numeric statistic filters ---------- */
function buildStatFilters(){
  const host=document.getElementById('statbar');
  NUMF.forEach(nf=>{
    const g=document.createElement('div');g.className='statf';
    g.innerHTML='<span class="nm">'+nf.label+'</span>';
    ['min','max'].forEach((bound,i)=>{
      const inp=document.createElement('input');
      inp.type='number';inp.placeholder=bound;inp.step='any';
      inp.addEventListener('input',()=>{
        const val=inp.value.trim();
        S.num[nf.key][bound]=val===''?null:parseFloat(val);
        inp.classList.toggle('set',val!=='');
        render();
      });
      g.appendChild(inp);
      if(i===0){const s=document.createElement('span');s.className='sep';s.textContent='–';g.appendChild(s);}
    });
    host.appendChild(g);
  });
}

/* ---------- render ---------- */
function render(){
  const q=S.q.trim().toLowerCase();
  let rows=DATA.filter(r=>{
    for(const f of FACETS){const set=S.sel[f.key];if(set.size&&!set.has(r[f.key]))return false;}
    for(const nf of NUMF){
      const rng=S.num[nf.key], v=r[nf.key];
      if(rng.min!==null||rng.max!==null){
        if(v===null||v===undefined)return false;
        if(rng.min!==null&&v<rng.min*nf.scale)return false;
        if(rng.max!==null&&v>rng.max*nf.scale)return false;
      }
    }
    if(S.view==='query'&&r.query_mops===null)return false;
    if(q){
      const hay=(r.sketch+' '+r.impl+' '+r.config+' '+r.workload+' '+r.acc_label).toLowerCase();
      if(!hay.includes(q))return false;
    }
    return true;
  });
  rows.sort((a,b)=>cmp(a[S.col],b[S.col],S.dir));

  const perfView=S.view!=='all';
  document.getElementById('tb').innerHTML=rows.map((r,i)=>{
    const sc=SKETCH_COLOR[r.sketch]||'#9aa8ff';
    const ih=implColor(r.impl);
    const best=perfView&&i===0;
    return '<tr class="'+(best?'best':'')+'">'+
      '<td><span class="sketch-tag" style="color:'+sc+'">'+(best?'<span class="rankdot">★ </span>':'')+esc(r.sketch)+'</span></td>'+
      '<td><span class="badge" style="color:hsl('+ih+',70%,72%);background:hsla('+ih+',70%,55%,.13);border-color:hsla('+ih+',70%,60%,.3)">'+esc(r.impl)+'</span></td>'+
      '<td class="cfg" title="'+esc(r.config)+'">'+esc(r.config)+'</td>'+
      '<td class="na">'+esc(r.workload)+'</td>'+
      metricCell(r.insert_mops,MAXI,'i')+
      metricCell(r.query_mops,MAXQ,'q')+
      '<td class="r" style="font-variant-numeric:tabular-nums">'+esc(r.memory_human)+'</td>'+
      accCell(r.accuracy)+
      '<td class="na">'+esc(r.acc_label)+'</td>'+
    '</tr>';
  }).join('');

  document.getElementById('empty').style.display=rows.length?'none':'block';
  let active=FACETS.reduce((n,f)=>n+S.sel[f.key].size,0)+(q?1:0);
  NUMF.forEach(nf=>{if(S.num[nf.key].min!==null||S.num[nf.key].max!==null)active++;});
  document.getElementById('info').innerHTML=
    'Showing <b>'+rows.length+'</b> of '+DATA.length+' runs'+
    (active?' &middot; '+active+' filter'+(active>1?'s':'')+' active':'');
  document.getElementById('rowpill').textContent=rows.length+' runs';

  document.querySelectorAll('th[data-col]').forEach(th=>{
    const sorted=th.dataset.col===S.col;
    th.classList.toggle('sorted',sorted);
    th.textContent=th.dataset.lbl+(sorted?(S.dir==='asc'?' ▲':' ▼'):'');
  });
}

/* ---------- events ---------- */
document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>{
  document.querySelector('.tab.active').classList.remove('active');
  b.classList.add('active');
  const v=VS[b.dataset.view];
  S.view=b.dataset.view;S.col=v.c;S.dir=v.d;
  render();
}));
document.getElementById('q').addEventListener('input',e=>{S.q=e.target.value;render();});
document.getElementById('reset').addEventListener('click',()=>{
  FACETS.forEach(f=>S.sel[f.key].clear());
  NUMF.forEach(nf=>{S.num[nf.key].min=null;S.num[nf.key].max=null;});
  S.q='';document.getElementById('q').value='';
  document.querySelectorAll('.chip.on').forEach(c=>c.classList.remove('on'));
  document.querySelectorAll('.statf input').forEach(i=>{i.value='';i.classList.remove('set');});
  render();
});
document.querySelectorAll('th[data-col]').forEach(th=>{
  th.dataset.lbl=th.textContent;
  th.addEventListener('click',()=>{
    const c=th.dataset.col, numeric=(c==='insert_mops'||c==='query_mops'||c==='accuracy');
    S.dir=S.col===c?(S.dir==='asc'?'desc':'asc'):(numeric?'desc':'asc');
    S.col=c;render();
  });
});

buildFacets();
buildStatFilters();
render();
</script>
</body>
</html>"##;
