$ErrorActionPreference = "Stop"

$scheduledAt = [DateTimeOffset]::Parse("2026-05-04T16:25:00+08:00")
$now = [DateTimeOffset]::Now

if ($now -lt $scheduledAt) {
  $delay = [Math]::Ceiling(($scheduledAt - $now).TotalSeconds)
  Start-Sleep -Seconds $delay
}

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$stdoutLog = Join-Path $repoRoot ".codex-scheduled-send.out.log"
$stderrLog = Join-Path $repoRoot ".codex-scheduled-send.err.log"
$serverStdoutLog = Join-Path $repoRoot ".codex-scheduled-next-dev.out.log"
$serverStderrLog = Join-Path $repoRoot ".codex-scheduled-next-dev.err.log"

$env:MONTHLY_REPORT_TEST_MODE = "false"
$env:MONTHLY_REPORT_GOOGLE_ACCOUNT_ID = "725-074-5811"
$env:MONTHLY_REPORT_PRIMARY_RECIPIENT = "amirulshahrul1775@gmail.com"
$env:MONTHLY_REPORT_CLIENT_NAME = "Overall Report 725-074-5811"

$appReady = $false
$startedProcess = $null

try {
  try {
    $probe = Invoke-WebRequest -Uri "http://127.0.0.1:3000/overall" -UseBasicParsing -TimeoutSec 5
    if ($probe.StatusCode -eq 200) {
      $appReady = $true
    }
  } catch {
    $appReady = $false
  }

  if (-not $appReady) {
    $startedProcess = Start-Process -FilePath "doppler" `
      -ArgumentList @("run", "--", "npm", "run", "dev") `
      -WorkingDirectory $repoRoot `
      -WindowStyle Hidden `
      -RedirectStandardOutput $serverStdoutLog `
      -RedirectStandardError $serverStderrLog `
      -PassThru

    $deadline = (Get-Date).AddMinutes(3)
    while ((Get-Date) -lt $deadline) {
      Start-Sleep -Seconds 3
      try {
        $probe = Invoke-WebRequest -Uri "http://127.0.0.1:3000/overall" -UseBasicParsing -TimeoutSec 5
        if ($probe.StatusCode -eq 200) {
          $appReady = $true
          break
        }
      } catch {
      }
    }
  }

  if (-not $appReady) {
    throw "Local app did not become ready on http://127.0.0.1:3000."
  }

  & doppler run -- npx tsx scripts/manual-overall-page-screenshot-email.ts 1>> $stdoutLog 2>> $stderrLog
} finally {
  if ($startedProcess -and -not $startedProcess.HasExited) {
    Stop-Process -Id $startedProcess.Id -Force
  }
}
