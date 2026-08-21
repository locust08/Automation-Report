[CmdletBinding()]
param(
  [ValidateRange(1, 20)]
  [int]$Iterations = 3,
  [string]$RunToken = ''
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($RunToken)) {
  $RunToken = [guid]::NewGuid().ToString('N')
}
if ($RunToken -notmatch '^[a-f0-9]{32}$') {
  throw 'RunToken must be exactly 32 lowercase hexadecimal characters.'
}
$repoRoot = Split-Path -Parent $PSScriptRoot
$cliVersion = '2.115.0'
$cli = @('npx', '--yes', "supabase@$cliVersion")
$tempBase = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
$tempRoot = Join-Path $tempBase ("m04-state-concurrency-" + $RunToken)
$tempSupabase = Join-Path $tempRoot 'supabase'
$dbUrl = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
$projectId = 'm04_state_' + $RunToken.Substring(0, 16)
$psqlPath = (Get-Command psql -ErrorAction Stop).Source
$setupScript = Join-Path $repoRoot 'supabase\tests\concurrency\m04_state_setup.psql'
$sessionScript = Join-Path $repoRoot 'supabase\tests\concurrency\m04_state_session.psql'
$assertScript = Join-Path $repoRoot 'supabase\tests\concurrency\m04_state_assert.psql'
$enhancedSetupScript = Join-Path $repoRoot 'supabase\tests\concurrency\m04_state_enhanced_setup.psql'
$lockBlockerScript = Join-Path $repoRoot 'supabase\tests\concurrency\m04_lock_probe_blocker.psql'
$lockRpcScript = Join-Path $repoRoot 'supabase\tests\concurrency\m04_lock_probe_rpc.psql'
$approvalBlockerScript = Join-Path $repoRoot 'supabase\tests\concurrency\m04_approval_parallel_blocker.psql'
$approvalSessionScript = Join-Path $repoRoot 'supabase\tests\concurrency\m04_approval_parallel_session.psql'
$stressSessionScript = Join-Path $repoRoot 'supabase\tests\concurrency\m04_state_stress_session.psql'
$transitionSnapshotBlockerScript = Join-Path $repoRoot 'supabase\tests\concurrency\m04_transition_snapshot_blocker.psql'
$transitionSnapshotRpcScript = Join-Path $repoRoot 'supabase\tests\concurrency\m04_transition_snapshot_rpc.psql'
$expiryBoundaryBlockerScript = Join-Path $repoRoot 'supabase\tests\concurrency\m04_expiry_boundary_blocker.psql'
$expiryBoundaryRpcScript = Join-Path $repoRoot 'supabase\tests\concurrency\m04_expiry_boundary_rpc.psql'
$enhancedAssertScript = Join-Path $repoRoot 'supabase\tests\concurrency\m04_state_enhanced_assert.psql'
$raceProcesses = @()
$trackedProcesses = @()
$enhancedFailures = [System.Collections.Generic.List[string]]::new()

Write-Output "M04 state project ID: $projectId"
Write-Output "M04 state temporary root: $tempRoot"

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
  $stopFailures = [System.Collections.Generic.List[string]]::new()
  foreach ($race in $trackedProcesses) {
    $wasRunning = $null -ne $race.Process -and -not $race.Process.HasExited
    if ($wasRunning) {
      Stop-Process -Id $race.Process.Id -Force -ErrorAction Stop
      if (-not $race.Process.WaitForExit(5000)) {
        $stopFailures.Add("PID $($race.Process.Id) did not exit after forced stop")
      }
      $race.Process.Refresh()
      if (-not $race.Process.HasExited -or $null -ne (Get-Process -Id $race.Process.Id -ErrorAction SilentlyContinue)) {
        $stopFailures.Add("PID $($race.Process.Id) remains after cleanup")
      }
    }
    if ($null -ne $race.Process -and $race.Process.HasExited) {
      try { Complete-ChildOutput -Child $race }
      catch { $stopFailures.Add($_.Exception.Message) }
    }
  }
  if ($stopFailures.Count -gt 0) {
    throw ($stopFailures -join '; ')
  }
}

function ConvertTo-SqlLiteral {
  param([string]$Value)
  if ($Value -notmatch '^[a-z0-9-]+$') {
    throw "Refusing unsafe state-race SQL literal: $Value"
  }
  return "'$Value'"
}

function ConvertTo-WindowsProcessArgument {
  param([AllowEmptyString()][string]$Value)
  if ($Value.Length -gt 0 -and $Value -notmatch '[\s"]') {
    return $Value
  }
  $builder = [System.Text.StringBuilder]::new()
  [void]$builder.Append('"')
  $backslashes = 0
  foreach ($character in $Value.ToCharArray()) {
    if ($character -eq [char]92) {
      $backslashes++
    }
    elseif ($character -eq [char]34) {
      [void]$builder.Append([char]92, (2 * $backslashes) + 1)
      [void]$builder.Append([char]34)
      $backslashes = 0
    }
    else {
      if ($backslashes -gt 0) {
        [void]$builder.Append([char]92, $backslashes)
        $backslashes = 0
      }
      [void]$builder.Append($character)
    }
  }
  if ($backslashes -gt 0) {
    [void]$builder.Append([char]92, 2 * $backslashes)
  }
  [void]$builder.Append('"')
  return $builder.ToString()
}

