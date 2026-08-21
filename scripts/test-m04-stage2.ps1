[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$cliVersion = '2.115.0'
$runToken = [guid]::NewGuid().ToString('N')
$projectId = 'm04_stage2_test_' + $runToken.Substring(0, 16)
$tempBase = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd(
  [char[]]@([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)
)
$tempRoot = Join-Path $tempBase ("m04-stage2-test-$runToken")
$tempSupabase = Join-Path $tempRoot 'supabase'
$fixturePath = Join-Path $repoRoot 'supabase\tests\fixtures\m04_m03_prerequisites.sql'
$m04MigrationPath = Join-Path $repoRoot 'supabase\migrations\20260820071959_m04_campaign_planning_launch.sql'
$stage2MigrationPattern = '*_m04_stage2_platform_revision_details.sql'
$stage2TestPath = Join-Path $repoRoot 'scripts\m04-stage2.test.mts'
$excludedServices = 'realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor'
$requiredContainerNames = @(
  "supabase_db_$projectId",
  "supabase_auth_$projectId",
  "supabase_rest_$projectId",
  "supabase_kong_$projectId"
)
$trackedProcesses = [System.Collections.Generic.List[object]]::new()
$originalEnvironment = @{}
$localSecrets = [System.Collections.Generic.List[string]]::new()
$startAttempted = $false
$runFailure = $null
$testOutput = @()
$cleanupFailures = [System.Collections.Generic.List[string]]::new()

$seedSql = @'
begin;

insert into auth.users (id, email, aud, role, email_confirmed_at, created_at, updated_at)
values (
  '10000000-0000-4000-8000-000000000099',
  'm04-stage2@digitalbee.ai',
  'authenticated',
  'authenticated',
  clock_timestamp(),
  clock_timestamp(),
  clock_timestamp()
)
on conflict (id) do update set
  email = excluded.email,
  aud = excluded.aud,
  role = excluded.role,
  email_confirmed_at = excluded.email_confirmed_at,
  updated_at = excluded.updated_at;

insert into public.ad_automation_report_users (id, full_name, role, is_active)
values ('10000000-0000-4000-8000-000000000099', 'M04 Local Operator', 'admin', true)
on conflict (id) do update set
  full_name = excluded.full_name,
  role = excluded.role,
  is_active = excluded.is_active,
  updated_at = clock_timestamp();

insert into public.ads_ad_accounts (
  id, client_id, platform, provider_account_id, account_name, currency, timezone,
  access_status, access_evidence, access_verified_at, is_active
)
overriding system value
values
  (
    1, '10000000-0000-4000-8000-000000000001', 'google', 'mock-account-001',
    'M04 Mock Google', 'MYR', 'Asia/Kuala_Lumpur', 'verified',
    '{"source":"m04-stage2-local","mock":true,"client_name":"Stage 2 Fixture Client"}'::jsonb, clock_timestamp(), true
  ),
  (
    2, '10000000-0000-4000-8000-000000000001', 'meta', 'act_mock_meta_001',
    'M04 Mock Meta', 'MYR', 'Asia/Kuala_Lumpur', 'verified',
    '{"source":"m04-stage2-local","mock":true,"client_name":"Stage 2 Fixture Client"}'::jsonb, clock_timestamp(), true
  ),
  (
    3, '10000000-0000-4000-8000-000000000001', 'tiktok', 'mock-tiktok-001',
    'M04 Mock TikTok', 'MYR', 'Asia/Kuala_Lumpur', 'verified',
    '{"source":"m04-stage2-local","mock":true,"client_name":"Stage 2 Fixture Client"}'::jsonb, clock_timestamp(), true
  )
on conflict (id) do update set
  client_id = excluded.client_id,
  platform = excluded.platform,
  provider_account_id = excluded.provider_account_id,
  account_name = excluded.account_name,
  currency = excluded.currency,
  timezone = excluded.timezone,
  access_status = excluded.access_status,
  access_evidence = excluded.access_evidence,
  access_verified_at = excluded.access_verified_at,
  is_active = excluded.is_active,
  updated_at = clock_timestamp();

insert into public.ads_budget_packages (
  id, client_id, package_key, package_name, currency, start_date, end_date,
  envelope_amount, committed_amount, status
)
overriding system value
values
  (
    1, '10000000-0000-4000-8000-000000000001', 'm04-stage2-google',
    'M04 Stage 2 Google', 'MYR', '2026-01-01', '2027-12-31', 1000000000, 0, 'active'
  ),
  (
    2, '10000000-0000-4000-8000-000000000001', 'm04-stage2-meta',
    'M04 Stage 2 Meta', 'MYR', '2026-01-01', '2027-12-31', 1000000000, 0, 'active'
  ),
  (
    3, '10000000-0000-4000-8000-000000000001', 'm04-stage2-tiktok',
    'M04 Stage 2 TikTok', 'MYR', '2026-01-01', '2027-12-31', 1000000000, 0, 'active'
  )
on conflict (id) do update set
  client_id = excluded.client_id,
  package_key = excluded.package_key,
  package_name = excluded.package_name,
  currency = excluded.currency,
  start_date = excluded.start_date,
  end_date = excluded.end_date,
  envelope_amount = excluded.envelope_amount,
  committed_amount = excluded.committed_amount,
  status = excluded.status,
  updated_at = clock_timestamp();

select pg_catalog.setval(
  pg_get_serial_sequence('public.ads_ad_accounts', 'id'),
  (select max(id) from public.ads_ad_accounts),
  true
);
select pg_catalog.setval(
  pg_get_serial_sequence('public.ads_budget_packages', 'id'),
  (select max(id) from public.ads_budget_packages),
  true
);

commit;
'@

function Invoke-NativeCapture {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [AllowNull()][string]$InputText
  )

  $previousPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    if ($PSBoundParameters.ContainsKey('InputText')) {
      $output = @($InputText | & $FilePath @Arguments 2>&1)
    }
    else {
      $output = @(& $FilePath @Arguments 2>&1)
    }
    $exitCode = $LASTEXITCODE
  }
  finally {
    $ErrorActionPreference = $previousPreference
  }
  return [pscustomobject]@{ ExitCode = $exitCode; Output = $output }
}

