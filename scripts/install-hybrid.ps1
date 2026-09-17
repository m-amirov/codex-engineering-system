param(
  [ValidateSet('auto', 'on', 'off')]
  [string]$Web = 'auto',
  [string]$CodexHome = ''
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Version = (Get-Content (Join-Path $Root 'VERSION') -Raw).Trim()
if (-not $CodexHome) {
  if ($env:CODEX_HOME) { $CodexHome = $env:CODEX_HOME }
  else { $CodexHome = Join-Path $HOME '.codex' }
}
$CodexHome = [System.IO.Path]::GetFullPath($CodexHome)
$AgentsRoot = Join-Path $CodexHome 'agents'
$StateRoot = Join-Path $CodexHome 'ceos'
$ManifestFile = Join-Path $StateRoot 'hybrid-routing.json'
$WebAgentFiles = @(
  @{ File = 'ceos-bulk-checker-web.toml'; Name = 'ceos_bulk_checker_web'; Model = 'chatgpt-web/light'; Fallback = 'ceos_bulk_checker' },
  @{ File = 'ceos-explorer-web.toml'; Name = 'ceos_explorer_web'; Model = 'chatgpt-web/medium'; Fallback = 'ceos_explorer' }
)

$Command = Get-Command 'codex-chatgpt-web' -ErrorAction SilentlyContinue
$Detected = $null -ne $Command
$Enabled = switch ($Web) {
  'on' { $true }
  'off' { $false }
  default { $Detected }
}
$Detection = if ($Web -eq 'on') { 'explicit-on' } elseif ($Web -eq 'off') { 'explicit-off' } elseif ($Detected) { 'codex-chatgpt-web-on-path' } else { 'codex-chatgpt-web-not-detected' }

New-Item -ItemType Directory -Force -Path $AgentsRoot | Out-Null
New-Item -ItemType Directory -Force -Path $StateRoot | Out-Null
$BackupRoot = $null

function Test-CeosWebAgent([string]$Path, [string]$Name) {
  if (-not (Test-Path $Path)) { return $false }
  $Text = Get-Content $Path -Raw
  return $Text.Contains('# CEOS-managed agent;') -and $Text.Contains(('name = "{0}"' -f $Name))
}

foreach ($Agent in $WebAgentFiles) {
  $Source = Join-Path (Join-Path $Root 'agents') $Agent.File
  $Target = Join-Path $AgentsRoot $Agent.File
  if ($Enabled) {
    if (Test-Path $Target) {
      if (-not (Test-CeosWebAgent $Target $Agent.Name)) {
        throw "Refusing to replace non-CEOS agent target: $Target"
      }
      $Current = (Get-FileHash $Target -Algorithm SHA256).Hash
      $Expected = (Get-FileHash $Source -Algorithm SHA256).Hash
      if ($Current -ne $Expected) {
        if (-not $BackupRoot) {
          $Stamp = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH-mm-ss-fffZ')
          $BackupRoot = Join-Path (Join-Path $StateRoot 'backups') $Stamp
          New-Item -ItemType Directory -Force -Path (Join-Path $BackupRoot 'agents') | Out-Null
        }
        Copy-Item $Target (Join-Path (Join-Path $BackupRoot 'agents') $Agent.File) -Force
      }
    }
    Copy-Item $Source $Target -Force
  } elseif ($Web -eq 'off' -and (Test-Path $Target)) {
    if (-not (Test-CeosWebAgent $Target $Agent.Name)) {
      throw "Refusing to remove non-CEOS agent target: $Target"
    }
    Remove-Item $Target -Force
  }
}

$Manifest = [ordered]@{
  schemaVersion = 1
  ceosVersion = $Version
  enabled = $Enabled
  requestedMode = $Web
  detection = $Detection
  detectedCommand = if ($Command) { $Command.Source } else { $null }
  installedAt = (Get-Date).ToUniversalTime().ToString('o')
  webAgents = @($WebAgentFiles | ForEach-Object { [ordered]@{ name = $_.Name; file = $_.File; model = $_.Model; fallback = $_.Fallback } })
  fallbackPolicy = 'single-native-fallback-on-transport-backend-failure-only'
}
$Manifest | ConvertTo-Json -Depth 6 | Set-Content $ManifestFile -Encoding utf8

if ($Enabled) {
  foreach ($Agent in $WebAgentFiles) {
    $Target = Join-Path $AgentsRoot $Agent.File
    if (-not (Test-Path $Target)) { throw "Hybrid agent install verification failed: $Target" }
  }
}

Write-Host ("CEOS {0} hybrid routing: {1} ({2})" -f $Version, $(if ($Enabled) { 'ENABLED' } else { 'DISABLED' }), $Detection)
Write-Host "Manifest: $ManifestFile"
if ($BackupRoot) { Write-Host "Backups: $BackupRoot" }
if ($Web -eq 'auto' -and -not $Detected) {
  Write-Host 'codex-chatgpt-web was not detected on PATH. Native routing remains active. Re-run with -Web auto after installing it, or use -Web on only when the Web transport is configured.'
}
