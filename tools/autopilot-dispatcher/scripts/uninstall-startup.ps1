<#
.SYNOPSIS
  In ra KE HOACH go dang ky dispatcher khoi Task Scheduler. MAC DINH LA DRY-RUN.

.DESCRIPTION
  Doi xung voi install-startup.ps1: khong co `-Execute` thi khong xoa gi, chi in ra lenh se chay.
  Duong go phai luon ton tai va luon doc duoc — mot co che tu dong khong go duoc la mot co che
  khong nen bat.
#>
[CmdletBinding()]
param(
  [string]$TaskName = 'NexagentAutopilotDispatcher',
  [switch]$Execute
)

$ErrorActionPreference = 'Stop'

Write-Output '--- Nexagent Autopilot dispatcher: startup removal plan ---'
Write-Output ('mode      : {0}' -f $(if ($Execute) { 'EXECUTE' } else { 'DRY-RUN (no changes made)' }))
Write-Output ('taskName  : {0}' -f $TaskName)
Write-Output ('command   : schtasks /delete /tn "{0}" /f' -f $TaskName)

if (-not $Execute) {
  Write-Output ''
  Write-Output 'DRY-RUN: nothing was removed.'
  exit 0
}

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
Write-Output "Removed scheduled task '$TaskName'."