function Invoke-SupabaseCli {
  param([Parameter(Mandatory = $true)][string[]]$Arguments)

  $result = Invoke-NativeCapture -FilePath $script:npxPath `
    -Arguments (@('--yes', "supabase@$script:cliVersion") + $Arguments)
  if ($result.ExitCode -ne 0) {
    throw "Pinned Supabase CLI command failed (exit $($result.ExitCode)): $($Arguments[0]). Output was withheld because it may contain local credentials."
  }
  return @($result.Output)
}

function Invoke-Docker {
  param(
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [AllowNull()][string]$InputText
  )

  $invokeArgs = @{ FilePath = $script:dockerPath; Arguments = $Arguments }
  if ($PSBoundParameters.ContainsKey('InputText')) { $invokeArgs.InputText = $InputText }
  $result = Invoke-NativeCapture @invokeArgs
  if ($result.ExitCode -ne 0) {
    throw "Docker command failed (exit $($result.ExitCode)): $($Arguments[0])."
  }
  return @($result.Output)
}

function Get-DistinctFreeTcpPorts {
  param([Parameter(Mandatory = $true)][int]$Count)

  $ports = [System.Collections.Generic.HashSet[int]]::new()
  while ($ports.Count -lt $Count) {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
    try {
      $listener.Start()
      $null = $ports.Add(([System.Net.IPEndPoint]$listener.LocalEndpoint).Port)
    }
    finally { $listener.Stop() }
  }
  return @($ports)
}

function Set-TomlSectionValue {
  param(
    [Parameter(Mandatory = $true)][AllowEmptyString()][string[]]$Lines,
    [Parameter(Mandatory = $true)][string]$Section,
    [Parameter(Mandatory = $true)][string]$Key,
    [Parameter(Mandatory = $true)][string]$TomlValue
  )

  $insideSection = $false
  $found = $false
  for ($index = 0; $index -lt $Lines.Count; $index++) {
    if ($Lines[$index] -match '^\s*\[(?<section>[^]]+)\]\s*$') {
      $insideSection = $Matches.section -eq $Section
      continue
    }
    if ($insideSection -and $Lines[$index] -match ("^\s*" + [regex]::Escape($Key) + "\s*=")) {
      $Lines[$index] = "$Key = $TomlValue"
      $found = $true
      break
    }
  }
  if (-not $found) { throw "Could not set [$Section].$Key in the disposable Supabase config." }
  return $Lines
}

function Initialize-ProjectConfig {
  param(
    [Parameter(Mandatory = $true)][string]$SourcePath,
    [Parameter(Mandatory = $true)][string]$DestinationPath,
    [Parameter(Mandatory = $true)][int]$ApiPort,
    [Parameter(Mandatory = $true)][int]$DbPort,
    [Parameter(Mandatory = $true)][int]$ShadowPort
  )

  Copy-Item -LiteralPath $SourcePath -Destination $DestinationPath
  $lines = @(Get-Content -LiteralPath $DestinationPath)
  $projectLineFound = $false
  for ($index = 0; $index -lt $lines.Count; $index++) {
    if ($lines[$index] -match '^\s*project_id\s*=') {
      $lines[$index] = "project_id = `"$script:projectId`""
      $projectLineFound = $true
      break
    }
  }
  if (-not $projectLineFound) { throw 'Could not set project_id in the disposable Supabase config.' }
  $lines = @(Set-TomlSectionValue -Lines $lines -Section 'api' -Key 'port' -TomlValue $ApiPort)
  $lines = @(Set-TomlSectionValue -Lines $lines -Section 'db' -Key 'port' -TomlValue $DbPort)
  $lines = @(Set-TomlSectionValue -Lines $lines -Section 'db' -Key 'shadow_port' -TomlValue $ShadowPort)
  $lines = @(Set-TomlSectionValue -Lines $lines -Section 'db.migrations' -Key 'enabled' -TomlValue 'false')
  $lines = @(Set-TomlSectionValue -Lines $lines -Section 'db.seed' -Key 'enabled' -TomlValue 'false')
  Set-Content -LiteralPath $DestinationPath -Value $lines -Encoding utf8
}

