$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$taskPnpm = Get-Command pnpm -ErrorAction SilentlyContinue
if ($taskPnpm) {
  if (-not (Test-Path -LiteralPath 'node_modules')) { & $taskPnpm.Source install }
  & $taskPnpm.Source dev --host 127.0.0.1 --port 4173
} else {
  $taskNpm = Get-Command npm -ErrorAction Stop
  if (-not (Test-Path -LiteralPath 'node_modules')) { & $taskNpm.Source install }
  & $taskNpm.Source run dev -- --host 127.0.0.1 --port 4173
}