function Start-TrackedPsqlProcess {
  param(
    [string]$Name,
    [string[]]$Arguments,
    [string]$StdoutPath,
    [string]$StderrPath
  )
  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $psqlPath
  $startInfo.Arguments = (($Arguments | ForEach-Object {
    ConvertTo-WindowsProcessArgument -Value $_
  }) -join ' ')
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $startInfo
  if (-not $process.Start()) {
    throw "Could not start psql child $Name."
  }
  $child = [pscustomobject]@{
    Name = $Name
    Process = $process
    StdoutPath = $StdoutPath
    StderrPath = $StderrPath
    StdoutTask = $process.StandardOutput.ReadToEndAsync()
    StderrTask = $process.StandardError.ReadToEndAsync()
    OutputCaptured = $false
  }
  $script:trackedProcesses += $child
  return $child
}

function Complete-ChildOutput {
  param([pscustomobject]$Child)
  if ($Child.OutputCaptured -or -not $Child.Process.HasExited) { return }
  if (-not $Child.StdoutTask.Wait(5000) -or -not $Child.StderrTask.Wait(5000)) {
    throw "Timed out draining output for child $($Child.Name)."
  }
  [System.IO.File]::WriteAllText($Child.StdoutPath, $Child.StdoutTask.Result)
  [System.IO.File]::WriteAllText($Child.StderrPath, $Child.StderrTask.Result)
  $Child.OutputCaptured = $true
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
  $race = Start-TrackedPsqlProcess -Name $appPrefix -Arguments $arguments `
    -StdoutPath $stdoutPath -StderrPath $stderrPath
  $race | Add-Member -NotePropertyName CaseName -NotePropertyValue $Case.Name
  $race | Add-Member -NotePropertyName SessionRole -NotePropertyValue $SessionRole
  $race | Add-Member -NotePropertyName AppDone -NotePropertyValue "$appPrefix-done"
  $race | Add-Member -NotePropertyName ExpectedErrorMessage -NotePropertyValue $Case.ExpectedErrorMessage
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
  Complete-ChildOutput -Child $Race
  $stdout = if (Test-Path -LiteralPath $Race.StdoutPath) { [System.IO.File]::ReadAllText($Race.StdoutPath) } else { '' }
  $stderr = if (Test-Path -LiteralPath $Race.StderrPath) { [System.IO.File]::ReadAllText($Race.StderrPath) } else { '' }
  return $stdout + [Environment]::NewLine + $stderr
}

function Start-PsqlChild {
  param(
    [string]$Name,
    [string[]]$Arguments
  )
  $stdoutPath = Join-Path $tempRoot ("$Name.stdout.log")
  $stderrPath = Join-Path $tempRoot ("$Name.stderr.log")
  return Start-TrackedPsqlProcess -Name $Name -Arguments $Arguments `
    -StdoutPath $stdoutPath -StderrPath $stderrPath
}

function Read-ChildOutput {
  param([pscustomobject]$Child)
  Complete-ChildOutput -Child $Child
  $stdout = if (Test-Path -LiteralPath $Child.StdoutPath) { [System.IO.File]::ReadAllText($Child.StdoutPath) } else { '' }
  $stderr = if (Test-Path -LiteralPath $Child.StderrPath) { [System.IO.File]::ReadAllText($Child.StderrPath) } else { '' }
  return $stdout + [Environment]::NewLine + $stderr
}

function Wait-ChildExit {
  param([pscustomobject]$Child, [int]$Milliseconds = 30000)
  if (-not $Child.Process.WaitForExit($Milliseconds)) {
    throw "Child $($Child.Name) PID $($Child.Process.Id) timed out."
  }
  $Child.Process.WaitForExit()
  $Child.Process.Refresh()
  Complete-ChildOutput -Child $Child
}

function Wait-ForApplicationName {
  param(
    [string]$ApplicationName,
    [pscustomobject]$Child,
    [int]$Seconds = 20
  )
  $appLiteral = ConvertTo-SqlLiteral -Value $ApplicationName
  $deadline = [DateTime]::UtcNow.AddSeconds($Seconds)
  do {
    $Child.Process.Refresh()
    if ($Child.Process.HasExited) {
      throw "Child $($Child.Name) exited before application stage $ApplicationName.`n$(Read-ChildOutput -Child $Child)"
    }
    $count = & $psqlPath $dbUrl -X -A -t -v ON_ERROR_STOP=1 `
      -c "select count(*) from pg_catalog.pg_stat_activity where application_name = $appLiteral;"
    if ($LASTEXITCODE -ne 0) { throw "Could not inspect application stage $ApplicationName." }
    if ([int](($count | Select-Object -Last 1).Trim()) -eq 1) { return }
    Start-Sleep -Milliseconds 25
  } while ([DateTime]::UtcNow -lt $deadline)
  throw "Timed out waiting for application stage $ApplicationName."
}

function Signal-VerifiedProbe {
  param(
    [string]$CaseName,
    [string]$BlockerApplication,
    [string[]]$RpcApplications,
    [pscustomobject]$Blocker,
    [pscustomobject[]]$RpcChildren = @(),
    [int]$Seconds = 20
  )
  $blockerLiteral = ConvertTo-SqlLiteral -Value $BlockerApplication
  $rpcLiterals = ($RpcApplications | ForEach-Object {
    ConvertTo-SqlLiteral -Value $_
  }) -join ','
  $deadline = [DateTime]::UtcNow.AddSeconds($Seconds)
  do {
    $Blocker.Process.Refresh()
    if ($Blocker.Process.HasExited) {
      throw "Blocker $($Blocker.Name) exited before the real RPC wait was verified.`n$(Read-ChildOutput -Child $Blocker)"
    }
    foreach ($rpcChild in $RpcChildren) {
      $rpcChild.Process.Refresh()
      if ($rpcChild.Process.HasExited) {
        throw "RPC child $($rpcChild.Name) exited before its required lock wait was verified.`n$(Read-ChildOutput -Child $rpcChild)"
      }
    }
    $waitState = & $psqlPath $dbUrl -X -A -t -F '|' -v ON_ERROR_STOP=1 -c @"
with blocker as (
  select pid from pg_catalog.pg_stat_activity where application_name = $blockerLiteral
), waits as (
  select activity.pid, activity.wait_event_type,
    blocker.pid = any(pg_catalog.pg_blocking_pids(activity.pid)) as directly_blocked
  from pg_catalog.pg_stat_activity as activity
  cross join blocker
  where activity.application_name in ($rpcLiterals)
)
select count(*) filter (where wait_event_type = 'Lock'),
       coalesce(bool_or(directly_blocked), false)
from waits;
"@
    if ($LASTEXITCODE -ne 0) { throw "Could not inspect verified lock wait for $CaseName." }
    $parts = (($waitState | Select-Object -Last 1).Trim()) -split '\|'
    if ($parts.Count -eq 2 -and [int]$parts[0] -eq $RpcApplications.Count -and $parts[1] -eq 't') {
      $caseLiteral = ConvertTo-SqlLiteral -Value $CaseName
      Invoke-Psql -Arguments @(
        $dbUrl, '-X', '-v', 'ON_ERROR_STOP=1', '-c',
        "update public.m04_probe_control set probe_now = true where case_name = $caseLiteral;"
      )
      return
    }
    Start-Sleep -Milliseconds 25
  } while ([DateTime]::UtcNow -lt $deadline)
  throw "Timed out verifying the real RPC lock wait for $CaseName."
}