function ConvertFrom-SupabaseStatusEnv {
  param([Parameter(Mandatory = $true)][AllowEmptyString()][string[]]$Lines)

  $values = @{}
  foreach ($lineObject in $Lines) {
    $line = [string]$lineObject
    if ($line -match '^(?<name>[A-Z][A-Z0-9_]*)="(?<value>.*)"\s*$') {
      $values[$Matches.name] = $Matches.value
    }
  }
  return $values
}

function Assert-LoopbackUri {
  param(
    [Parameter(Mandatory = $true)][string]$Value,
    [Parameter(Mandatory = $true)][string]$Label,
    [Parameter(Mandatory = $true)][string[]]$AllowedSchemes
  )

  $uri = $null
  if (-not [System.Uri]::TryCreate($Value, [System.UriKind]::Absolute, [ref]$uri)) {
    throw "$Label is not an absolute URI."
  }
  if ($AllowedSchemes -notcontains $uri.Scheme) { throw "$Label has an unexpected scheme." }
  if (@('127.0.0.1', 'localhost', '::1') -notcontains $uri.Host) {
    throw "$Label is not loopback-only; refusing to run the M04 local test."
  }
}

function Set-ScopedEnvironmentVariable {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$Value
  )

  if (-not $script:originalEnvironment.ContainsKey($Name)) {
    $existing = [System.Environment]::GetEnvironmentVariable($Name, 'Process')
    $script:originalEnvironment[$Name] = [pscustomobject]@{
      Exists = $null -ne $existing
      Value = $existing
    }
  }
  [System.Environment]::SetEnvironmentVariable($Name, $Value, 'Process')
}

function Restore-ScopedEnvironment {
  foreach ($name in $script:originalEnvironment.Keys) {
    $saved = $script:originalEnvironment[$name]
    $value = if ($saved.Exists) { $saved.Value } else { $null }
    [System.Environment]::SetEnvironmentVariable($name, $value, 'Process')
  }
}

function Protect-Output {
  param([Parameter(Mandatory = $true)][AllowNull()][AllowEmptyCollection()][object[]]$Lines)

  if ($null -eq $Lines -or $Lines.Count -eq 0) { return @() }

  $protected = foreach ($lineObject in $Lines) {
    $line = [string]$lineObject
    foreach ($secret in $script:localSecrets) {
      if (-not [string]::IsNullOrEmpty($secret)) { $line = $line.Replace($secret, '[REDACTED]') }
    }
    $line -replace '(?i)(SERVICE_ROLE_KEY|SECRET_KEY|JWT_SECRET)(\s*[:=]\s*)("[^"]*"|\S+)', '$1$2[REDACTED]'
  }
  return @($protected)
}

