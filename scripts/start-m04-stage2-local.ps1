[CmdletBinding()]
param(
  [ValidateRange(1024, 65535)][int]$ApiPort = 55321,
  [ValidateRange(1024, 65535)][int]$DbPort = 55322,
  [ValidateRange(1024, 65535)][int]$ShadowPort = 55320,
  [switch]$Dashboard
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$localRoot = [System.IO.Path]::GetFullPath((Join-Path $repoRoot 'tmp\m04-stage2-supabase'))
$localSupabase = Join-Path $localRoot 'supabase'
$projectId = 'm04_stage2_local'
$cliVersion = '2.115.0'
$excludedServices = 'realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor'
$fixturePath = Join-Path $repoRoot 'supabase\tests\fixtures\m04_m03_prerequisites.sql'
$m04MigrationPath = Join-Path $repoRoot 'supabase\migrations\20260820071959_m04_campaign_planning_launch.sql'
$markerPath = Join-Path $localRoot 'm04-stage2-schema.json'
$envPath = Join-Path $localRoot '.env.m04-stage2.local'
$startedThisRun = $false
$setupComplete = $false

$seedSql = @'
begin;
insert into auth.users (id, email, aud, role, email_confirmed_at, created_at, updated_at)
values (
  '10000000-0000-4000-8000-000000000099', 'm04-stage2@digitalbee.ai',
  'authenticated', 'authenticated', clock_timestamp(), clock_timestamp(), clock_timestamp()
)
on conflict (id) do update set
  email = excluded.email, aud = excluded.aud, role = excluded.role,
  email_confirmed_at = excluded.email_confirmed_at, updated_at = excluded.updated_at;

insert into public.ad_automation_report_users (id, full_name, role, is_active)
values ('10000000-0000-4000-8000-000000000099', 'M04 Local Operator', 'admin', true)
on conflict (id) do update set
  full_name = excluded.full_name, role = excluded.role, is_active = excluded.is_active,
  updated_at = clock_timestamp();

insert into public.ads_ad_accounts (
  id, client_id, platform, provider_account_id, account_name, currency, timezone,
  access_status, access_evidence, access_verified_at, is_active
)
overriding system value
values
  (1, '10000000-0000-4000-8000-000000000001', 'google', 'mock-account-001', 'M04 Mock Google', 'MYR', 'Asia/Kuala_Lumpur', 'verified', '{"source":"m04-stage2-local","mock":true,"client_name":"Stage 2 Fixture Client"}', clock_timestamp(), true),
  (2, '10000000-0000-4000-8000-000000000001', 'meta', 'act_mock_meta_001', 'M04 Mock Meta', 'MYR', 'Asia/Kuala_Lumpur', 'verified', '{"source":"m04-stage2-local","mock":true,"client_name":"Stage 2 Fixture Client"}', clock_timestamp(), true),
  (3, '10000000-0000-4000-8000-000000000001', 'tiktok', 'mock-tiktok-001', 'M04 Mock TikTok', 'MYR', 'Asia/Kuala_Lumpur', 'verified', '{"source":"m04-stage2-local","mock":true,"client_name":"Stage 2 Fixture Client"}', clock_timestamp(), true)
on conflict (id) do update set
  client_id = excluded.client_id, platform = excluded.platform,
  provider_account_id = excluded.provider_account_id, account_name = excluded.account_name,
  currency = excluded.currency, timezone = excluded.timezone,
  access_status = excluded.access_status, access_evidence = excluded.access_evidence,
  access_verified_at = excluded.access_verified_at, is_active = excluded.is_active,
  updated_at = clock_timestamp();

insert into public.ads_budget_packages (
  id, client_id, package_key, package_name, currency, start_date, end_date,
  envelope_amount, committed_amount, status
)
overriding system value
values
  (1, '10000000-0000-4000-8000-000000000001', 'm04-stage2-google', 'M04 Stage 2 Google', 'MYR', '2026-01-01', '2027-12-31', 1000000000, 0, 'active'),
  (2, '10000000-0000-4000-8000-000000000001', 'm04-stage2-meta', 'M04 Stage 2 Meta', 'MYR', '2026-01-01', '2027-12-31', 1000000000, 0, 'active'),
  (3, '10000000-0000-4000-8000-000000000001', 'm04-stage2-tiktok', 'M04 Stage 2 TikTok', 'MYR', '2026-01-01', '2027-12-31', 1000000000, 0, 'active')
on conflict (id) do update set
  client_id = excluded.client_id, package_key = excluded.package_key,
  package_name = excluded.package_name, currency = excluded.currency,
  start_date = excluded.start_date, end_date = excluded.end_date,
  envelope_amount = excluded.envelope_amount, committed_amount = excluded.committed_amount,
  status = excluded.status, updated_at = clock_timestamp();

select pg_catalog.setval(pg_get_serial_sequence('public.ads_ad_accounts', 'id'), (select max(id) from public.ads_ad_accounts), true);
select pg_catalog.setval(pg_get_serial_sequence('public.ads_budget_packages', 'id'), (select max(id) from public.ads_budget_packages), true);
commit;
'@

function Invoke-Captured {
  param([string]$FilePath, [string[]]$Arguments, [AllowNull()][string]$InputText)
  $previousPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    if ($PSBoundParameters.ContainsKey('InputText')) { $output = @($InputText | & $FilePath @Arguments 2>&1) }
    else { $output = @(& $FilePath @Arguments 2>&1) }
    $exitCode = $LASTEXITCODE
  }
  finally { $ErrorActionPreference = $previousPreference }
  return [pscustomobject]@{ ExitCode = $exitCode; Output = $output }
}