function Test-ExactChildResult {
  param(
    [pscustomobject]$Child,
    [string]$MarkerPattern,
    [string]$Label
  )
  $output = Read-ChildOutput -Child $Child
  $markerCount = [regex]::Matches($output, $MarkerPattern, [System.Text.RegularExpressions.RegexOptions]::Multiline).Count
  if ($Child.Process.ExitCode -ne 0 -or $markerCount -ne 1 `
    -or $output -match '(?im)ERROR:\s+(40P01|57014):') {
    $script:enhancedFailures.Add(
      "$Label failed (exit $($Child.Process.ExitCode), marker count $markerCount):`n$output"
    )
    return $false
  }
  return $true
}

function Test-RecordedChildResult {
  param(
    [pscustomobject]$Child,
    [string]$MarkerPattern,
    [string[]]$AllowedErrorStates,
    [string]$Label
  )
  $output = Read-ChildOutput -Child $Child
  $matches = [regex]::Matches(
    $output,
    $MarkerPattern,
    [System.Text.RegularExpressions.RegexOptions]::Multiline
  )
  if ($matches.Count -ne 1) {
    $script:enhancedFailures.Add(
      "$Label failed (exit $($Child.Process.ExitCode), marker count $($matches.Count)):`n$output"
    )
    return $false
  }
  $sqlstate = $matches[0].Groups['sqlstate'].Value
  $resultId = $matches[0].Groups['result_id'].Value
  $exitCode = $Child.Process.ExitCode
  $isSuccess = $sqlstate -eq '00000'
  $validSuccess = $isSuccess -and $exitCode -eq 0 -and $resultId -match '^[0-9]+$'
  $validError = -not $isSuccess -and $exitCode -eq 3 -and $resultId -eq 'none' `
    -and $AllowedErrorStates -contains $sqlstate
  if ((-not $validSuccess -and -not $validError) `
    -or $output -match '(?im)ERROR:\s+(40P01|57014):') {
    $script:enhancedFailures.Add(
      "$Label had an unexpected exact exit/result (exit $exitCode, sqlstate $sqlstate, result $resultId):`n$output"
    )
    return $false
  }
  return $true
}

function Save-RaceResult {
  param([pscustomobject]$Race)
  $output = Read-RaceOutput -Race $Race
  $escapedCase = [regex]::Escape($Race.CaseName)
  $escapedRole = [regex]::Escape($Race.SessionRole)
  $markerPattern =
    "^M04_STATE_SERIALIZATION_RESULT case=$escapedCase role=$escapedRole " +
    'sqlstate=(?<sqlstate>[0-9A-Z]{5}) result_id=(?<result_id>[0-9]+|none) message=(?<message>[^\r\n]+)\r?$'
  $allMarkerCount = [regex]::Matches(
    $output,
    '^M04_STATE_SERIALIZATION_RESULT .+\r?$',
    [System.Text.RegularExpressions.RegexOptions]::Multiline
  ).Count
  $matches = [regex]::Matches(
    $output, $markerPattern, [System.Text.RegularExpressions.RegexOptions]::Multiline
  )
  if ($allMarkerCount -ne 1 -or $matches.Count -ne 1) {
    throw "State serialization $($Race.CaseName)/$($Race.SessionRole) had $allMarkerCount total markers and $($matches.Count) exact markers:`n$output"
  }

  $sqlstate = $matches[0].Groups['sqlstate'].Value
  $resultId = $matches[0].Groups['result_id'].Value
  $message = $matches[0].Groups['message'].Value
  $exitCode = [int]$Race.Process.ExitCode
  if ($Race.SessionRole -eq 'winner') {
    $valid = $sqlstate -eq '00000' -and $resultId -match '^[0-9]+$' `
      -and $message -eq 'none' -and $exitCode -eq 0 `
      -and $output -notmatch '(?im)ERROR:'
  }
  else {
    $syntheticErrors = [regex]::Matches(
      $output,
      'ERROR:\s+40001:\s+M04_RECORDED_STATE_SERIALIZATION_CHILD_ERROR\r?$',
      [System.Text.RegularExpressions.RegexOptions]::Multiline
    ).Count
    $valid = $sqlstate -eq '40001' -and $resultId -eq 'none' `
      -and $message -ceq $Race.ExpectedErrorMessage -and $exitCode -eq 3 `
      -and $syntheticErrors -eq 1
  }
  if (-not $valid -or $output -match '(?im)ERROR:\s+(40P01|57014):') {
    throw "State serialization $($Race.CaseName)/$($Race.SessionRole) had an unexpected exact result (exit=$exitCode sqlstate=$sqlstate result=$resultId message=$message):`n$output"
  }
}

