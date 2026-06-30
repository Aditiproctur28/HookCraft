# ───────────────────────────────────────────────────────────────────────────
#  go-live.ps1 — put HookCraft on the web in one command (Cloudflare Tunnel).
#
#  Usage (from the project root, in PowerShell):
#     .\go-live.ps1            # start the tunnel + backend
#     .\go-live.ps1 -Build     # rebuild the frontend first, then start
#
#  It will:
#    1. start a Cloudflare tunnel to your local backend,
#    2. read the public https URL it hands out,
#    3. write that URL into backend/.env as PUBLIC_BASE,
#    4. start the backend (which serves the site + API on that one URL).
#
#  Open the printed link on your phone / any device. Press Ctrl+C to stop
#  everything (both the tunnel and the backend shut down cleanly).
# ───────────────────────────────────────────────────────────────────────────
param([switch]$Build)

$ErrorActionPreference = 'Stop'
$root     = $PSScriptRoot
$backend  = Join-Path $root 'backend'
$frontend = Join-Path $root 'frontend'
$envFile  = Join-Path $backend '.env'

# Make sure cloudflared (installed via winget) is visible in this session.
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' +
            [Environment]::GetEnvironmentVariable('Path','User')

if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
    Write-Host "cloudflared is not installed. Run:  winget install --id Cloudflare.cloudflared" -ForegroundColor Red
    exit 1
}

# Read the backend port from backend/.env (defaults to 3001).
$port = 3001
$portLine = (Get-Content $envFile -ErrorAction SilentlyContinue |
             Where-Object { $_ -match '^\s*PORT\s*=' } | Select-Object -First 1)
if ($portLine -match '=\s*(\d+)') { $port = $Matches[1] }

# Optional: rebuild the frontend bundle the backend serves.
if ($Build) {
    Write-Host "Building frontend..." -ForegroundColor Cyan
    Push-Location $frontend
    npm run build
    Pop-Location
}

# Warn if there's no built frontend yet.
if (-not (Test-Path (Join-Path $frontend 'dist\index.html'))) {
    Write-Host "No frontend build found. Run '.\go-live.ps1 -Build' once first." -ForegroundColor Yellow
}

# 1. Start the tunnel, capturing its output so we can read the assigned URL.
$outLog = Join-Path $env:TEMP 'hookcraft-tunnel.out'
$errLog = Join-Path $env:TEMP 'hookcraft-tunnel.err'
Remove-Item $outLog, $errLog -ErrorAction SilentlyContinue
Write-Host "Starting Cloudflare tunnel to http://localhost:$port ..." -ForegroundColor Cyan
$tunnel = Start-Process cloudflared `
    -ArgumentList "tunnel --url http://localhost:$port" `
    -PassThru -NoNewWindow -RedirectStandardOutput $outLog -RedirectStandardError $errLog

# 2. Poll for the public https://*.trycloudflare.com URL (up to ~40s).
$publicUrl = $null
for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Seconds 1
    $text = (Get-Content $outLog, $errLog -ErrorAction SilentlyContinue) -join "`n"
    if ($text -match 'https://[a-z0-9-]+\.trycloudflare\.com') { $publicUrl = $Matches[0]; break }
}
if (-not $publicUrl) {
    Write-Host "Couldn't read a tunnel URL. See $errLog" -ForegroundColor Red
    if ($tunnel -and -not $tunnel.HasExited) { Stop-Process -Id $tunnel.Id -Force }
    exit 1
}

# 3. Write PUBLIC_BASE into backend/.env (UTF-8, no BOM so dotenv stays happy).
$lines = @(Get-Content $envFile)
if ($lines -match '^\s*PUBLIC_BASE\s*=') {
    $lines = $lines -replace '^\s*PUBLIC_BASE\s*=.*', "PUBLIC_BASE=$publicUrl"
} else {
    $lines += "PUBLIC_BASE=$publicUrl"
}
[System.IO.File]::WriteAllLines($envFile, $lines, (New-Object System.Text.UTF8Encoding($false)))

# 4. Start the backend in the foreground. Ctrl+C stops it; we then kill the tunnel.
Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  HookCraft is LIVE at:" -ForegroundColor Green
Write-Host "  $publicUrl" -ForegroundColor White
Write-Host "  Open that link on your phone. Ctrl+C here to stop." -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
try {
    Push-Location $backend
    node server.js
} finally {
    Pop-Location
    if ($tunnel -and -not $tunnel.HasExited) { Stop-Process -Id $tunnel.Id -Force }
    Write-Host "Tunnel + backend stopped." -ForegroundColor Cyan
}
