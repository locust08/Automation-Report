[CmdletBinding()]
param(
  [switch]$Reset
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$localRoot = [System.IO.Path]::GetFullPath((Join-Path $repoRoot 'tmp\m04-stage2-supabase'))
$projectId = 'm04_stage2_local'
$cliVersion = '2.115.0'

function Invoke-Captured {
  param([string]$FilePath, [string[]]$Arguments)
  $previousPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    $output = @(& $FilePath @Arguments 2>&1)
    $exitCode = $LASTEXITCODE
  }
  finally { $ErrorActionPreference = $previousPreference }
  return [pscustomobject]@{ ExitCode = $exitCode; Output = $output }
}

function Invoke-Supabase {
  param([string[]]$Arguments)
  $result = Invoke-Captured -FilePath $script:npxPath `
    -Arguments (@('--yes', "supabase@$script:cliVersion") + $Arguments)
  if ($result.ExitCode -ne 0) {
    throw "Pinned Supabase CLI stop failed (exit $($result.ExitCode)). Output was withheld because it may contain local credentials."
  }
}

function Invoke-Docker {
  param([string[]]$Arguments)
  $result = Invoke-Captured -FilePath $script:dockerPath -Arguments $Arguments
  if ($result.ExitCode -ne 0) { throw "Docker inspection failed (exit $($result.ExitCode))." }
  return @($result.Output)
}

function Get-ProjectContainers {
  $pattern = '^supabase_.+_' + [regex]::Escape($script:projectId) + '$'
  return @(
    (Invoke-Docker @('ps', '-a', '--format', '{{.Names}}')) |
      ForEach-Object { ([string]$_).Trim() } |
      Where-Object { $_ -match $pattern }
  )
}

function Get-ProjectVolumes {
  $pattern = '^supabase_.+_' + [regex]::Escape($script:projectId) + '$'
  return @(
    (Invoke-Docker @('volume', 'ls', '--format', '{{.Name}}')) |
      ForEach-Object { ([string]$_).Trim() } |
      Where-Object { $_ -match $pattern }
  )
}

$npxCommand = Get-Command npx.cmd -ErrorAction SilentlyContinue
if ($null -eq $npxCommand) { $npxCommand = Get-Command npx -ErrorAction Stop }
$script:npxPath = $npxCommand.Source
$script:dockerPath = (Get-Command docker -ErrorAction Stop).Source

$expectedParent = [System.IO.Path]::GetFullPath((Join-Path $repoRoot 'tmp')) + [System.IO.Path]::DirectorySeparatorChar
if (-not $localRoot.StartsWith($expectedParent, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing unexpected persistent root: $localRoot"
}

$volumesBefore = @(Get-ProjectVolumes)
$workingDirectory = if (Test-Path -LiteralPath $localRoot -PathType Container) { $localRoot } else { $repoRoot }
$stopArguments = @('stop', '--project-id', $projectId)
if ($Reset) { $stopArguments += '--no-backup' }

Push-Location $workingDirectory
try { Invoke-Supabase $stopArguments }
finally { Pop-Location }

$containersAfter = @(Get-ProjectContainers)
if ($containersAfter.Count -gt 0) {
  throw "M04 local containers remain after exact stop: $($containersAfter -join ', ')."
}
$volumesAfter = @(Get-ProjectVolumes)

if ($Reset) {
  if ($volumesAfter.Count -gt 0) {
    throw "M04 local volumes remain after reset: $($volumesAfter -join ', ')."
  }
  if (Test-Path -LiteralPath $localRoot) {
    Remove-Item -LiteralPath $localRoot -Recurse -Force
    if (Test-Path -LiteralPath $localRoot) { throw "M04 local root remains after reset: $localRoot" }
  }
  Write-Output 'M04 Stage 2 local Supabase stopped; its scoped local data and environment file were removed.'
}
else {
  if ($volumesBefore.Count -gt 0 -and $volumesAfter.Count -eq 0) {
    throw 'M04 local data volume disappeared during a normal stop; expected preserved data.'
  }
  Write-Output 'M04 Stage 2 local Supabase stopped; its scoped local data was preserved.'
}
