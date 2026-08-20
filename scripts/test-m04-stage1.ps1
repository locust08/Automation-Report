[CmdletBinding()]
param(
  [ValidateSet('schema', 'workflow', 'claims', 'm03', 'all')]
  [string]$Suite = 'all',
  [string]$MigrationPath
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$MigrationPath = if ($MigrationPath) { $MigrationPath } else { Join-Path $repoRoot 'supabase\migrations\20260820071959_m04_campaign_planning_launch.sql' }
$cliVersion = '2.115.0'
$cli = @('npx', '--yes', "supabase@$cliVersion")
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("m04-stage1-" + [guid]::NewGuid().ToString('N'))
$tempSupabase = Join-Path $tempRoot 'supabase'
$dbUrl = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
$projectId = 'm04_stage1_' + [guid]::NewGuid().ToString('N').Substring(0, 16)
$testNames = switch ($Suite) {
  'schema' { @('m04_schema_security.test.sql') }
  'workflow' { @('m04_workflow.test.sql') }
  'claims' { @('m04_claims_handoff.test.sql') }
  'm03' { @('m04_m03_compatibility.test.sql') }
  'all' { Get-ChildItem (Join-Path $repoRoot 'supabase\tests') -Filter 'm04_*.test.sql' | Select-Object -ExpandProperty Name }
}

function Invoke-SupabaseCli {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
  & $cli[0] $cli[1] $cli[2] $Arguments
  if ($LASTEXITCODE -ne 0) { throw "Supabase CLI failed: $($Arguments -join ' ')" }
}

try {
  New-Item -ItemType Directory -Path $tempSupabase -Force | Out-Null
  Copy-Item (Join-Path $repoRoot 'supabase\config.toml') (Join-Path $tempSupabase 'config.toml')
  $tempTests = Join-Path $tempSupabase 'tests'
  New-Item -ItemType Directory -Path $tempTests -Force | Out-Null
  foreach ($testName in $testNames) {
    $sourceTest = Join-Path $repoRoot (Join-Path 'supabase\tests' $testName)
    if (-not (Test-Path -LiteralPath $sourceTest)) { throw "Selected test does not exist: $testName" }
    Copy-Item -LiteralPath $sourceTest -Destination (Join-Path $tempTests $testName)
  }
  $configPath = Join-Path $tempSupabase 'config.toml'
  (Get-Content -LiteralPath $configPath) -replace '^project_id = .*$', "project_id = `"$projectId`"" |
    Set-Content -LiteralPath $configPath

  Push-Location $tempRoot
  try {
    Invoke-SupabaseCli start -x gotrue,realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
    & psql $dbUrl -v ON_ERROR_STOP=1 -f (Join-Path $repoRoot 'supabase\tests\fixtures\m04_m03_prerequisites.sql')
    if ($LASTEXITCODE -ne 0) { throw 'M03 prerequisite fixture failed.' }
    & psql $dbUrl -v ON_ERROR_STOP=1 -f $MigrationPath
    if ($LASTEXITCODE -ne 0) { throw 'M04 migration failed.' }

    Invoke-SupabaseCli test db --db-url $dbUrl
  }
  finally {
    Pop-Location
  }
}
finally {
  if (Test-Path $tempRoot) {
    Push-Location $tempRoot
    try { Invoke-SupabaseCli stop --no-backup } catch { Write-Warning $_ }
    finally { Pop-Location }
    Remove-Item -LiteralPath $tempRoot -Recurse -Force
  }
}