function Invoke-Supabase {
  param([string[]]$Arguments)
  $result = Invoke-Captured -FilePath $script:npxPath -Arguments (@('--yes', "supabase@$script:cliVersion") + $Arguments)
  if ($result.ExitCode -ne 0) {
    throw "Pinned Supabase CLI command failed (exit $($result.ExitCode)): $($Arguments[0]). Output was withheld because it may contain local credentials."
  }
  return @($result.Output)
}

function Invoke-Docker {
  param([string[]]$Arguments, [AllowNull()][string]$InputText)
  $call = @{ FilePath = $script:dockerPath; Arguments = $Arguments }
  if ($PSBoundParameters.ContainsKey('InputText')) { $call.InputText = $InputText }
  $result = Invoke-Captured @call
  if ($result.ExitCode -ne 0) { throw "Docker command failed (exit $($result.ExitCode)): $($Arguments[0])." }
  return @($result.Output)
}

function Set-TomlValue {
  param([string[]]$Lines, [string]$Section, [string]$Key, [string]$Value)
  $inside = $false
  for ($index = 0; $index -lt $Lines.Count; $index++) {
    if ($Lines[$index] -match '^\s*\[(?<section>[^]]+)\]\s*$') {
      $inside = $Matches.section -eq $Section
      continue
    }
    if ($inside -and $Lines[$index] -match ("^\s*" + [regex]::Escape($Key) + "\s*=")) {
      $Lines[$index] = "$Key = $Value"
      return $Lines
    }
  }
  throw "Could not set [$Section].$Key in the local Supabase config."
}

