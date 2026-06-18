# sketch demo

An interactive web viewer for [`sketch-bench`](../sketch-bench) profile output.
Plain **HTML + CSS + JS** in [`web/`](web/) — no build step, no server framework.

It reads a sketch-bench profile dump (`.jsonl` / `.json`) at runtime and shows
it as a sortable spreadsheet. You can:

- filter by **sketch**, **workload**, **impl**, and **metric** (multi-select chips)
- set **min/max ranges** on any statistic (insert M/s, query M/s, memory, accuracy)
- switch to ranked **views**: best insert, best query, least memory

## Run it

First generate the data (from the `sketch-bench` repo):

```powershell
cd ..\sketch-bench
.\scripts\run_profiles.ps1        # writes output\profiles\all.jsonl
```

Then start the viewer:

```powershell
cd ..\demo\web
.\run.ps1                         # refreshes all.jsonl, serves on :8000, opens the browser
```

`run.ps1` copies the latest `all.jsonl` next to the page (if the canonical file
exists) and serves `web/` at <http://localhost:8000/>, where it auto-loads.
Options:

- `.\run.ps1 -Port 9000` — use a different port
- `.\run.ps1 -Src "all.jsonl"` — load a specific file in `web/`

No Python? Serve `web/` with any static file server, or open it behind one —
the page auto-loads `all.jsonl` sitting next to `index.html` (or whatever you
pass via `?src=`).

## Files

| Path | Role |
|------|------|
| `web/index.html` | markup |
| `web/styles.css` | styling |
| `web/app.js`     | loads the JSON, flattens records, runs the table/filters/views |
| `web/run.ps1`    | refresh data + serve + open browser |
| `web/all.jsonl`  | the loaded data (a copy of sketch-bench's `output/profiles/all.jsonl`) |

The page derives `insert_mops` / `query_mops` from the raw `bench` timings and
maps each sketch family's accuracy field, so it consumes sketch-bench output
directly — see [`web/app.js`](web/app.js).

## Note

`leaderboard.html` / `leaderboard.md` are leftover artifacts from the old
Rust leaderboard generator (now removed). They are static and still open in a
browser, but can no longer be regenerated from this folder.