function Invoke-TransitionSnapshotCase {
  $caseName = 'transition-snapshot'
  $appBlocker = 'm04-transition-snapshot-blocker'
  $appRpc = 'm04-transition-snapshot-rpc'
  $rpc = Start-PsqlChild -Name $appRpc -Arguments @(
    $dbUrl, '-X', '-v', 'ON_ERROR_STOP=1',
    '-v', "case_name=$caseName", '-v', "app_rpc=$appRpc",
    '-f', $transitionSnapshotRpcScript
  )
  Wait-ForApplicationName -ApplicationName "$appRpc-ready" -Child $rpc

  $blocker = Start-PsqlChild -Name $appBlocker -Arguments @(
    $dbUrl, '-X', '-v', 'ON_ERROR_STOP=1',
    '-v', "case_name=$caseName", '-v', "app_blocker=$appBlocker",
    '-f', $transitionSnapshotBlockerScript
  )
  Wait-ForApplicationName -ApplicationName $appBlocker -Child $blocker
  Invoke-Psql -Arguments @(
    $dbUrl, '-X', '-v', 'ON_ERROR_STOP=1', '-c',
    "update public.m04_probe_control set rpc_now = true where case_name = 'transition-snapshot';"
  )
  Signal-VerifiedProbe -CaseName $caseName -BlockerApplication $appBlocker `
    -RpcApplications @($appRpc) -Blocker $blocker -RpcChildren @($rpc)
  Wait-ChildExit -Child $blocker
  Wait-ChildExit -Child $rpc

  $null = Test-ExactChildResult -Child $blocker `
    -MarkerPattern '^M04_TRANSITION_SNAPSHOT_BLOCKER_SUCCESS case=transition-snapshot result_id=[0-9]+\r?$' `
    -Label 'Transition snapshot blocker/real claim'

  $output = Read-ChildOutput -Child $rpc
  $markerPattern =
    '^M04_TRANSITION_SNAPSHOT_RESULT case=transition-snapshot role=transition ' +
    'sqlstate=(?<sqlstate>[0-9A-Z]{5}) result_id=(?<result_id>[0-9]+|none) message=(?<message>[^\r\n]+)\r?$'
  $allMarkerCount = [regex]::Matches(
    $output, '^M04_TRANSITION_SNAPSHOT_RESULT .+\r?$',
    [System.Text.RegularExpressions.RegexOptions]::Multiline
  ).Count
  $matches = [regex]::Matches(
    $output, $markerPattern, [System.Text.RegularExpressions.RegexOptions]::Multiline
  )
  $valid = $false
  if ($allMarkerCount -eq 1 -and $matches.Count -eq 1) {
    $sqlstate = $matches[0].Groups['sqlstate'].Value
    $resultId = $matches[0].Groups['result_id'].Value
    $message = $matches[0].Groups['message'].Value
    $syntheticErrors = [regex]::Matches(
      $output,
      'ERROR:\s+40001:\s+M04_RECORDED_TRANSITION_SNAPSHOT_ERROR\r?$',
      [System.Text.RegularExpressions.RegexOptions]::Multiline
    ).Count
    $valid = $rpc.Process.ExitCode -eq 3 -and $sqlstate -eq '40001' `
      -and $resultId -eq 'none' `
      -and $message -ceq 'Campaign plan status does not match expected state' `
      -and $syntheticErrors -eq 1 `
      -and $output -notmatch '(?im)ERROR:\s+(40P01|57014):'
  }
  if (-not $valid) {
    $script:enhancedFailures.Add(
      "Transition one-snapshot classification failed (exit $($rpc.Process.ExitCode), total markers $allMarkerCount, exact markers $($matches.Count)):`n$output"
    )
  }
}

