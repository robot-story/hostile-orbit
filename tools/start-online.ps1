param([switch]$NoOpenBrowser)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Set-Location $projectRoot
New-Item -ItemType Directory -Path '.runtime' -Force | Out-Null
$savedUrl = Join-Path $projectRoot '.runtime/online-url.txt'
try {
  $health = Invoke-RestMethod 'http://127.0.0.1:4175/relay-info.json' -TimeoutSec 2
  if ($health.transport -eq 'hostile-orbit-relay' -and (Test-Path $savedUrl)) {
    $url = (Get-Content $savedUrl -Raw).Trim()
    $publicHealth = Invoke-RestMethod ($url.TrimEnd('/') + '/relay-info.json') -TimeoutSec 5
    if ($publicHealth.transport -ne 'hostile-orbit-relay') { throw 'Session link expired' }
    Write-Host "Online game already running: $url"
    if (!$NoOpenBrowser) { Start-Process $url }
    exit 0
  }
} catch {}
if (Test-Path '.runtime/online-processes.json') { & (Join-Path $PSScriptRoot 'stop-online.ps1') }
if (!(Test-Path 'dist/index.html')) { throw 'Build the game first: npm run build' }
$cloudflared = Join-Path $projectRoot '.runtime/cloudflared.exe'
if (!(Test-Path $cloudflared)) { Invoke-WebRequest 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile $cloudflared }
$relay = Start-Process (Get-Command node).Source -ArgumentList 'tools/host-online.mjs' -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput '.runtime/relay.log' -RedirectStandardError '.runtime/relay-error.log' -PassThru
$tunnel = Start-Process $cloudflared -ArgumentList 'tunnel','--url','http://127.0.0.1:4175','--protocol','http2','--no-autoupdate' -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput '.runtime/tunnel-out.log' -RedirectStandardError '.runtime/tunnel.log' -PassThru
@{relayPid=$relay.Id;tunnelPid=$tunnel.Id} | ConvertTo-Json | Set-Content '.runtime/online-processes.json'
for ($i=0; $i -lt 90; $i++) {
  Start-Sleep -Milliseconds 500
  $log = Get-Content '.runtime/tunnel.log' -Raw -ErrorAction SilentlyContinue
  if ($log -match 'https://[a-z0-9-]+\.trycloudflare\.com') {
    $url = $Matches[0]; Set-Content $savedUrl $url
    Write-Host "Online game: $url"
    Write-Host 'Both players open this link. Multiplayer > Host Lobby > Copy Link. Keep this PC awake.'
    Write-Host 'Use Stop HOSTILE ORBIT online.cmd to stop hosting. Restarting creates a new link.'
    if (!$NoOpenBrowser) { Start-Process $url }
    exit 0
  }
}
throw 'Tunnel did not start. See .runtime/tunnel.log.'
