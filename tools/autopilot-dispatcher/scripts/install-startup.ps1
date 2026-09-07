<#
.SYNOPSIS
  In ra KE HOACH dang ky dispatcher chay luc dang nhap (Windows Task Scheduler, pham vi NGUOI DUNG).

.DESCRIPTION
  MAC DINH LA DRY-RUN. Khong co `-Execute`, script nay KHONG ghi mot thu gi: khong tao scheduled
  task, khong dung toi registry, khong tao dich vu. No chi in ra chinh xac nhung gi SE duoc dang
  ky, de mot task sau — da qua review — bat len duoc.

  Task #256 CO Y khong bat cai nay. Kich hoat mot tien trinh tu dong chay Claude Code voi quyen
  ghi tren may ca nhan la mot quyet dinh cua NGUOI, khong phai mot buoc phu cua mot lan cai dat.

  Khong mo cong mang nao. Dispatcher chi goi RA (`gh`, `git`), khong nghe VAO.

.PARAMETER Execute
  Thuc su dang ky. Trong pham vi task #256 KHONG duoc dung. De o day de mot task sau khong phai
  viet lai script, va de duong kich hoat la mot dong duy nhat, doc duoc trong review.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ConfigPath,
  [string]$TaskName = 'NexagentAutopilotDispatcher',
  [string]$NodePath = 'node',
  [switch]$Execute
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
$cliPath = Join-Path $PSScriptRoot '..' | Join-Path -ChildPath 'src/cli.mjs'
$logDir = Join-Path $env:LOCALAPPDATA 'nexagent-autopilot-dispatcher\logs'

$plan = [ordered]@{
  mode             = if ($Execute) { 'EXECUTE' } else { 'DRY-RUN (no changes made)' }
  taskName         = $TaskName
  runAs            = "$env:USERDOMAIN\$env:USERNAME (per-user, interactive logon)"
  trigger          = 'AtLogOn'
  executable       = $NodePath
  arguments        = "`"$cliPath`" once --config `"$ConfigPath`" --execute"
  workingDirectory = $repoRoot
  logDirectory     = $logDir
  inboundPorts     = 'none — dispatcher is outbound-only'
  rollback         = "schtasks /delete /tn `"$TaskName`" /f"
}

Write-Output '--- Nexagent Autopilot dispatcher: startup registration plan ---'
$plan.GetEnumerator() | ForEach-Object { Write-Output ('{0,-17}: {1}' -f $_.Key, $_.Value) }

if (-not $Execute) {
  Write-Output ''
  Write-Output 'DRY-RUN: nothing was registered. Re-run with -Execute only after a reviewed task'
  Write-Output 'explicitly authorises enabling unattended local execution.'
  exit 0
}

Register-ScheduledTask -TaskName $TaskName -Force -Action (
  New-ScheduledTaskAction -Execute $NodePath -Argument $plan.arguments -WorkingDirectory $repoRoot
) -Trigger (New-ScheduledTaskTrigger -AtLogOn) -Settings (
  New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopOnIdleEnd
)
Write-Output "Registered scheduled task '$TaskName'."