function Invoke-ExpiryBoundaryCase {
  param([hashtable]$Case)

  $appBlocker = "m04-$($Case.Name)-blocker"
  $appRpc = "m04-$($Case.Name)-rpc"
  $isGate = if ($Case.Operation -eq 'gate') { 1 } else { 0 }
  $blocker = Start-PsqlChild -Name $appBlocker -Arguments @(
    $dbUrl, '-X', '-v', 'ON_ERROR_STOP=1',
    '-v', "case_name=$($Case.Name)", '-v', "app_blocker=$appBlocker",
    '-f', $expiryBoundaryBlockerScript
  )
  Wait-ForApplicationName -ApplicationName $appBlocker -Child $blocker

  $rpc = Start-PsqlChild -Name $appRpc -Arguments @(
    $dbUrl, '-X', '-v', 'ON_ERROR_STOP=1',
    '-v', "case_name=$($Case.Name)", '-v', "app_rpc=$appRpc",
    '-v', "is_gate=$isGate", '-f', $expiryBoundaryRpcScript
  )

  Signal-VerifiedProbe -CaseName $Case.Name -BlockerApplication $appBlocker `
    -RpcApplications @($appRpc) -Blocker $blocker -RpcChildren @($rpc)
  Wait-ChildExit -Child $blocker
  Wait-ChildExit -Child $rpc

  $escapedCase = [regex]::Escape($Case.Name)
  $null = Test-ExactChildResult -Child $blocker `
    -MarkerPattern (
      "^M04_EXPIRY_BOUNDARY_RESULT case=$escapedCase role=blocker " +
      'sqlstate=00000 message=none result_id=[0-9]+ native_exit=0\r?$'
    ) `
    -Label "Expiry-boundary blocker $($Case.Name)"

  $output = Read-ChildOutput -Child $rpc
  $markerPattern =
    "^M04_EXPIRY_BOUNDARY_RESULT case=$escapedCase role=rpc " +
    'sqlstate=(?<sqlstate>[0-9A-Z]{5}) message=(?<message>.+?) ' +
    'result_id=(?<result_id>[0-9]+|none) native_exit=(?<native_exit>[0-9]+)\r?$'
  $allMarkerCount = [regex]::Matches(
    $output, '^M04_EXPIRY_BOUNDARY_RESULT .+\r?$',
    [System.Text.RegularExpressions.RegexOptions]::Multiline
  ).Count
  $matches = [regex]::Matches(
    $output, $markerPattern, [System.Text.RegularExpressions.RegexOptions]::Multiline
  )
  $valid = $false
  if ($allMarkerCount -eq 1 -and $matches.Count -eq 1) {
    $sqlstate = $matches[0].Groups['sqlstate'].Value
    $message = $matches[0].Groups['message'].Value
    $resultId = $matches[0].Groups['result_id'].Value
    $nativeExit = $matches[0].Groups['native_exit'].Value
    $syntheticErrors = [regex]::Matches(
      $output,
      'ERROR:\s+55P03:\s+M04_RECORDED_EXPIRY_BOUNDARY_CHILD_ERROR\r?$',
      [System.Text.RegularExpressions.RegexOptions]::Multiline
    ).Count
    $valid = $rpc.Process.ExitCode -eq 3 -and $sqlstate -eq '55P03' `
      -and $message -ceq 'A different active gate claim already exists' `
      -and $resultId -eq 'none' -and $nativeExit -eq '3' `
      -and $syntheticErrors -eq 1 `
      -and $output -notmatch '(?im)ERROR:\s+(40P01|57014):'
  }
  if (-not $valid) {
    $script:enhancedFailures.Add(
      "Expiry-boundary RPC $($Case.Name) failed exact classification (exit $($rpc.Process.ExitCode), total markers $allMarkerCount, exact markers $($matches.Count)):`n$output"
    )
  }
}

