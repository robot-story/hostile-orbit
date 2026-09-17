$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$record = Join-Path $projectRoot '.runtime/online-processes.json'
if (!(Test-Path $record)) { exit 0 }
$ids = Get-Content $record -Raw | ConvertFrom-Json
foreach ($entry in @(@{id=$ids.relayPid;needle='tools/host-online.mjs'}, @{id=$ids.tunnelPid;needle=(Join-Path $projectRoot '.runtime/cloudflared.exe')})) {
  $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($entry.id)" -ErrorAction SilentlyContinue
  if ($process -and $process.CommandLine.Contains($entry.needle)) { Stop-Process -Id $entry.id }
}
Remove-Item -LiteralPath $record
Remove-Item -LiteralPath (Join-Path $projectRoot '.runtime/online-url.txt') -ErrorAction SilentlyContinue
Write-Host 'Online hosting stopped.'
