[CmdletBinding()]
param(
  [string]$ProjectId = 'netviet-host-968934832433',
  [string]$Zone = 'asia-southeast1-b',
  [string]$VmName = 'netviet',
  [Parameter(Mandatory)][string]$OldFlowisePasswordVersion
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function New-CleanPassword {
  $buffer = [byte[]]::new(32)
  $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $generator.GetBytes($buffer)
  }
  finally {
    $generator.Dispose()
  }
  return "Nv1!$([BitConverter]::ToString($buffer).Replace('-', '').ToLowerInvariant())"
}

function Add-CleanSecretVersion {
  param([Parameter(Mandatory)][string]$Name)

  $temporaryPath = Join-Path ([IO.Path]::GetTempPath()) "netviet-rotate-$([Guid]::NewGuid().ToString('N')).txt"
  try {
    $value = New-CleanPassword
    [IO.File]::WriteAllText($temporaryPath, $value, [Text.UTF8Encoding]::new($false))
    & gcloud.cmd secrets versions add $Name --project $ProjectId "--data-file=$temporaryPath" --quiet |
      Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw "Khong rotate duoc secret $Name."
    }
    if ((Get-Item -LiteralPath $temporaryPath).Length -ne 68) {
      throw "Secret $Name co do dai byte khong hop le."
    }
  }
  finally {
    $value = $null
    if (Test-Path -LiteralPath $temporaryPath) {
      Remove-Item -LiteralPath $temporaryPath -Force
    }
  }
}

foreach ($secretName in @(
    'zalo-ultty-demo-password',
    'zalo-ultty-operator-password',
    'zalo-ultty-flowise-admin-password'
  )) {
  Add-CleanSecretVersion -Name $secretName
}

$remotePath = "/tmp/netviet-rotate-flowise-$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds()).sh"
& gcloud.cmd compute scp (Join-Path $PSScriptRoot 'rotate-flowise-admin-password.sh') "${VmName}:$remotePath" "--zone=$Zone" --tunnel-through-iap --project $ProjectId --quiet
if ($LASTEXITCODE -ne 0) { throw 'Khong copy duoc script rotate Flowise.' }

& gcloud.cmd compute ssh $VmName "--zone=$Zone" --tunnel-through-iap --project $ProjectId --quiet --command "sudo bash '$remotePath' '$ProjectId' '$OldFlowisePasswordVersion'; sudo rm -f -- '$remotePath'"
if ($LASTEXITCODE -ne 0) { throw 'Khong rotate duoc tai khoan Flowise.' }

Write-Host 'Human-facing secrets da rotate khong kem CRLF; can render lai stack.'
