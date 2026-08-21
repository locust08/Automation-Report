[CmdletBinding()]
param(
  [ValidateRange(1, 20)]
  [int]$Iterations = 3
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$cliVersion = '2.115.0'
$cli = @('npx', '--yes', "supabase@$cliVersion")
$tempBase = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
$tempRoot = Join-Path $tempBase ("m04-state-concurrency-" + [guid]::NewGuid().ToString('N'))
$tempSupabase = Join-Path $tempRoot 'supabase'
$dbUrl = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
$projectId = 'm04_state_' + [guid]::NewGuid().ToString('N').Substring(0, 16)
$psqlPath = (Get-Command psql -ErrorAction Stop).Source
$setupScript = Join-Path $repoRoot 'supabase\tests\concurrency\m04_state_setup.psql'
$sessionScript = Join-Path $repoRoot 'supabase\tests\concurrency\m04_state_session.psql'
$assertScript = Join-Path $repoRoot 'supabase\tests\concurrency\m04_state_assert.psql'
$raceProcesses = @()

function Invoke-SupabaseCli {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
  & $cli[0] $cli[1] $cli[2] $Arguments
  if ($LASTEXITCODE -ne 0) { throw "Supabase CLI failed: $($Arguments -join ' ')" }
}

function Invoke-Psql {
  param([string[]]$Arguments)
  & $psqlPath $Arguments
  if ($LASTEXITCODE -ne 0) { throw "psql failed: $($Arguments -join ' ')" }
}

function Stop-RaceProcesses {
  foreach ($race in $raceProcesses) {
    if ($null -ne $race.Process -and -not $race.Process.HasExited) {
      Stop-Process -Id $race.Process.Id -Force -ErrorAction SilentlyContinue
      $race.Process.WaitForExit(5000) | Out-Null
    }
  }
}

function ConvertTo-SqlLiteral {
  param([string]$Value)
  if ($Value -notmatch '^[a-z0-9-]+$') {
    throw "Refusing unsafe state-race SQL literal: $Value"
  }
  return "'$Value'"
}

function Start-StateSession {
  param(
    [hashtable]$Case,
    [ValidateSet('winner', 'loser')][string]$SessionRole,
    [string]$Operation,
    [bool]$HoldOpen,
    [int]$Iteration
  )

  $appPrefix = "m04-state-$Iteration-$($Case.Name)-$SessionRole"
  $stdoutPath = Join-Path $tempRoot ("$appPrefix.stdout.log")
  $stderrPath = Join-Path $tempRoot ("$appPrefix.stderr.log")
  $isClaim = if ($Operation -eq 'claim') { 1 } else { 0 }
  $isTransition = if ($Operation -eq 'transition') { 1 } else { 0 }
  $isApproval = if ($Operation -eq 'approval') { 1 } else { 0 }
  $isRenewal = if ($Operation -eq 'renewal') { 1 } else { 0 }
  $requestKey = if ($SessionRole -eq 'winner') { $Case.WinnerKey } else { $Case.LoserKey }
  $expiryMinutes = if ($SessionRole -eq 'winner') { $Case.WinnerExpiryMinutes } else { $Case.LoserExpiryMinutes }
  $arguments = @(
    $dbUrl, '-X', '-v', 'ON_ERROR_STOP=1',
    '-v', "case_name=$($Case.Name)",
    '-v', "session_role=$SessionRole",
    '-v', "request_key=$requestKey",
    '-v', "expected_plan_lock=$($Case.ExpectedPlanLock)",
    '-v', "expected_from_status=$($Case.ExpectedFromStatus)",
    '-v', "to_status=$($Case.ToStatus)",
    '-v', "expiry_minutes=$expiryMinutes",
    '-v', "is_claim=$isClaim",
    '-v', "is_transition=$isTransition",
    '-v', "is_approval=$isApproval",
    '-v', "is_renewal=$isRenewal",
    '-v', "hold_open=$(if ($HoldOpen) { 1 } else { 0 })",
    '-v', "app_invoking=$appPrefix-invoking",
    '-v', "app_done=$appPrefix-done",
    '-f', $sessionScript
  )
  $process = Start-Process -FilePath $psqlPath -ArgumentList $arguments `
    -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
  $race = [pscustomobject]@{
    CaseName = $Case.Name
    SessionRole = $SessionRole
    AppDone = "$appPrefix-done"
    Process = $process
    StdoutPath = $stdoutPath
    StderrPath = $stderrPath
  }
  $script:raceProcesses += $race
  return $race
}

function Wait-ForApplicationStage {
  param([pscustomobject]$Race, [int]$Seconds = 20)
  $deadline = [DateTime]::UtcNow.AddSeconds($Seconds)
  do {
    $Race.Process.Refresh()
    if ($Race.Process.HasExited) { return $false }
    $appLiteral = ConvertTo-SqlLiteral -Value $Race.AppDone
    $stage = & $psqlPath $dbUrl -X -A -t -v ON_ERROR_STOP=1 `
      -c "select count(*) from pg_catalog.pg_stat_activity where application_name = $appLiteral;"
    if ($LASTEXITCODE -ne 0) { throw 'Could not inspect state-race application stage.' }
    if ([int](($stage | Select-Object -Last 1).Trim()) -eq 1) { return $true }
    Start-Sleep -Milliseconds 40
  } while ([DateTime]::UtcNow -lt $deadline)
  throw "Timed out waiting for $($Race.CaseName)/$($Race.SessionRole) RPC completion stage."
}

