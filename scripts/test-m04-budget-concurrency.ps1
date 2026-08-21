[CmdletBinding()]
param(
  [ValidateRange(5, 100)]
  [int]$Iterations = 5
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$cliVersion = '2.115.0'
$cli = @('npx', '--yes', "supabase@$cliVersion")
$tempBase = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
$tempRoot = Join-Path $tempBase ("m04-budget-concurrency-" + [guid]::NewGuid().ToString('N'))
$tempSupabase = Join-Path $tempRoot 'supabase'
$dbUrl = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
$projectId = 'm04_budget_' + [guid]::NewGuid().ToString('N').Substring(0, 16)
$psqlPath = (Get-Command psql -ErrorAction Stop).Source
$setupScript = Join-Path $repoRoot 'supabase\tests\concurrency\m04_budget_setup.psql'
$sessionScript = Join-Path $repoRoot 'supabase\tests\concurrency\m04_budget_session.psql'
$assertScript = Join-Path $repoRoot 'supabase\tests\concurrency\m04_budget_assert.psql'
$raceProcesses = @()

function Invoke-SupabaseCli {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
  & $cli[0] $cli[1] $cli[2] $Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Supabase CLI failed: $($Arguments -join ' ')"
  }
}

function Invoke-Psql {
  param([string[]]$Arguments)
  & $psqlPath $Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "psql failed: $($Arguments -join ' ')"
  }
}

function Stop-RaceProcesses {
  foreach ($race in $raceProcesses) {
    if ($null -ne $race.Process -and -not $race.Process.HasExited) {
      Stop-Process -Id $race.Process.Id -Force -ErrorAction SilentlyContinue
      $race.Process.WaitForExit(5000) | Out-Null
    }
  }
}

function Wait-ForRaceBarrier {
  $deadline = [DateTime]::UtcNow.AddSeconds(20)
  do {
    $readyOutput = & $psqlPath $dbUrl -X -A -t -v ON_ERROR_STOP=1 -c 'select count(*) from public.m04_budget_race_ready;'
    if ($LASTEXITCODE -ne 0) {
      throw 'Could not inspect the budget race synchronization barrier.'
    }
    $readyCount = [int](($readyOutput | Select-Object -Last 1).Trim())
    if ($readyCount -eq 2) {
      return
    }
    Start-Sleep -Milliseconds 50
  } while ([DateTime]::UtcNow -lt $deadline)

  throw "Timed out waiting for both psql sessions at the synchronization barrier; observed $readyCount of 2."
}

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
  finally {
    Pop-Location
  }

  Invoke-Psql -Arguments @(
    $dbUrl, '-X', '-v', 'ON_ERROR_STOP=1', '-f',
    (Join-Path $repoRoot 'supabase\tests\fixtures\m04_m03_prerequisites.sql')
  )
  Invoke-Psql -Arguments @(
    $dbUrl, '-X', '-v', 'ON_ERROR_STOP=1', '-f',
    (Join-Path $repoRoot 'supabase\migrations\20260820071959_m04_campaign_planning_launch.sql')
  )

  for ($iteration = 1; $iteration -le $Iterations; $iteration++) {
    Invoke-Psql -Arguments @($dbUrl, '-X', '-f', $setupScript)

    $raceProcesses = @()
    foreach ($raceDefinition in @(
      @{ SessionName = 'session-one'; PlanName = 'race-one' },
      @{ SessionName = 'session-two'; PlanName = 'race-two' }
    )) {
      $stdoutPath = Join-Path $tempRoot ("race-$iteration-$($raceDefinition.SessionName).stdout.log")
      $stderrPath = Join-Path $tempRoot ("race-$iteration-$($raceDefinition.SessionName).stderr.log")
      $arguments = @(
        $dbUrl, '-X', '-v', 'ON_ERROR_STOP=1',
        '-v', "session_name=$($raceDefinition.SessionName)",
        '-v', "plan_name=$($raceDefinition.PlanName)",
        '-f', $sessionScript
      )
      $process = Start-Process -FilePath $psqlPath -ArgumentList $arguments `
        -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
      $raceProcesses += [pscustomobject]@{
        SessionName = $raceDefinition.SessionName
        Process = $process
        StdoutPath = $stdoutPath
        StderrPath = $stderrPath
      }
    }

    try {
      Wait-ForRaceBarrier
      Invoke-Psql -Arguments @(
        $dbUrl, '-X', '-v', 'ON_ERROR_STOP=1', '-c',
        'update public.m04_budget_race_gate set released = true where singleton;'
      )

      foreach ($race in $raceProcesses) {
        if (-not $race.Process.WaitForExit(30000)) {
          throw "Race process $($race.SessionName) timed out after barrier release."
        }
        $race.Process.WaitForExit()
        $race.Process.Refresh()
      }
    }
    finally {
      Stop-RaceProcesses
    }

    foreach ($race in $raceProcesses) {
      $stdout = if (Test-Path -LiteralPath $race.StdoutPath) {
        [System.IO.File]::ReadAllText($race.StdoutPath)
      } else { '' }
      $stderr = if (Test-Path -LiteralPath $race.StderrPath) {
        [System.IO.File]::ReadAllText($race.StderrPath)
      } else { '' }
      $combinedOutput = $stdout + [Environment]::NewLine + $stderr
      $isSuccess = $stdout -match '(?m)^M04_BUDGET_RACE_SUCCESS plan_id=[0-9]+\r?$'
      $isOverAllocation = $combinedOutput -match '23514: Budget package does not have enough available allocation'
      if ($isSuccess -eq $isOverAllocation) {
        throw "Race process $($race.SessionName) produced an ambiguous outcome:`n$combinedOutput"
      }
      $successSql = if ($isSuccess) { 'true' } else { 'false' }
      $overAllocationSql = if ($isOverAllocation) { 'true' } else { 'false' }
      $sessionSqlLiteral = switch ($race.SessionName) {
        'session-one' { "'session-one'" }
        'session-two' { "'session-two'" }
        default { throw "Unexpected race session name: $($race.SessionName)" }
      }

      Invoke-Psql -Arguments @(
        $dbUrl, '-X', '-v', 'ON_ERROR_STOP=1',
        '-c', "insert into public.m04_budget_race_results (session_name, succeeded, is_over_allocation) values ($sessionSqlLiteral, $successSql, $overAllocationSql);"
      )
    }

    Invoke-Psql -Arguments @($dbUrl, '-X', '-f', $assertScript)
    Write-Output "Race $iteration/$Iterations PASS"
  }
}
finally {
  Stop-RaceProcesses

  if (Test-Path -LiteralPath $tempRoot) {
    Push-Location $tempRoot
    try {
      Invoke-SupabaseCli stop --no-backup
    }
    catch {
      Write-Warning $_
    }
    finally {
      Pop-Location
    }

    $resolvedTempRoot = [System.IO.Path]::GetFullPath($tempRoot)
    $expectedPrefix = $tempBase + [System.IO.Path]::DirectorySeparatorChar
    $isExpectedTempRoot =
      $resolvedTempRoot.StartsWith($expectedPrefix, [System.StringComparison]::OrdinalIgnoreCase) -and
      ([System.IO.Path]::GetFileName($resolvedTempRoot)).StartsWith('m04-budget-concurrency-')
    if (-not $isExpectedTempRoot) {
      throw "Refusing to remove unexpected temporary path: $resolvedTempRoot"
    }
    Remove-Item -LiteralPath $resolvedTempRoot -Recurse -Force
  }
}
