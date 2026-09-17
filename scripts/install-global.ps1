param(
  [ValidateSet('copy', 'link')]
  [string]$Mode = 'copy',
  [string]$CodexHome = '',
  [ValidateSet('auto', 'on', 'off')]
  [string]$Web = 'auto'
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot

Write-Host "Installing Codex Engineering OS from $Root"
npm install -g $Root

$InstallArgs = @('install-global', '--mode', $Mode, '--force')
$StatusArgs = @('global-status')
if ($CodexHome) {
  $InstallArgs += @('--codex-home', $CodexHome)
  $StatusArgs += @('--codex-home', $CodexHome)
}

& ceos @InstallArgs
if ($LASTEXITCODE -ne 0) { throw "ceos install-global failed with exit code $LASTEXITCODE" }

& ceos @StatusArgs
if ($LASTEXITCODE -ne 0) { throw "ceos global-status failed with exit code $LASTEXITCODE" }

$HybridArgs = @('-Web', $Web)
if ($CodexHome) { $HybridArgs += @('-CodexHome', $CodexHome) }
& (Join-Path $PSScriptRoot 'install-hybrid.ps1') @HybridArgs
if ($LASTEXITCODE -ne 0) { throw "install-hybrid.ps1 failed with exit code $LASTEXITCODE" }

Write-Host 'CEOS global installation verified. Hybrid routing state recorded. Start a new Codex session.'