function Wait-ForLoserDisposition {
  param([pscustomobject]$Race, [int]$Seconds = 20)
  $deadline = [DateTime]::UtcNow.AddSeconds($Seconds)
  do {
    $Race.Process.Refresh()
    if ($Race.Process.HasExited) { return 'exited' }
    $appInvoking = $Race.AppDone -replace '-done$', '-invoking'
    $appLiteral = ConvertTo-SqlLiteral -Value $appInvoking
    $state = & $psqlPath $dbUrl -X -A -t -F '|' -v ON_ERROR_STOP=1 `
      -c "select coalesce(wait_event_type, ''), state from pg_catalog.pg_stat_activity where application_name = $appLiteral;"
    if ($LASTEXITCODE -ne 0) { throw 'Could not inspect state-race loser lock state.' }
    $last = ($state | Select-Object -Last 1)
    if ($null -ne $last -and $last.Trim().StartsWith('Lock|')) { return 'lock-wait' }
    Start-Sleep -Milliseconds 40
  } while ([DateTime]::UtcNow -lt $deadline)
  throw "Timed out waiting for $($Race.CaseName) loser to block or exit."
}

function Read-RaceOutput {
  param([pscustomobject]$Race)
  $stdout = if (Test-Path -LiteralPath $Race.StdoutPath) { [System.IO.File]::ReadAllText($Race.StdoutPath) } else { '' }
  $stderr = if (Test-Path -LiteralPath $Race.StderrPath) { [System.IO.File]::ReadAllText($Race.StderrPath) } else { '' }
  return $stdout + [Environment]::NewLine + $stderr
}

function Save-RaceResult {
  param([pscustomobject]$Race)
  $output = Read-RaceOutput -Race $Race
  $succeeded = $output -match '(?m)^M04_STATE_RACE_SUCCESS case=.* role=.* result_id=[0-9]+\r?$'
  $staleFailure = $output -match '(?m)ERROR:\s+40001:'
  if ($succeeded -and $staleFailure) {
    throw "State race $($Race.CaseName)/$($Race.SessionRole) produced an ambiguous outcome:`n$output"
  }
  $caseLiteral = switch ($Race.CaseName) {
    'claim-wins-draft' { "'claim-wins-draft'" }
    'claim-wins-cancelled' { "'claim-wins-cancelled'" }
    'transition-wins-draft' { "'transition-wins-draft'" }
    'transition-wins-cancelled' { "'transition-wins-cancelled'" }
    'approval-wins-awaiting' { "'approval-wins-awaiting'" }
    'transition-wins-awaiting' { "'transition-wins-awaiting'" }
    'renewal-cas' { "'renewal-cas'" }
    default { throw "Unexpected race case: $($Race.CaseName)" }
  }
  $roleLiteral = if ($Race.SessionRole -eq 'winner') { "'winner'" } else { "'loser'" }
  $successSql = if ($succeeded) { 'true' } else { 'false' }
  $staleSql = if ($staleFailure) { 'true' } else { 'false' }
  Invoke-Psql -Arguments @(
    $dbUrl, '-X', '-v', 'ON_ERROR_STOP=1', '-c',
    "insert into public.m04_state_race_results (case_name, session_role, succeeded, stale_failure) values ($caseLiteral, $roleLiteral, $successSql, $staleSql);"
  )
}