function Invoke-LockProbe {
  param([hashtable]$Case)

  $appBlocker = "m04-lock-$($Case.Name)-blocker"
  $appRpc = "m04-lock-$($Case.Name)-rpc"
  $secondIsPlan = if ($Case.Second -eq 'plan') { 1 } else { 0 }
  $secondIsAttempt = if ($Case.Second -eq 'attempt') { 1 } else { 0 }
  $secondIsPackage = if ($Case.Second -eq 'package') { 1 } else { 0 }
  $secondIsAccount = if ($Case.Second -eq 'account') { 1 } else { 0 }
  $firstIsBuild = if ($Case.First -eq 'build') { 1 } else { 0 }
  $firstIsPlan = if ($Case.First -eq 'plan') { 1 } else { 0 }
  $firstIsPackage = if ($Case.First -eq 'package') { 1 } else { 0 }
  $usesExtendedClaimOrderProbe = $Case.Name -in @(
    'claim-package', 'claim-account', 'retry-package', 'retry-account'
  )
  $probeBlockerScript = if ($usesExtendedClaimOrderProbe) {
    $expiryBoundaryBlockerScript
  } else {
    $lockBlockerScript
  }
  $probeRpcScript = if ($usesExtendedClaimOrderProbe) {
    $expiryBoundaryRpcScript
  } else {
    $lockRpcScript
  }
  $blocker = Start-PsqlChild -Name $appBlocker -Arguments @(
    $dbUrl, '-X', '-v', 'ON_ERROR_STOP=1',
    '-v', "probe_case=$($Case.Name)", '-v', "fixture=$($Case.Fixture)",
    '-v', "app_blocker=$appBlocker", '-v', "app_rpc=$appRpc",
    '-v', "second_is_plan=$secondIsPlan", '-v', "second_is_attempt=$secondIsAttempt",
    '-v', "second_is_package=$secondIsPackage", '-v', "second_is_account=$secondIsAccount",
    '-v', "first_is_build=$firstIsBuild", '-v', "first_is_plan=$firstIsPlan",
    '-v', "first_is_package=$firstIsPackage", '-f', $probeBlockerScript
  )
  Wait-ForApplicationName -ApplicationName $appBlocker -Child $blocker

  $operationFlags = @{}
  foreach ($operation in @('claim', 'retry', 'transition', 'renewal', 'handoff', 'qa', 'initial')) {
    $operationFlags[$operation] = if ($Case.Operation -eq $operation) { 1 } else { 0 }
  }
  $rpc = Start-PsqlChild -Name $appRpc -Arguments @(
    $dbUrl, '-X', '-v', 'ON_ERROR_STOP=1',
    '-v', "probe_case=$($Case.Name)", '-v', "fixture=$($Case.Fixture)",
    '-v', "app_rpc=$appRpc", '-v', "to_status=$($Case.ToStatus)",
    '-v', "is_claim=$($operationFlags.claim)", '-v', "is_retry=$($operationFlags.retry)",
    '-v', "is_transition=$($operationFlags.transition)", '-v', "is_renewal=$($operationFlags.renewal)",
    '-v', "is_handoff=$($operationFlags.handoff)", '-v', "is_qa=$($operationFlags.qa)",
    '-v', "is_initial=$($operationFlags.initial)", '-f', $probeRpcScript
  )

  Signal-VerifiedProbe -CaseName $Case.Name -BlockerApplication $appBlocker `
    -RpcApplications @($appRpc) -Blocker $blocker -RpcChildren @($rpc)
  Wait-ChildExit -Child $blocker
  Wait-ChildExit -Child $rpc
  $escapedCase = [regex]::Escape($Case.Name)
  $null = Test-ExactChildResult -Child $blocker `
    -MarkerPattern "^M04_LOCK_PROBE_PROVEN case=$escapedCase\r?$" `
    -Label "Neutral lock blocker $($Case.Name)"
  $null = Test-ExactChildResult -Child $rpc `
    -MarkerPattern "^M04_LOCK_PROBE_RPC_SUCCESS case=$escapedCase result_id=[0-9]+\r?$" `
    -Label "Real lock-probe RPC $($Case.Name)"
}

function Invoke-ApprovalParallelCase {
  param([hashtable]$Case)

  $appBlocker = "m04-approval-$($Case.Name)-blocker"
  $appOne = "m04-approval-$($Case.Name)-one"
  $appTwo = "m04-approval-$($Case.Name)-two"
  $blocker = Start-PsqlChild -Name $appBlocker -Arguments @(
    $dbUrl, '-X', '-v', 'ON_ERROR_STOP=1',
    '-v', "case_name=$($Case.Name)", '-v', "fixture=$($Case.Fixture)",
    '-v', "app_blocker=$appBlocker", '-v', "app_one=$appOne", '-v', "app_two=$appTwo",
    '-f', $approvalBlockerScript
  )
  Wait-ForApplicationName -ApplicationName $appBlocker -Child $blocker

  $one = Start-PsqlChild -Name $appOne -Arguments @(
    $dbUrl, '-X', '-v', 'ON_ERROR_STOP=1',
    '-v', "case_name=$($Case.Name)", '-v', "fixture=$($Case.Fixture)",
    '-v', 'session_role=one', '-v', "request_key=$($Case.RequestKey)",
    '-v', 'actor_id=00000000-0000-0000-0000-000000000461',
    '-v', "app_session=$appOne", '-f', $approvalSessionScript
  )
  $two = Start-PsqlChild -Name $appTwo -Arguments @(
    $dbUrl, '-X', '-v', 'ON_ERROR_STOP=1',
    '-v', "case_name=$($Case.Name)", '-v', "fixture=$($Case.Fixture)",
    '-v', 'session_role=two', '-v', "request_key=$($Case.RequestKey)",
    '-v', "actor_id=$($Case.SecondActor)", '-v', "app_session=$appTwo",
    '-f', $approvalSessionScript
  )

  Signal-VerifiedProbe -CaseName $Case.Name -BlockerApplication $appBlocker `
    -RpcApplications @($appOne, $appTwo) -Blocker $blocker -RpcChildren @($one, $two)
  Wait-ChildExit -Child $blocker
  Wait-ChildExit -Child $one
  Wait-ChildExit -Child $two
  $escapedCase = [regex]::Escape($Case.Name)
  $null = Test-ExactChildResult -Child $blocker `
    -MarkerPattern "^M04_APPROVAL_BLOCKER_RELEASED case=$escapedCase\r?$" `
    -Label "Approval blocker $($Case.Name)"
  foreach ($session in @($one, $two)) {
    $role = if ($session -eq $one) { 'one' } else { 'two' }
    $allowedErrors = if ($Case.Name -eq 'conflict') { @('22023') } else { @() }
    $null = Test-RecordedChildResult -Child $session `
      -MarkerPattern "^M04_APPROVAL_PARALLEL_RESULT case=$escapedCase role=$role sqlstate=(?<sqlstate>[0-9A-Z]{5}) result_id=(?<result_id>[0-9]+|none)\r?$" `
      -AllowedErrorStates $allowedErrors `
      -Label "Approval session $($Case.Name)/$role"
  }
}

function Invoke-StressCase {
  param([string]$CaseName, [string]$ToStatus)

  $appClaim = "m04-stress-$CaseName-claim-waiting"
  $appTransition = "m04-stress-$CaseName-transition-waiting"
  $claim = Start-PsqlChild -Name $appClaim -Arguments @(
    $dbUrl, '-X', '-v', 'ON_ERROR_STOP=1', '-v', "case_name=$CaseName",
    '-v', 'session_role=claim', '-v', "to_status=$ToStatus",
    '-v', "app_waiting=$appClaim", '-f', $stressSessionScript
  )
  $transition = Start-PsqlChild -Name $appTransition -Arguments @(
    $dbUrl, '-X', '-v', 'ON_ERROR_STOP=1', '-v', "case_name=$CaseName",
    '-v', 'session_role=transition', '-v', "to_status=$ToStatus",
    '-v', "app_waiting=$appTransition", '-f', $stressSessionScript
  )
  Wait-ForApplicationName -ApplicationName $appClaim -Child $claim
  Wait-ForApplicationName -ApplicationName $appTransition -Child $transition
  $caseLiteral = ConvertTo-SqlLiteral -Value $CaseName
  Invoke-Psql -Arguments @(
    $dbUrl, '-X', '-v', 'ON_ERROR_STOP=1', '-c',
    "update public.m04_stress_release set released = true where case_name = $caseLiteral;"
  )
  Wait-ChildExit -Child $claim
  Wait-ChildExit -Child $transition
  $escapedCase = [regex]::Escape($CaseName)
  foreach ($session in @($claim, $transition)) {
    $role = if ($session -eq $claim) { 'claim' } else { 'transition' }
    $null = Test-RecordedChildResult -Child $session `
      -MarkerPattern "^M04_STATE_STRESS_RESULT case=$escapedCase role=$role sqlstate=(?<sqlstate>[0-9A-Z]{5}) result_id=(?<result_id>[0-9]+|none)\r?$" `
      -AllowedErrorStates @('40001') `
      -Label "State stress $CaseName/$role"
  }
}