function Invoke-SqlText {
  param(
    [Parameter(Mandatory = $true)][string]$Sql,
    [Parameter(Mandatory = $true)][string]$Label
  )

  $result = Invoke-NativeCapture -FilePath $script:dockerPath `
    -Arguments @('exec', '-i', "supabase_db_$script:projectId", 'psql', '-X', '--username', 'postgres', '--dbname', 'postgres', '-v', 'ON_ERROR_STOP=1') `
    -InputText $Sql
  if ($result.ExitCode -ne 0) { throw "$Label failed in the disposable local database." }
}

function Invoke-SqlFile {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Label
  )

  Invoke-SqlText -Sql ([System.IO.File]::ReadAllText($Path)) -Label $Label
}

function Get-ProjectContainers {
  param([switch]$RunningOnly)

  $arguments = if ($RunningOnly) { @('ps', '--format', '{{.Names}}') } else { @('ps', '-a', '--format', '{{.Names}}') }
  $names = @(Invoke-Docker -Arguments $arguments)
  $pattern = '^supabase_.+_' + [regex]::Escape($script:projectId) + '$'
  return @($names | ForEach-Object { ([string]$_).Trim() } | Where-Object { $_ -match $pattern })
}

function Get-ProjectVolumes {
  $names = @(Invoke-Docker -Arguments @('volume', 'ls', '--format', '{{.Name}}'))
  $pattern = '^supabase_.+_' + [regex]::Escape($script:projectId) + '$'
  return @($names | ForEach-Object { ([string]$_).Trim() } | Where-Object { $_ -match $pattern })
}

function Assert-MinimalStack {
  $running = @(Get-ProjectContainers -RunningOnly)
  $missing = @($script:requiredContainerNames | Where-Object { $running -notcontains $_ })
  $unexpected = @($running | Where-Object { $script:requiredContainerNames -notcontains $_ })
  if ($missing.Count -gt 0) { throw "Required local M04 containers are missing: $($missing -join ', ')." }
  if ($unexpected.Count -gt 0) { throw "Unexpected local M04 containers were started: $($unexpected -join ', ')." }
}

function Start-Stage2TestProcess {
  $stdoutPath = Join-Path $script:tempRoot 'm04-stage2-test.stdout.log'
  $stderrPath = Join-Path $script:tempRoot 'm04-stage2-test.stderr.log'
  $nodePath = (Get-Command node -CommandType Application -ErrorAction Stop).Source
  $tsxCliPath = Join-Path $script:repoRoot 'node_modules\tsx\dist\cli.mjs'
  $testPath = Join-Path $script:repoRoot 'scripts\m04-stage2.test.mts'
  foreach ($requiredPath in @($tsxCliPath, $testPath)) {
    if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
      throw "Required Stage 2 test file is missing: $requiredPath"
    }
  }

  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $nodePath
  $startInfo.Arguments = '"' + $tsxCliPath + '" --test "' + $testPath + '"'
  $startInfo.WorkingDirectory = $script:repoRoot
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true

  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $startInfo
  if (-not $process.Start()) { throw 'Failed to start the M04 Stage 2 test process.' }
  $record = [pscustomobject]@{ Process = $process; StdoutPath = $stdoutPath; StderrPath = $stderrPath }
  $script:trackedProcesses.Add($record)

  $stdoutTask = $process.StandardOutput.ReadToEndAsync()
  $stderrTask = $process.StandardError.ReadToEndAsync()
  $process.WaitForExit()
  $process.Refresh()
  $stdout = $stdoutTask.GetAwaiter().GetResult()
  $stderr = $stderrTask.GetAwaiter().GetResult()
  [System.IO.File]::WriteAllText($stdoutPath, $stdout, [System.Text.UTF8Encoding]::new($false))
  [System.IO.File]::WriteAllText($stderrPath, $stderr, [System.Text.UTF8Encoding]::new($false))

  $exitCode = [int]$process.ExitCode
  $lines = @()
  if (-not [string]::IsNullOrEmpty($stdout)) { $lines += @($stdout -split '\r?\n') }
  if (-not [string]::IsNullOrEmpty($stderr)) { $lines += @($stderr -split '\r?\n') }
  return [pscustomobject]@{ ExitCode = $exitCode; Output = [object[]]$lines }
}

function Stop-AndValidateTrackedProcesses {
  foreach ($record in $script:trackedProcesses) {
    $process = $record.Process
    $process.Refresh()
    if (-not $process.HasExited) {
      Stop-Process -Id $process.Id -Force -ErrorAction Stop
      if (-not $process.WaitForExit(5000)) { throw "Tracked test PID $($process.Id) did not exit." }
    }
    if ($null -ne (Get-Process -Id $process.Id -ErrorAction SilentlyContinue)) {
      throw "Tracked test PID $($process.Id) remains after cleanup."
    }
  }
}

