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
  @{ File = 'ceos-bulk-checker-web.toml'; Name = 'ceos_bulk_checker_web'; Model = 'chatgpt-web/high'; Fallback = 'ceos_bulk_checker' },
  @{ File = 'ceos-reasoner-web.toml'; Name = 'ceos_reasoner_web'; Model = 'chatgpt-web/high'; Fallback = 'parent-selected-native-role' },
  @{ File = 'ceos-art-director-web.toml'; Name = 'ceos_art_director_web'; Model = 'chatgpt-web/high'; Fallback = 'ceos_reviewer' }
)
$LegacyWebAgentFiles = @(
  @{ File = 'ceos-explorer-web.toml'; Name = 'ceos_explorer_web' }
)

$CliCommand = Get-Command 'codex-chatgpt-web' -ErrorAction SilentlyContinue
$PackagedLauncher = $null
if ($env:LOCALAPPDATA) {
  $PackagedLauncher = Join-Path $env:LOCALAPPDATA 'Programs\Codex Web GPT\Codex Web GPT.exe'
}
$PackagedDetected = $PackagedLauncher -and (Test-Path $PackagedLauncher)
$Detected = ($null -ne $CliCommand) -or $PackagedDetected
$DetectedSource = if ($CliCommand) { $CliCommand.Source } elseif ($PackagedDetected) { $PackagedLauncher } else { $null }
$Enabled = switch ($Web) {
  'on' { $true }
  'off' { $false }
  default { $Detected }
}
$Detection = if ($Web -eq 'on') {
  'explicit-on'
} elseif ($Web -eq 'off') {
  'explicit-off'
} elseif ($CliCommand) {
  'codex-chatgpt-web-on-path'
} elseif ($PackagedDetected) {
  'packaged-codex-web-gpt-detected'
} else {
  'codex-chatgpt-web-not-detected'
}

New-Item -ItemType Directory -Force -Path $AgentsRoot | Out-Null
New-Item -ItemType Directory -Force -Path $StateRoot | Out-Null
$BackupRoot = $null

function Test-CeosWebAgent([string]$Path, [string]$Name) {
  if (-not (Test-Path $Path)) { return $false }
  $Text = Get-Content $Path -Raw
  return $Text.Contains('# CEOS-managed agent;') -and $Text.Contains(('name = "{0}"' -f $Name))
}

function Ensure-BackupRoot() {
  if (-not $script:BackupRoot) {
    $Stamp = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH-mm-ss-fffZ')
    $script:BackupRoot = Join-Path (Join-Path $StateRoot 'backups') $Stamp
    New-Item -ItemType Directory -Force -Path (Join-Path $script:BackupRoot 'agents') | Out-Null
  }
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
        Ensure-BackupRoot
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

# Remove the pre-correction 0.3.0 explorer Web agent only when it is recognizably CEOS-managed.
foreach ($Agent in $LegacyWebAgentFiles) {
  $Target = Join-Path $AgentsRoot $Agent.File
  if (Test-Path $Target) {
    if (-not (Test-CeosWebAgent $Target $Agent.Name)) {
      throw "Refusing to remove non-CEOS legacy agent target: $Target"
    }
    Ensure-BackupRoot
    Copy-Item $Target (Join-Path (Join-Path $BackupRoot 'agents') $Agent.File) -Force
    Remove-Item $Target -Force
  }
}

$Manifest = [ordered]@{
  schemaVersion = 2
  ceosVersion = $Version
  enabled = $Enabled
  requestedMode = $Web
  detection = $Detection
  detectedSource = $DetectedSource
  routingMode = 'reasoning-only'
  mcpRequired = $false
  localToolsAssumed = $false
  installedAt = (Get-Date).ToUniversalTime().ToString('o')
  webAgents = @($WebAgentFiles | ForEach-Object { [ordered]@{ name = $_.Name; file = $_.File; model = $_.Model; fallback = $_.Fallback } })
  fallbackPolicy = 'single-native-fallback-on-transport-backend-failure-only'
}
$ManifestJson = $Manifest | ConvertTo-Json -Depth 6
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($ManifestFile, $ManifestJson, $Utf8NoBom)

if ($Enabled) {
  foreach ($Agent in $WebAgentFiles) {
    $Target = Join-Path $AgentsRoot $Agent.File
    if (-not (Test-Path $Target)) { throw "Hybrid agent install verification failed: $Target" }
  }
}

Write-Host ("CEOS {0} Web reasoning routes: {1} ({2})" -f $Version, $(if ($Enabled) { 'ENABLED' } else { 'DISABLED' }), $Detection)
Write-Host ("Mode: reasoning-only; MCP / Full Harness is not required or assumed by CEOS {0}." -f $Version)
Write-Host "Manifest: $ManifestFile"
if ($BackupRoot) { Write-Host "Backups: $BackupRoot" }
if ($Web -eq 'auto' -and -not $Detected) {
  Write-Host 'Codex Web GPT was not detected. Native routing remains active. If ChatGPT Web model rows are already visible in Codex, re-run with -Web on.'
}
