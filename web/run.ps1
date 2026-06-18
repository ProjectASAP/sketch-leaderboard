#Requires -Version 5.1
# run.ps1 - serve the profiles viewer and open it in the browser.
#
# Serves from this folder (demo\web), so the page auto-loads the local
# all.jsonl sitting next to index.html. Press Ctrl+C to stop.
#
# Usage:
#   .\run.ps1                   # port 8000, auto-loads .\all.jsonl
#   .\run.ps1 -Port 9000        # custom port
#   .\run.ps1 -Src "all.jsonl"  # point at a specific file in this folder

param(
    [int]$Port = 8000,
    [string]$Src = ""
)

$ErrorActionPreference = "Stop"

# Serve from this script's folder (demo\web)
$root = $PSScriptRoot

# Refresh the local copy from the canonical sketch-bench output, if present,
# so the page never serves a stale snapshot.
$canonical = Join-Path $root "..\..\sketch-bench\output\profiles\all.jsonl"
$local = Join-Path $root "all.jsonl"
if (Test-Path $canonical) {
    Copy-Item $canonical $local -Force
    Write-Host "  Refreshed all.jsonl from sketch-bench output." -ForegroundColor Green
}
elseif (-not (Test-Path $local) -and -not $Src) {
    Write-Host "  Note: no all.jsonl found. Put one next to index.html, or pass -Src." -ForegroundColor Yellow
}

# Locate a Python interpreter (its stdlib http.server is all we need)
$py = $null
foreach ($cmd in @("python", "py", "python3")) {
    $found = Get-Command $cmd -ErrorAction SilentlyContinue
    if ($found) { $py = $found.Source; break }
}
if (-not $py) {
    Write-Error "No Python found on PATH. Install Python, or serve web/ with any static server."
    exit 1
}

$path = "/"
if ($Src) { $path += "?src=$([uri]::EscapeDataString($Src))" }
$url = "http://localhost:$Port$path"

Write-Host ""
Write-Host "  Serving  $root"
Write-Host "  Open     $url"
Write-Host "  Stop     Ctrl+C"
Write-Host ""

# Open the browser shortly after the server comes up, then serve in foreground.
Start-Job -ScriptBlock {
    param($u)
    Start-Sleep -Seconds 1
    Start-Process $u
} -ArgumentList $url | Out-Null

Set-Location $root
& $py -m http.server $Port