function Protect-TestLogFiles {
  foreach ($record in $script:trackedProcesses) {
    foreach ($path in @($record.StdoutPath, $record.StderrPath)) {
      if (Test-Path -LiteralPath $path) {
        $rawLines = @(Get-Content -LiteralPath $path)
        $safeLines = @(Protect-Output -Lines $rawLines)
        if ($safeLines.Count -eq 0) {
          [System.IO.File]::WriteAllText($path, '', [System.Text.UTF8Encoding]::new($false))
        }
        else {
          Set-Content -LiteralPath $path -Value $safeLines -Encoding utf8
        }
      }
    }
  }
}

try {
  $npxCommand = Get-Command npx.cmd -ErrorAction SilentlyContinue
  if ($null -eq $npxCommand) { $npxCommand = Get-Command npx -ErrorAction Stop }
  $script:npxPath = $npxCommand.Source
  $script:dockerPath = (Get-Command docker -ErrorAction Stop).Source

  foreach ($requiredPath in @($fixturePath, $m04MigrationPath, $stage2TestPath, (Join-Path $repoRoot 'supabase\config.toml'))) {
    if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) { throw "Required local file is missing: $requiredPath" }
  }
  $stage2Migrations = @(
    Get-ChildItem -LiteralPath (Join-Path $repoRoot 'supabase\migrations') -Filter $stage2MigrationPattern -File |
      Sort-Object -Property Name
  )
  if ($stage2Migrations.Count -eq 0) { throw "No migration matches $stage2MigrationPattern." }
  $stage2MigrationPath = $stage2Migrations[-1].FullName
  if ($stage2Migrations[-1].Length -le 0) { throw "Latest Stage 2 migration is empty: $stage2MigrationPath" }

  New-Item -ItemType Directory -Path $tempSupabase -Force | Out-Null
  $ports = @(Get-DistinctFreeTcpPorts -Count 3)
  Initialize-ProjectConfig `
    -SourcePath (Join-Path $repoRoot 'supabase\config.toml') `
    -DestinationPath (Join-Path $tempSupabase 'config.toml') `
    -ApiPort $ports[0] -DbPort $ports[1] -ShadowPort $ports[2]

  $startAttempted = $true
  Push-Location $tempRoot
  try { $null = Invoke-SupabaseCli -Arguments @('start', '-x', $excludedServices) }
  finally { Pop-Location }
  Assert-MinimalStack

  Push-Location $tempRoot
  try { $statusLines = @(Invoke-SupabaseCli -Arguments @('status', '-o', 'env')) }
  finally { Pop-Location }
  $status = ConvertFrom-SupabaseStatusEnv -Lines $statusLines
  foreach ($name in @('API_URL', 'DB_URL', 'SERVICE_ROLE_KEY')) {
    if (-not $status.ContainsKey($name) -or [string]::IsNullOrWhiteSpace([string]$status[$name])) {
      throw "Local Supabase status did not return $name."
    }
  }
  Assert-LoopbackUri -Value $status.API_URL -Label 'M04 Supabase API URL' -AllowedSchemes @('http', 'https')
  Assert-LoopbackUri -Value $status.DB_URL -Label 'M04 Supabase database URL' -AllowedSchemes @('postgres', 'postgresql')
  $localSecrets.Add([string]$status.SERVICE_ROLE_KEY)

  Invoke-SqlFile -Path $fixturePath -Label 'M03 prerequisite fixture'
  Invoke-SqlFile -Path $m04MigrationPath -Label 'M04 Stage 1 migration'
  Invoke-SqlFile -Path $stage2MigrationPath -Label 'M04 Stage 2 migration'
  Invoke-SqlText -Sql $seedSql -Label 'M04 Stage 2 mock seed'

  $localEnvironment = @{
    M04_SUPABASE_URL = [string]$status.API_URL
    M04_SUPABASE_SERVICE_ROLE_KEY = [string]$status.SERVICE_ROLE_KEY
    M04_LOCAL_ACTOR_ID = '10000000-0000-4000-8000-000000000099'
  }
  foreach ($entry in $localEnvironment.GetEnumerator()) {
    Set-ScopedEnvironmentVariable -Name $entry.Key -Value $entry.Value
  }

  $testResult = Start-Stage2TestProcess
  $testOutput = @(Protect-Output -Lines $testResult.Output)
  if ($testResult.ExitCode -ne 0) { throw "M04 Stage 2 tests failed (exit $($testResult.ExitCode))." }
}
catch {
  $runFailure = $_.Exception
}
finally {
  try { Stop-AndValidateTrackedProcesses }
  catch { $cleanupFailures.Add("Tracked-process cleanup failed: $($_.Exception.Message)") }
  try { Protect-TestLogFiles }
  catch { $cleanupFailures.Add("Test-log redaction failed: $($_.Exception.Message)") }
  try { Restore-ScopedEnvironment }
  catch { $cleanupFailures.Add("Environment restoration failed: $($_.Exception.Message)") }

  if ($startAttempted) {
    $stopSucceeded = $false
    if (Test-Path -LiteralPath $tempRoot -PathType Container) {
      Push-Location $tempRoot
      try {
        $null = Invoke-SupabaseCli -Arguments @('stop', '--project-id', $projectId, '--no-backup')
        $stopSucceeded = $true
      }
      catch { $cleanupFailures.Add("Exact Supabase stop failed: $($_.Exception.Message)") }
      finally { Pop-Location }
    }

    $matchingContainers = @('container-verification-not-run')
    $matchingVolumes = @('volume-verification-not-run')
    try {
      $matchingContainers = @(Get-ProjectContainers)
      if ($matchingContainers.Count -gt 0) {
        $cleanupFailures.Add("Matching project containers remain: $($matchingContainers -join ', ')")
      }
    }
    catch { $cleanupFailures.Add("Container cleanup verification failed: $($_.Exception.Message)") }
    try {
      $matchingVolumes = @(Get-ProjectVolumes)
      if ($matchingVolumes.Count -gt 0) {
        $cleanupFailures.Add("Matching disposable project volumes remain: $($matchingVolumes -join ', ')")
      }
    }
    catch { $cleanupFailures.Add("Volume cleanup verification failed: $($_.Exception.Message)") }

    $resolvedTempRoot = [System.IO.Path]::GetFullPath($tempRoot)
    $expectedPrefix = $tempBase + [System.IO.Path]::DirectorySeparatorChar
    $isExpectedTempRoot =
      $resolvedTempRoot.StartsWith($expectedPrefix, [System.StringComparison]::OrdinalIgnoreCase) -and
      ([System.IO.Path]::GetFileName($resolvedTempRoot) -eq "m04-stage2-test-$runToken")
    if (-not $isExpectedTempRoot) {
      $cleanupFailures.Add("Refusing unexpected temporary path: $resolvedTempRoot")
    }
    elseif (
      $stopSucceeded -and
      $matchingContainers.Count -eq 0 -and
      $matchingVolumes.Count -eq 0 -and
      $cleanupFailures.Count -eq 0 -and
      (Test-Path -LiteralPath $resolvedTempRoot)
    ) {
      Remove-Item -LiteralPath $resolvedTempRoot -Recurse -Force
      if (Test-Path -LiteralPath $resolvedTempRoot) {
        $cleanupFailures.Add("Validated temporary root remains after deletion: $resolvedTempRoot")
      }
    }
  }
  elseif (Test-Path -LiteralPath $tempRoot) {
    $resolvedTempRoot = [System.IO.Path]::GetFullPath($tempRoot)
    $expectedPrefix = $tempBase + [System.IO.Path]::DirectorySeparatorChar
    if (
      $resolvedTempRoot.StartsWith($expectedPrefix, [System.StringComparison]::OrdinalIgnoreCase) -and
      ([System.IO.Path]::GetFileName($resolvedTempRoot) -eq "m04-stage2-test-$runToken")
    ) {
      Remove-Item -LiteralPath $resolvedTempRoot -Recurse -Force
    }
    else { $cleanupFailures.Add("Refusing unexpected temporary path: $resolvedTempRoot") }
  }
}

foreach ($line in $testOutput) { Write-Output $line }
if ($cleanupFailures.Count -gt 0) {
  $primary = if ($null -ne $runFailure) { " Primary failure: $($runFailure.Message)" } else { '' }
  throw "M04 Stage 2 cleanup failed closed: $($cleanupFailures -join '; ').$primary"
}
if ($null -ne $runFailure) { throw $runFailure }

Write-Output "M04 Stage 2 local tests passed; disposable project $projectId was removed."