function Write-LocalConfig {
  New-Item -ItemType Directory -Path $script:localSupabase -Force | Out-Null
  $destination = Join-Path $script:localSupabase 'config.toml'
  Copy-Item -LiteralPath (Join-Path $script:repoRoot 'supabase\config.toml') -Destination $destination -Force
  $lines = @(Get-Content -LiteralPath $destination)
  $foundProject = $false
  for ($index = 0; $index -lt $lines.Count; $index++) {
    if ($lines[$index] -match '^\s*project_id\s*=') {
      $lines[$index] = "project_id = `"$script:projectId`""
      $foundProject = $true
      break
    }
  }
  if (-not $foundProject) { throw 'Could not set the fixed M04 local project ID.' }
  $lines = @(Set-TomlValue $lines 'api' 'port' $script:ApiPort)
  $lines = @(Set-TomlValue $lines 'db' 'port' $script:DbPort)
  $lines = @(Set-TomlValue $lines 'db' 'shadow_port' $script:ShadowPort)
  $lines = @(Set-TomlValue $lines 'db.migrations' 'enabled' 'false')
  $lines = @(Set-TomlValue $lines 'db.seed' 'enabled' 'false')
  Set-Content -LiteralPath $destination -Value $lines -Encoding utf8
}

function ConvertFrom-StatusEnv {
  param([object[]]$Lines)
  $values = @{}
  foreach ($lineObject in $Lines) {
    if ([string]$lineObject -match '^(?<name>[A-Z][A-Z0-9_]*)="(?<value>.*)"\s*$') {
      $values[$Matches.name] = $Matches.value
    }
  }
  return $values
}

function Assert-LoopbackUri {
  param([string]$Value, [string]$Label, [string[]]$Schemes)
  $uri = $null
  if (-not [System.Uri]::TryCreate($Value, [System.UriKind]::Absolute, [ref]$uri)) { throw "$Label is invalid." }
  if ($Schemes -notcontains $uri.Scheme -or @('127.0.0.1', 'localhost', '::1') -notcontains $uri.Host) {
    throw "$Label is not a supported loopback URI."
  }
}

function Get-ProjectContainers {
  param([switch]$RunningOnly)
  $arguments = if ($RunningOnly) { @('ps', '--format', '{{.Names}}') } else { @('ps', '-a', '--format', '{{.Names}}') }
  $pattern = '^supabase_.+_' + [regex]::Escape($script:projectId) + '$'
  return @((Invoke-Docker $arguments) | ForEach-Object { ([string]$_).Trim() } | Where-Object { $_ -match $pattern })
}

function Assert-MinimalStack {
  $expected = @(
    "supabase_db_$script:projectId", "supabase_auth_$script:projectId",
    "supabase_rest_$script:projectId", "supabase_kong_$script:projectId"
  )
  $running = @(Get-ProjectContainers -RunningOnly)
  $missing = @($expected | Where-Object { $running -notcontains $_ })
  $unexpected = @($running | Where-Object { $expected -notcontains $_ })
  if ($missing.Count -gt 0) { throw "Required M04 local containers are missing: $($missing -join ', ')." }
  if ($unexpected.Count -gt 0) { throw "Unexpected M04 local containers started: $($unexpected -join ', ')." }
}

function Invoke-Sql {
  param([string]$Sql, [string]$Label)
  $result = Invoke-Captured -FilePath $script:dockerPath -Arguments @(
    'exec', '-i', "supabase_db_$script:projectId", 'psql', '-X', '--username', 'postgres',
    '--dbname', 'postgres', '-v', 'ON_ERROR_STOP=1'
  ) -InputText $Sql
  if ($result.ExitCode -ne 0) { throw "$Label failed in the persistent local database." }
}

function Get-SchemaFingerprint {
  param([string[]]$Paths)
  $material = foreach ($path in $Paths) {
    $hash = Get-FileHash -LiteralPath $path -Algorithm SHA256
    "$($hash.Hash):$([System.IO.Path]::GetFileName($path))"
  }
  $bytes = [System.Text.Encoding]::UTF8.GetBytes(($material -join "`n") + "`nm04-stage2-mock-seed-v1")
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try { return ([System.BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant() }
  finally { $sha.Dispose() }
}

try {
  $npxCommand = Get-Command npx.cmd -ErrorAction SilentlyContinue
  if ($null -eq $npxCommand) { $npxCommand = Get-Command npx -ErrorAction Stop }
  $script:npxPath = $npxCommand.Source
  $script:dockerPath = (Get-Command docker -ErrorAction Stop).Source

  $expectedParent = [System.IO.Path]::GetFullPath((Join-Path $repoRoot 'tmp')) + [System.IO.Path]::DirectorySeparatorChar
  if (-not $localRoot.StartsWith($expectedParent, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing unexpected persistent root: $localRoot"
  }
  $ignoreResult = Invoke-Captured -FilePath (Get-Command git -ErrorAction Stop).Source `
    -Arguments @('-C', $repoRoot, 'check-ignore', '--quiet', '--', 'tmp/m04-stage2-supabase/.env.m04-stage2.local')
  if ($ignoreResult.ExitCode -ne 0) { throw 'tmp/m04-stage2-supabase must remain covered by the existing /tmp/ ignore rule.' }

  $stage2Migrations = @(
    Get-ChildItem -LiteralPath (Join-Path $repoRoot 'supabase\migrations') `
      -Filter '*_m04_stage2_platform_revision_details.sql' -File |
      Sort-Object Name
  )
  if ($stage2Migrations.Count -eq 0) { throw 'No M04 Stage 2 platform revision migration exists.' }
  $stage2Migration = $stage2Migrations[-1]
  if ($stage2Migration.Length -le 0) { throw "Latest M04 Stage 2 migration is empty: $($stage2Migration.FullName)" }
  foreach ($path in @($fixturePath, $m04MigrationPath, $stage2Migration.FullName, (Join-Path $repoRoot 'supabase\config.toml'))) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Required local file is missing: $path" }
  }

  $fingerprint = Get-SchemaFingerprint @($fixturePath, $m04MigrationPath, $stage2Migration.FullName)
  if (Test-Path -LiteralPath $markerPath) {
    $marker = Get-Content -Raw -LiteralPath $markerPath | ConvertFrom-Json
    if ($marker.fingerprint -ne $fingerprint) {
      throw 'M04 local schema inputs changed. Run stop-m04-stage2-local.ps1 -Reset, then start again.'
    }
  }

  Write-LocalConfig
  $alreadyRunning = (Get-ProjectContainers -RunningOnly).Count -gt 0
  if (-not $alreadyRunning) {
    Push-Location $localRoot
    try { $null = Invoke-Supabase @('start', '-x', $excludedServices) }
    finally { Pop-Location }
    $startedThisRun = $true
  }
  Assert-MinimalStack

  Push-Location $localRoot
  try { $status = ConvertFrom-StatusEnv @(Invoke-Supabase @('status', '-o', 'env')) }
  finally { Pop-Location }
  foreach ($name in @('API_URL', 'DB_URL', 'SERVICE_ROLE_KEY')) {
    if (-not $status.ContainsKey($name) -or [string]::IsNullOrWhiteSpace([string]$status[$name])) {
      throw "Local Supabase status did not return $name."
    }
  }
  Assert-LoopbackUri $status.API_URL 'M04 API URL' @('http', 'https')
  Assert-LoopbackUri $status.DB_URL 'M04 database URL' @('postgres', 'postgresql')

  if (-not (Test-Path -LiteralPath $markerPath)) {
    Invoke-Sql ([System.IO.File]::ReadAllText($fixturePath)) 'M03 prerequisite fixture'
    Invoke-Sql ([System.IO.File]::ReadAllText($m04MigrationPath)) 'M04 Stage 1 migration'
    Invoke-Sql ([System.IO.File]::ReadAllText($stage2Migration.FullName)) 'M04 Stage 2 migration'
    Invoke-Sql $seedSql 'M04 Stage 2 mock seed'
    [pscustomobject]@{
      fingerprint = $fingerprint
      stage2_migration = $stage2Migration.Name
      seeded_at = [DateTime]::UtcNow.ToString('o')
    } | ConvertTo-Json | Set-Content -LiteralPath $markerPath -Encoding utf8
  }

  $envValues = [ordered]@{
    M04_SUPABASE_URL = [string]$status.API_URL
    M04_SUPABASE_SERVICE_ROLE_KEY = [string]$status.SERVICE_ROLE_KEY
    M04_LOCAL_ACTOR_ID = '10000000-0000-4000-8000-000000000099'
  }
  $envLines = @($envValues.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" })
  Set-Content -LiteralPath $envPath -Value $envLines -Encoding utf8
  foreach ($entry in $envValues.GetEnumerator()) {
    [System.Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, 'Process')
  }

  Write-Output "M04 Stage 2 local Supabase is running at $($status.API_URL)."
  Write-Output "Dedicated M04 environment values were written to $envPath (service key not displayed)."
  $setupComplete = $true

  if ($Dashboard) {
    $npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if ($null -eq $npmCommand) { $npmCommand = Get-Command npm -ErrorAction Stop }
    Write-Output 'Starting the dashboard with the dedicated M04 environment. Supabase will remain running when the dashboard exits.'
    Push-Location $repoRoot
    try { & $npmCommand.Source run dev }
    finally { Pop-Location }
    if ($LASTEXITCODE -ne 0) {
      throw "The dashboard exited with code $LASTEXITCODE. M04 Supabase remains available; use stop-m04-stage2-local.ps1 to preserve and stop it."
    }
  }
}
catch {
  if ($startedThisRun -and -not $setupComplete) {
    try {
      Push-Location $localRoot
      try { $null = Invoke-Supabase @('stop', '--project-id', $projectId) }
      finally { Pop-Location }
    }
    catch { Write-Warning 'The failed start could not stop its exact local project; run stop-m04-stage2-local.ps1.' }
  }
  throw
}
