param(
  [ValidateSet('copy', 'link')]
  [string]$Mode = 'copy',
  [string]$CodexHome = '',
  [ValidateSet('auto', 'on', 'off')]
  [string]$Web = 'auto'
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$PackRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("ceos-install-" + [System.Guid]::NewGuid().ToString('N'))

Write-Host "Installing Codex Engineering OS from isolated package built from $Root"

New-Item -ItemType Directory -Path $PackRoot -Force | Out-Null
try {
  $PackOutput = & npm pack $Root --pack-destination $PackRoot --json
  if ($LASTEXITCODE -ne 0) { throw "npm pack failed with exit code $LASTEXITCODE" }

  $PackJsonText = ($PackOutput -join [Environment]::NewLine).Trim()
  if (-not $PackJsonText) { throw 'npm pack returned no package metadata' }

  try {
    $PackMetadata = $PackJsonText | ConvertFrom-Json
  } catch {
    throw "npm pack returned invalid JSON: $($_.Exception.Message)"
  }

  if ($PackMetadata -is [System.Array]) { $PackMetadata = $PackMetadata[0] }
  if (-not $PackMetadata.filename) { throw 'npm pack metadata did not contain filename' }

  $PackagePath = Join-Path $PackRoot $PackMetadata.filename
  if (-not (Test-Path -LiteralPath $PackagePath -PathType Leaf)) {
    throw "npm pack archive not found: $PackagePath"
  }

  & npm install -g $PackagePath
  if ($LASTEXITCODE -ne 0) { throw "npm install -g failed with exit code $LASTEXITCODE" }
} finally {
  Remove-Item -LiteralPath $PackRoot -Recurse -Force -ErrorAction SilentlyContinue
}

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

$HybridParams = @{ Web = $Web }
if ($CodexHome) { $HybridParams.CodexHome = $CodexHome }
& (Join-Path $PSScriptRoot 'install-hybrid.ps1') @HybridParams
if ($LASTEXITCODE -ne 0) { throw "install-hybrid.ps1 failed with exit code $LASTEXITCODE" }

Write-Host 'CEOS global installation verified from an isolated npm package. Optional reasoning-only Web routing state recorded. Start a new Codex session.'