$cases = @(
  @{ Name = 'claim-wins-draft'; Winner = 'claim'; Loser = 'transition'; ExpectedFromStatus = 'approved'; ToStatus = 'draft'; ExpectedPlanLock = 7; WinnerKey = 'claim-winner-draft'; LoserKey = 'unused-transition'; WinnerExpiryMinutes = 120; LoserExpiryMinutes = 180; ExpectedErrorMessage = 'Campaign plan or pending build changed while transition waited' },
  @{ Name = 'claim-wins-cancelled'; Winner = 'claim'; Loser = 'transition'; ExpectedFromStatus = 'approved'; ToStatus = 'cancelled'; ExpectedPlanLock = 7; WinnerKey = 'claim-winner-cancelled'; LoserKey = 'unused-transition'; WinnerExpiryMinutes = 120; LoserExpiryMinutes = 180; ExpectedErrorMessage = 'Campaign plan or pending build changed while transition waited' },
  @{ Name = 'transition-wins-draft'; Winner = 'transition'; Loser = 'claim'; ExpectedFromStatus = 'approved'; ToStatus = 'draft'; ExpectedPlanLock = 7; WinnerKey = 'unused-transition'; LoserKey = 'claim-loser-draft'; WinnerExpiryMinutes = 120; LoserExpiryMinutes = 180; ExpectedErrorMessage = 'Campaign plan and build launch states do not match' },
  @{ Name = 'transition-wins-cancelled'; Winner = 'transition'; Loser = 'claim'; ExpectedFromStatus = 'approved'; ToStatus = 'cancelled'; ExpectedPlanLock = 7; WinnerKey = 'unused-transition'; LoserKey = 'claim-loser-cancelled'; WinnerExpiryMinutes = 120; LoserExpiryMinutes = 180; ExpectedErrorMessage = 'Campaign plan and build launch states do not match' },
  @{ Name = 'approval-wins-awaiting'; Winner = 'approval'; Loser = 'transition'; ExpectedFromStatus = 'awaiting_approval'; ToStatus = 'draft'; ExpectedPlanLock = 7; WinnerKey = 'approval-winner'; LoserKey = 'unused-transition'; WinnerExpiryMinutes = 120; LoserExpiryMinutes = 180; ExpectedErrorMessage = 'Campaign plan status changed while transition waited' },
  @{ Name = 'transition-wins-awaiting'; Winner = 'transition'; Loser = 'approval'; ExpectedFromStatus = 'awaiting_approval'; ToStatus = 'draft'; ExpectedPlanLock = 7; WinnerKey = 'unused-transition'; LoserKey = 'approval-loser'; WinnerExpiryMinutes = 120; LoserExpiryMinutes = 180; ExpectedErrorMessage = 'Campaign plan status changed while approval waited' },
  @{ Name = 'renewal-cas'; Winner = 'renewal'; Loser = 'renewal'; ExpectedFromStatus = 'launch_in_progress'; ToStatus = 'draft'; ExpectedPlanLock = 7; WinnerKey = 'renewal-winner'; LoserKey = 'renewal-loser'; WinnerExpiryMinutes = 120; LoserExpiryMinutes = 180; ExpectedErrorMessage = 'Campaign plan lock version is stale' }
)

$lockProbeCases = @(
  @{ Name = 'claim'; Fixture = 'probe-claim'; Operation = 'claim'; First = 'build'; Second = 'plan'; ToStatus = 'draft' },
  @{ Name = 'retry'; Fixture = 'probe-retry'; Operation = 'retry'; First = 'build'; Second = 'plan'; ToStatus = 'draft' },
  @{ Name = 'claim-package'; Fixture = 'probe-claim-package'; Operation = 'claim'; First = 'plan'; Second = 'package'; ToStatus = 'draft' },
  @{ Name = 'claim-account'; Fixture = 'probe-claim-account'; Operation = 'claim'; First = 'package'; Second = 'account'; ToStatus = 'draft' },
  @{ Name = 'retry-package'; Fixture = 'probe-retry-package'; Operation = 'retry'; First = 'plan'; Second = 'package'; ToStatus = 'draft' },
  @{ Name = 'retry-account'; Fixture = 'probe-retry-account'; Operation = 'retry'; First = 'package'; Second = 'account'; ToStatus = 'draft' },
  @{ Name = 'draft'; Fixture = 'probe-draft'; Operation = 'transition'; First = 'build'; Second = 'plan'; ToStatus = 'draft' },
  @{ Name = 'cancelled'; Fixture = 'probe-cancelled'; Operation = 'transition'; First = 'build'; Second = 'plan'; ToStatus = 'cancelled' },
  @{ Name = 'renewal'; Fixture = 'probe-renewal'; Operation = 'renewal'; First = 'build'; Second = 'plan'; ToStatus = 'draft' },
  @{ Name = 'handoff'; Fixture = 'probe-handoff'; Operation = 'handoff'; First = 'build'; Second = 'plan'; ToStatus = 'draft' },
  @{ Name = 'initial'; Fixture = 'probe-initial'; Operation = 'initial'; First = 'plan'; Second = 'package'; ToStatus = 'draft' },
  @{ Name = 'qa'; Fixture = 'probe-qa'; Operation = 'qa'; First = 'build'; Second = 'attempt'; ToStatus = 'draft' }
)

