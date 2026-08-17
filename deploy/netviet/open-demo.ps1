[CmdletBinding()]
param(
  [switch]$NoBrowser,
  [switch]$CopyFlowisePassword,
  # KHACH muon mo. Mac dinh 'ultty' — khach chinh, la khach duy nhat giu ten mien TRAN.
  [string]$Tenant = 'ultty'
)

$ErrorActionPreference = 'Stop'

if ($Tenant -notmatch '^[a-z0-9-]+$') {
  throw "Tenant khong hop le: '$Tenant'."
}

$projectId = 'netviet-host-968934832433'
$gcloud = Get-Command gcloud.cmd -ErrorAction SilentlyContinue
if (-not $gcloud) {
  $gcloud = Get-Command gcloud -ErrorAction SilentlyContinue
}

# Quy tac ten mien PHAI khop `deploy/netviet/render-secrets.sh`: khach chinh giu ten tran, khach
# khac mang slug trong ten. Doan nay khong tu doi duoc ten mien cua ai — chi tro dung cho.
$hostSuffix = '35-187-235-82.sslip.io'
$prefix = if ($Tenant -eq 'ultty') { '' } else { "-$Tenant" }
$urls = [ordered]@{
  'Demo console'  = "https://demo$prefix.$hostSuffix"
  'Zalo operator' = "https://operator$prefix.$hostSuffix/zalo"
  'Flowise Admin' = "https://flowise$prefix.$hostSuffix"
}
$flowisePasswordSecret = "zalo-$Tenant-flowise-admin-password"

Write-Host 'NetViet demo dang chay tren GCP; PC khong can chay source hoac Docker.'
Write-Host ''
Write-Host 'MOI TRUONG DEV/DEMO — Demo console va Zalo operator KHONG con hoi mat khau.'
Write-Host 'Chi Flowise Admin van doi dang nhap (Flowise 3.x bat buoc co tai khoan).'
Write-Host '  Flowise email: phungtienviet14@gmail.com'
Write-Host ''
Write-Host 'Lay mat khau Flowise (khong chia se man hinh khi chay lenh nay):'
Write-Host "  gcloud secrets versions access latest --project $projectId --secret $flowisePasswordSecret"

if ($CopyFlowisePassword) {
  if (-not $gcloud) {
    throw 'Khong tim thay gcloud trong PATH.'
  }
  $flowisePassword = (& $gcloud.Source secrets versions access latest --project $projectId --secret $flowisePasswordSecret)
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