$cases = @(
  @{ Name = 'claim-wins-draft'; Winner = 'claim'; Loser = 'transition'; ExpectedFromStatus = 'approved'; ToStatus = 'draft'; ExpectedPlanLock = 7; WinnerKey = 'claim-winner-draft'; LoserKey = 'unused-transition'; WinnerExpiryMinutes = 120; LoserExpiryMinutes = 180 },
  @{ Name = 'claim-wins-cancelled'; Winner = 'claim'; Loser = 'transition'; ExpectedFromStatus = 'approved'; ToStatus = 'cancelled'; ExpectedPlanLock = 7; WinnerKey = 'claim-winner-cancelled'; LoserKey = 'unused-transition'; WinnerExpiryMinutes = 120; LoserExpiryMinutes = 180 },
  @{ Name = 'transition-wins-draft'; Winner = 'transition'; Loser = 'claim'; ExpectedFromStatus = 'approved'; ToStatus = 'draft'; ExpectedPlanLock = 7; WinnerKey = 'unused-transition'; LoserKey = 'claim-loser-draft'; WinnerExpiryMinutes = 120; LoserExpiryMinutes = 180 },
  @{ Name = 'transition-wins-cancelled'; Winner = 'transition'; Loser = 'claim'; ExpectedFromStatus = 'approved'; ToStatus = 'cancelled'; ExpectedPlanLock = 7; WinnerKey = 'unused-transition'; LoserKey = 'claim-loser-cancelled'; WinnerExpiryMinutes = 120; LoserExpiryMinutes = 180 },
  @{ Name = 'approval-wins-awaiting'; Winner = 'approval'; Loser = 'transition'; ExpectedFromStatus = 'awaiting_approval'; ToStatus = 'draft'; ExpectedPlanLock = 7; WinnerKey = 'approval-winner'; LoserKey = 'unused-transition'; WinnerExpiryMinutes = 120; LoserExpiryMinutes = 180 },
  @{ Name = 'transition-wins-awaiting'; Winner = 'transition'; Loser = 'approval'; ExpectedFromStatus = 'awaiting_approval'; ToStatus = 'draft'; ExpectedPlanLock = 7; WinnerKey = 'unused-transition'; LoserKey = 'approval-loser'; WinnerExpiryMinutes = 120; LoserExpiryMinutes = 180 },
  @{ Name = 'renewal-cas'; Winner = 'renewal'; Loser = 'renewal'; ExpectedFromStatus = 'launch_in_progress'; ToStatus = 'draft'; ExpectedPlanLock = 7; WinnerKey = 'renewal-winner'; LoserKey = 'renewal-loser'; WinnerExpiryMinutes = 120; LoserExpiryMinutes = 180 }
)

try {
  New-Item -ItemType Directory -Path $tempSupabase -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $repoRoot 'supabase\config.toml') -Destination (Join-Path $tempSupabase 'config.toml')
  $configPath = Join-Path $tempSupabase 'config.toml'
  (Get-Content -LiteralPath $configPath) -replace '^project_id = .*$', "project_id = `"$projectId`"" |
    Set-Content -LiteralPath $configPath

  Push-Location $tempRoot
  try {
    Invoke-SupabaseCli start -x gotrue,realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
  }
  finally { Pop-Location }

  Invoke-Psql -Arguments @($dbUrl, '-X', '-v', 'ON_ERROR_STOP=1', '-f', (Join-Path $repoRoot 'supabase\tests\fixtures\m04_m03_prerequisites.sql'))
  Invoke-Psql -Arguments @($dbUrl, '-X', '-v', 'ON_ERROR_STOP=1', '-f', (Join-Path $repoRoot 'supabase\migrations\20260820071959_m04_campaign_planning_launch.sql'))

  for ($iteration = 1; $iteration -le $Iterations; $iteration++) {
    Invoke-Psql -Arguments @($dbUrl, '-X', '-f', $setupScript)

    foreach ($case in $cases) {
      $raceProcesses = @()
      $winner = Start-StateSession -Case $case -SessionRole winner -Operation $case.Winner -HoldOpen $true -Iteration $iteration
      $winnerReachedDone = Wait-ForApplicationStage -Race $winner

      $loser = Start-StateSession -Case $case -SessionRole loser -Operation $case.Loser -HoldOpen $false -Iteration $iteration
      if ($winnerReachedDone) {
        $null = Wait-ForLoserDisposition -Race $loser
      }

      $caseLiteral = ConvertTo-SqlLiteral -Value $case.Name
      Invoke-Psql -Arguments @(
        $dbUrl, '-X', '-v', 'ON_ERROR_STOP=1', '-c',
        "update public.m04_state_race_release set released = true where case_name = $caseLiteral;"
      )

      try {
        foreach ($race in @($winner, $loser)) {
          if (-not $race.Process.WaitForExit(30000)) {
            throw "State race $($race.CaseName)/$($race.SessionRole) timed out."
          }
          $race.Process.WaitForExit()
          $race.Process.Refresh()
        }
      }
      finally { Stop-RaceProcesses }

      Save-RaceResult -Race $winner
      Save-RaceResult -Race $loser
    }

    Invoke-Psql -Arguments @($dbUrl, '-X', '-f', $assertScript)
    Write-Output "State race $iteration/$Iterations PASS"
  }
}
finally {
  Stop-RaceProcesses
  if (Test-Path -LiteralPath $tempRoot) {
    Push-Location $tempRoot
    try { Invoke-SupabaseCli stop --no-backup }
    catch { Write-Warning $_ }
    finally { Pop-Location }

    $resolvedTempRoot = [System.IO.Path]::GetFullPath($tempRoot)
    $expectedPrefix = $tempBase + [System.IO.Path]::DirectorySeparatorChar
    $isExpectedTempRoot =
      $resolvedTempRoot.StartsWith($expectedPrefix, [System.StringComparison]::OrdinalIgnoreCase) -and
      ([System.IO.Path]::GetFileName($resolvedTempRoot)).StartsWith('m04-state-concurrency-')
    if (-not $isExpectedTempRoot) {
      throw "Refusing to remove unexpected temporary path: $resolvedTempRoot"
    }
    Remove-Item -LiteralPath $resolvedTempRoot -Recurse -Force
  }
}
