[CmdletBinding()]
param(
  [switch]$NoBrowser,
  [switch]$CopyFlowisePassword
)

$ErrorActionPreference = 'Stop'

$projectId = 'netviet-host-968934832433'
$gcloud = Get-Command gcloud.cmd -ErrorAction SilentlyContinue
if (-not $gcloud) {
  $gcloud = Get-Command gcloud -ErrorAction SilentlyContinue
}

$urls = [ordered]@{
  'Demo console'  = 'https://demo.35-187-235-82.sslip.io'
  'Zalo operator' = 'https://operator.35-187-235-82.sslip.io/zalo'
  'Flowise Admin' = 'https://flowise.35-187-235-82.sslip.io'
}

Write-Host 'NetViet demo dang chay tren GCP; PC khong can chay source hoac Docker.'
Write-Host ''
Write-Host 'MOI TRUONG DEV/DEMO — Demo console va Zalo operator KHONG con hoi mat khau.'
Write-Host 'Chi Flowise Admin van doi dang nhap (Flowise 3.x bat buoc co tai khoan).'
Write-Host '  Flowise email: phungtienviet14@gmail.com'
Write-Host ''
Write-Host 'Lay mat khau Flowise (khong chia se man hinh khi chay lenh nay):'
Write-Host "  gcloud secrets versions access latest --project $projectId --secret zalo-ultty-flowise-admin-password"

if ($CopyFlowisePassword) {
  if (-not $gcloud) {
    throw 'Khong tim thay gcloud trong PATH.'
  }
  $flowisePassword = (& $gcloud.Source secrets versions access latest --project $projectId --secret zalo-ultty-flowise-admin-password)
  if ($LASTEXITCODE -ne 0) {
    throw 'Khong lay duoc mat khau Flowise tu Secret Manager.'
  }
  $flowisePassword = (($flowisePassword -join '').Trim())
  Set-Clipboard -Value $flowisePassword
  $flowisePassword = $null
  Write-Host ''
  Write-Host 'Da copy mat khau Flowise vao clipboard. Khong paste len man hinh dang chia se neu co khach xem.'
  Write-Host "Sau khi dang nhap xong, chay: Set-Clipboard -Value ''"
}

if (-not $NoBrowser) {
  foreach ($url in $urls.Values) {
    Start-Process $url
  }
  Write-Host ''
  Write-Host 'Da mo ba tab demo trong trinh duyet mac dinh.'
}

Write-Host ''
Write-Host 'URL:'
foreach ($entry in $urls.GetEnumerator()) {
  Write-Host "  $($entry.Key): $($entry.Value)"
}