$approvalCases = @(
  @{ Name = 'same-key'; Fixture = 'approval-same-key'; RequestKey = 'parallel-same-key'; SecondActor = '00000000-0000-0000-0000-000000000461' },
  @{ Name = 'conflict'; Fixture = 'approval-conflict'; RequestKey = 'parallel-conflict-key'; SecondActor = '00000000-0000-0000-0000-000000000463' }
)

$expiryBoundaryCases = @(
  @{ Name = 'expiry-boundary-gate'; Operation = 'gate' },
  @{ Name = 'expiry-boundary-retry'; Operation = 'retry' }
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
          Complete-ChildOutput -Child $race
        }
      }
      finally { Stop-RaceProcesses }

      Save-RaceResult -Race $winner
      Save-RaceResult -Race $loser
    }

    Invoke-Psql -Arguments @($dbUrl, '-X', '-f', $assertScript)
    Write-Output "Coherent state serialization $iteration/$Iterations PASS"
  }

  Invoke-Psql -Arguments @($dbUrl, '-X', '-f', $enhancedSetupScript)

  Invoke-TransitionSnapshotCase
  foreach ($case in $expiryBoundaryCases) {
    Invoke-ExpiryBoundaryCase -Case $case
  }
  foreach ($case in $lockProbeCases) {
    Invoke-LockProbe -Case $case
  }
  foreach ($case in $approvalCases) {
    Invoke-ApprovalParallelCase -Case $case
  }
  foreach ($variant in @('draft', 'cancelled')) {
    for ($stressIteration = 1; $stressIteration -le 20; $stressIteration++) {
      $caseName = "stress-$variant-$($stressIteration.ToString('00'))"
      Invoke-StressCase -CaseName $caseName -ToStatus $variant
    }
  }

  $enhancedAssert = Start-PsqlChild -Name 'm04-state-enhanced-assert' -Arguments @(
    $dbUrl, '-X', '-v', 'ON_ERROR_STOP=1', '-f', $enhancedAssertScript
  )
  Wait-ChildExit -Child $enhancedAssert
  $null = Test-ExactChildResult -Child $enhancedAssert `
    -MarkerPattern '^M04_STATE_ENHANCED_ASSERT_PASS\r?$' `
    -Label 'Enhanced database assertions'
  if ($enhancedFailures.Count -gt 0) {
    throw ("Enhanced state concurrency failures:`n`n" + ($enhancedFailures -join "`n`n"))
  }
  Write-Output 'Enhanced state concurrency PASS'
}
finally {
  $cleanupFailures = [System.Collections.Generic.List[string]]::new()
  try { Stop-RaceProcesses }
  catch { $cleanupFailures.Add("Child-process cleanup failed: $($_.Exception.Message)") }

  if (Test-Path -LiteralPath $tempRoot) {
    $stopSucceeded = $false
    Push-Location $tempRoot
    try {
      Invoke-SupabaseCli stop --no-backup
      $stopSucceeded = $true
    }
    catch { $cleanupFailures.Add("Supabase stop failed: $($_.Exception.Message)") }
    finally { Pop-Location }

    $resolvedTempRoot = [System.IO.Path]::GetFullPath($tempRoot)
    $expectedPrefix = $tempBase + [System.IO.Path]::DirectorySeparatorChar
    $isExpectedTempRoot =
      $resolvedTempRoot.StartsWith($expectedPrefix, [System.StringComparison]::OrdinalIgnoreCase) -and
      ([System.IO.Path]::GetFileName($resolvedTempRoot)).StartsWith('m04-state-concurrency-')
    if (-not $isExpectedTempRoot) {
      $cleanupFailures.Add("Refusing unexpected temporary path: $resolvedTempRoot")
    }

    $containerNames = & docker ps -a --format '{{.Names}}'
    if ($LASTEXITCODE -ne 0) {
      $cleanupFailures.Add('Could not verify exact state-runner container cleanup.')
      $matchingContainers = @('container-verification-failed')
    }
    else {
      $projectPattern = '^supabase_.+_' + [regex]::Escape($projectId) + '$'
      $matchingContainers = @($containerNames | Where-Object { $_ -match $projectPattern })
      if ($matchingContainers.Count -gt 0) {
        $cleanupFailures.Add("Matching project containers remain: $($matchingContainers -join ', ')")
      }
    }

    if ($stopSucceeded -and $isExpectedTempRoot -and $matchingContainers.Count -eq 0) {
      Remove-Item -LiteralPath $resolvedTempRoot -Recurse -Force
      if (Test-Path -LiteralPath $resolvedTempRoot) {
        $cleanupFailures.Add("Validated temporary root remains after deletion: $resolvedTempRoot")
      }
    }
  }

  if ($cleanupFailures.Count -gt 0) {
    throw ("State-runner cleanup failed; diagnostics were preserved:`n" + ($cleanupFailures -join "`n"))
  }
}
