[CmdletBinding()]
param(
  [string]$ProjectId = 'netviet-host-968934832433',
  [string]$ProjectName = 'NetViet Host',
  [string]$OrganizationId = '387995607554',
  [string]$BillingAccount = '0157A9-389619-7EE46C',
  [string]$Region = 'asia-southeast1',
  [string]$Zone = 'asia-southeast1-b',
  [string]$VmName = 'netviet',
  [string]$OperatorEmail = 'phungtienviet14@gmail.com',
  [switch]$MonitoringOnly
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$AppDirectory = '/srv/netviet/apps/zalo-ultty'
$Network = 'netviet'
$Subnet = 'netviet-sea1'
$Repository = 'netviet'
$ServiceAccountName = 'netviet-vm'
$PublicAddressName = 'netviet-public-ip'
$ServiceAccount = "$ServiceAccountName@$ProjectId.iam.gserviceaccount.com"
$BackupBucket = "gs://$ProjectId-backups"
$RegistryHost = "$Region-docker.pkg.dev"
$GcloudCommand = Get-Command gcloud.cmd -ErrorAction SilentlyContinue
if (-not $GcloudCommand) {
  throw 'gcloud CLI is not installed or not in PATH.'
}
$GcloudExecutable = $GcloudCommand.Source

function Invoke-Gcloud {
  param(
    [Parameter(Mandatory)]
    [string[]]$Arguments,
    [switch]$Capture
  )

  $previousErrorAction = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    if ($Capture) {
      $output = & $script:GcloudExecutable @Arguments 2>$null
      $exitCode = $LASTEXITCODE
      if ($exitCode -ne 0) {
        throw "gcloud failed: gcloud $($Arguments -join ' ')"
      }
      return ($output -join "`n").Trim()
    }

    & $script:GcloudExecutable @Arguments | Out-Host
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
      throw "gcloud failed: gcloud $($Arguments -join ' ')"
    }
  }
  finally {
    $ErrorActionPreference = $previousErrorAction
  }
}

function Invoke-GcloudRetry {
  param(
    [Parameter(Mandatory)]
    [string[]]$Arguments,
    [int]$Attempts = 6,
    [int]$DelaySeconds = 10
  )

  for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
    try {
      Invoke-Gcloud -Arguments $Arguments
      return
    }
    catch {
      if ($attempt -eq $Attempts) {
        throw
      }
      Write-Warning "gcloud attempt $attempt/$Attempts failed; retrying in $DelaySeconds seconds."
      Start-Sleep -Seconds $DelaySeconds
    }
  }
}

function Test-GcloudResource {
  param([Parameter(Mandatory)][string[]]$Arguments)
  $previousErrorAction = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    & $script:GcloudExecutable @Arguments --quiet *> $null
    $exitCode = $LASTEXITCODE
    return $exitCode -eq 0
  }
  finally {
    $ErrorActionPreference = $previousErrorAction
  }
}

function Invoke-GcloudWithInput {
  param(
    [Parameter(Mandatory)][string[]]$Arguments,
    [Parameter(Mandatory)][string]$InputValue
  )
  $previousErrorAction = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    $InputValue | & $script:GcloudExecutable @Arguments *> $null
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
      throw "gcloud failed while reading stdin: gcloud $($Arguments -join ' ')"
    }
  }
  finally {
    $ErrorActionPreference = $previousErrorAction
  }
}

function Invoke-Native {
  param(
    [Parameter(Mandatory)][string]$Command,
    [Parameter(Mandatory)][string[]]$Arguments
  )
  & $Command @Arguments | Out-Host
  if ($LASTEXITCODE -ne 0) {
    throw "$Command failed."
  }
}

function New-RandomSecret {
  param([int]$Bytes = 32)
  $buffer = [byte[]]::new($Bytes)
  $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $generator.GetBytes($buffer)
  }
  finally {
    $generator.Dispose()
  }
  return [BitConverter]::ToString($buffer).Replace('-', '').ToLowerInvariant()
}

function New-FlowiseAdminPassword {
  return "Nv1!$(New-RandomSecret)"
}

function Get-LocalDeepSeekKey {
  $envPath = Join-Path $RepositoryRoot '.env'
  if (-not (Test-Path -LiteralPath $envPath)) {
    throw 'Secret zalo-ultty-deepseek-api-key has no version and local .env is missing.'
  }
  $line = Get-Content -LiteralPath $envPath |
    Where-Object { $_ -match '^\s*DEEPSEEK_API_KEY\s*=' } |
    Select-Object -First 1
  if (-not $line) {
    throw 'Secret zalo-ultty-deepseek-api-key has no version and DEEPSEEK_API_KEY is missing in local .env.'
  }
  $value = ($line -replace '^\s*DEEPSEEK_API_KEY\s*=\s*', '').Trim()
  if (($value.StartsWith('"') -and $value.EndsWith('"')) -or
      ($value.StartsWith("'") -and $value.EndsWith("'"))) {
    $value = $value.Substring(1, $value.Length - 2)
  }
  if (-not $value) {
    throw 'DEEPSEEK_API_KEY in local .env is empty.'
  }
  return $value
}

function Ensure-Secret {
  param(
    [Parameter(Mandatory)][string]$Name,
    [Parameter(Mandatory)][scriptblock]$ValueFactory
  )
  if (-not (Test-GcloudResource @('secrets', 'describe', $Name, '--project', $ProjectId))) {
    Invoke-Gcloud @('secrets', 'create', $Name, '--replication-policy=automatic', '--project', $ProjectId, '--quiet')
  }
  $versions = Invoke-Gcloud -Arguments @(
    'secrets', 'versions', 'list', $Name,
    '--project', $ProjectId,
    '--filter=state=ENABLED',
    '--format=value(name)'
  ) -Capture
  if (-not ($versions | Select-Object -First 1)) {
    $value = & $ValueFactory
    try {
      Invoke-GcloudWithInput -Arguments @(
        'secrets', 'versions', 'add', $Name,
        '--data-file=-',
        '--project', $ProjectId,
        '--quiet'
      ) -InputValue $value
    }
    finally {
      $value = $null
    }
  }
}

function Ensure-FlowiseAdminPasswordSecret {
  $name = 'zalo-ultty-flowise-admin-password'
  Ensure-Secret $name { New-FlowiseAdminPassword }

  $current = Invoke-Gcloud -Arguments @(
    'secrets', 'versions', 'access', 'latest',
    "--secret=$name",
    '--project', $ProjectId
  ) -Capture
  try {
    if ($current -notmatch '^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{8,128}$') {
      $replacement = New-FlowiseAdminPassword
      try {
        Invoke-GcloudWithInput -Arguments @(
          'secrets', 'versions', 'add', $name,
          '--data-file=-',
          '--project', $ProjectId,
          '--quiet'
        ) -InputValue $replacement
      }
      finally {
        $replacement = $null
      }
    }
  }
  finally {
    $current = $null
  }
}

function Ensure-Project {
  if (-not (Test-GcloudResource @('projects', 'describe', $ProjectId))) {
    Invoke-Gcloud @(
      'projects', 'create', $ProjectId,
      "--name=$ProjectName",
      "--organization=$OrganizationId",
      '--quiet'
    )
  }
  Invoke-Gcloud @('billing', 'projects', 'link', $ProjectId, "--billing-account=$BillingAccount", '--quiet')
  Invoke-Gcloud @(
    'services', 'enable',
    'artifactregistry.googleapis.com',
    'compute.googleapis.com',
    'iam.googleapis.com',
    'logging.googleapis.com',
    'monitoring.googleapis.com',
    'secretmanager.googleapis.com',
    'storage.googleapis.com',
    '--project', $ProjectId,
    '--quiet'
  )
}

function Ensure-Network {
  if (-not (Test-GcloudResource @('compute', 'networks', 'describe', $Network, '--project', $ProjectId))) {
    Invoke-Gcloud @('compute', 'networks', 'create', $Network, '--subnet-mode=custom', '--project', $ProjectId, '--quiet')
  }
  if (-not (Test-GcloudResource @('compute', 'networks', 'subnets', 'describe', $Subnet, '--region', $Region, '--project', $ProjectId))) {
    Invoke-Gcloud @(
      'compute', 'networks', 'subnets', 'create', $Subnet,
      "--network=$Network",
      '--range=10.20.0.0/24',
      "--region=$Region",
      '--enable-private-ip-google-access',
      '--project', $ProjectId,
      '--quiet'
    )
  }
  if (-not (Test-GcloudResource @('compute', 'firewall-rules', 'describe', 'netviet-allow-iap-ssh', '--project', $ProjectId))) {
    Invoke-Gcloud @(
      'compute', 'firewall-rules', 'create', 'netviet-allow-iap-ssh',
      "--network=$Network",
      '--direction=INGRESS',
      '--priority=1000',
      '--action=ALLOW',
      '--rules=tcp:22',
      '--source-ranges=35.235.240.0/20',
      '--target-tags=netviet-iap',
      '--project', $ProjectId,
      '--quiet'
    )
  }
  if (-not (Test-GcloudResource @('compute', 'firewall-rules', 'describe', 'netviet-allow-public-web', '--project', $ProjectId))) {
    Invoke-Gcloud @(
      'compute', 'firewall-rules', 'create', 'netviet-allow-public-web',
      "--network=$Network",
      '--direction=INGRESS',
      '--priority=1000',
      '--action=ALLOW',
      '--rules=tcp:80,tcp:443,udp:443',
      '--source-ranges=0.0.0.0/0',
      '--target-tags=netviet-public-web',
      '--project', $ProjectId,
      '--quiet'
    )
  }
}

function Ensure-ServiceAccount {
  if (-not (Test-GcloudResource @('iam', 'service-accounts', 'describe', $ServiceAccount, '--project', $ProjectId))) {
    Invoke-Gcloud @(
      'iam', 'service-accounts', 'create', $ServiceAccountName,
      '--display-name=NetViet pilot VM',
      '--project', $ProjectId,
      '--quiet'
    )
  }
  foreach ($role in @('roles/logging.logWriter', 'roles/monitoring.metricWriter', 'roles/artifactregistry.reader')) {
    Invoke-Gcloud @(
      'projects', 'add-iam-policy-binding', $ProjectId,
      "--member=serviceAccount:$ServiceAccount",
      "--role=$role",
      '--condition=None',
      '--quiet'
    )
  }
  foreach ($role in @('roles/iap.tunnelResourceAccessor', 'roles/compute.osAdminLogin')) {
    Invoke-Gcloud @(
      'projects', 'add-iam-policy-binding', $ProjectId,
      "--member=user:$OperatorEmail",
      "--role=$role",
      '--condition=None',
      '--quiet'
    )
  }
}

function Ensure-RegistryAndBackupBucket {
  if (-not (Test-GcloudResource @('artifacts', 'repositories', 'describe', $Repository, '--location', $Region, '--project', $ProjectId))) {
    Invoke-Gcloud @(
      'artifacts', 'repositories', 'create', $Repository,
      '--repository-format=docker',
      "--location=$Region",
      '--description=NetViet application images',
      '--project', $ProjectId,
      '--quiet'
    )
  }
  if (-not (Test-GcloudResource @('storage', 'buckets', 'describe', $BackupBucket, '--project', $ProjectId))) {
    Invoke-Gcloud @(
      'storage', 'buckets', 'create', $BackupBucket,
      "--location=$Region",
      '--uniform-bucket-level-access',
      '--public-access-prevention',
      '--project', $ProjectId,
      '--quiet'
    )
  }
  Invoke-Gcloud @(
    'storage', 'buckets', 'update', $BackupBucket,
    "--lifecycle-file=$(Join-Path $PSScriptRoot 'gcs-lifecycle.json')",
    '--project', $ProjectId,
    '--quiet'
  )
  Invoke-Gcloud @(
    'storage', 'buckets', 'add-iam-policy-binding', $BackupBucket,
    "--member=serviceAccount:$ServiceAccount",
    '--role=roles/storage.objectAdmin',
    '--project', $ProjectId,
    '--quiet'
  )
}

function Ensure-Secrets {
  Ensure-Secret 'zalo-ultty-postgres-admin-password' { New-RandomSecret }
  Ensure-Secret 'zalo-ultty-zalo-db-password' { New-RandomSecret }
  Ensure-Secret 'zalo-ultty-flowise-db-password' { New-RandomSecret }
  Ensure-Secret 'zalo-ultty-deepseek-api-key' { Get-LocalDeepSeekKey }
  Ensure-Secret 'zalo-ultty-api-key' { New-RandomSecret }
  Ensure-Secret 'zalo-ultty-flowise-secretkey' { New-RandomSecret }
  Ensure-Secret 'zalo-ultty-flowise-admin-email' { $OperatorEmail }
  Ensure-FlowiseAdminPasswordSecret
  Ensure-Secret 'zalo-ultty-flowise-jwt-secret' { New-RandomSecret 48 }
  Ensure-Secret 'zalo-ultty-flowise-refresh-secret' { New-RandomSecret 48 }
  Ensure-Secret 'zalo-ultty-flowise-session-secret' { New-RandomSecret 48 }
  Ensure-Secret 'zalo-ultty-flowise-token-hash-secret' { New-RandomSecret 48 }
  Ensure-Secret 'zalo-ultty-demo-password' { New-FlowiseAdminPassword }
  Ensure-Secret 'zalo-ultty-operator-password' { New-FlowiseAdminPassword }

  $secretNames = @(
    'zalo-ultty-postgres-admin-password',
    'zalo-ultty-zalo-db-password',
    'zalo-ultty-flowise-db-password',
    'zalo-ultty-deepseek-api-key',
    'zalo-ultty-api-key',
    'zalo-ultty-flowise-secretkey',
    'zalo-ultty-flowise-admin-email',
    'zalo-ultty-flowise-admin-password',
    'zalo-ultty-flowise-jwt-secret',
    'zalo-ultty-flowise-refresh-secret',
    'zalo-ultty-flowise-session-secret',
    'zalo-ultty-flowise-token-hash-secret',
    'zalo-ultty-demo-password',
    'zalo-ultty-operator-password'
  )
  foreach ($name in $secretNames) {
    Invoke-Gcloud @(
      'secrets', 'add-iam-policy-binding', $name,
      "--member=serviceAccount:$ServiceAccount",
      '--role=roles/secretmanager.secretAccessor',
      '--project', $ProjectId,
      '--quiet'
    )
  }
}

function Ensure-Vm {
  if (-not (Test-GcloudResource @('compute', 'instances', 'describe', $VmName, '--zone', $Zone, '--project', $ProjectId))) {
    Invoke-Gcloud @(
      'compute', 'instances', 'create', $VmName,
      "--zone=$Zone",
      '--machine-type=e2-standard-2',
      '--image-family=ubuntu-2404-lts-amd64',
      '--image-project=ubuntu-os-cloud',
      '--boot-disk-size=80GB',
      '--boot-disk-type=pd-balanced',
      "--network=$Network",
      "--subnet=$Subnet",
      '--tags=netviet-iap,netviet-public-web',
      "--service-account=$ServiceAccount",
      '--scopes=https://www.googleapis.com/auth/cloud-platform',
      '--shielded-secure-boot',
      '--shielded-vtpm',
      '--shielded-integrity-monitoring',
      '--metadata=enable-oslogin=TRUE,block-project-ssh-keys=TRUE',
      '--project', $ProjectId,
      '--quiet'
    )
  }

  Invoke-Gcloud @(
    'compute', 'instances', 'add-tags', $VmName,
    "--zone=$Zone",
    '--tags=netviet-iap,netviet-public-web',
    '--project', $ProjectId,
    '--quiet'
  )

  $remoteInstall = "/tmp/netviet-install-$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds()).sh"
  Invoke-GcloudRetry -Arguments @(
    'compute', 'scp', (Join-Path $PSScriptRoot 'install-vm.sh'),
    "${VmName}:$remoteInstall",
    "--zone=$Zone",
    '--tunnel-through-iap',
    '--project', $ProjectId,
    '--quiet'
  )
  Invoke-GcloudRetry -Arguments @(
    'compute', 'ssh', $VmName,
    "--zone=$Zone",
    '--tunnel-through-iap',
    '--project', $ProjectId,
    '--quiet',
    '--command', "sudo bash '$remoteInstall' && sudo rm -f '$remoteInstall' && sudo gcloud auth configure-docker '$RegistryHost' --quiet"
  )
}

function Ensure-StaticExternalIp {
  if (Test-GcloudResource @('compute', 'addresses', 'describe', $PublicAddressName, '--region', $Region, '--project', $ProjectId)) {
    return Invoke-Gcloud -Arguments @(
      'compute', 'addresses', 'describe', $PublicAddressName,
      "--region=$Region",
      '--project', $ProjectId,
      '--format=value(address)'
    ) -Capture
  }

  $currentIp = Invoke-Gcloud -Arguments @(
    'compute', 'instances', 'describe', $VmName,
    "--zone=$Zone",
    '--project', $ProjectId,
    '--format=value(networkInterfaces[0].accessConfigs[0].natIP)'
  ) -Capture
  if (-not $currentIp) {
    throw 'VM netviet has no external IP to promote.'
  }
  Invoke-Gcloud @(
    'compute', 'addresses', 'create', $PublicAddressName,
    "--addresses=$currentIp",
    "--region=$Region",
    '--network-tier=PREMIUM',
    '--project', $ProjectId,
    '--quiet'
  )
  return $currentIp
}

function Build-And-PushImages {
  Push-Location $RepositoryRoot
  try {
    & git diff --quiet
    if ($LASTEXITCODE -ne 0) {
      throw 'Tracked worktree changes must be committed before building the deploy image.'
    }
    & git diff --cached --quiet
    if ($LASTEXITCODE -ne 0) {
      throw 'Staged changes must be committed before building the deploy image.'
    }
    $gitSha = (& git rev-parse HEAD).Trim()
    if ($LASTEXITCODE -ne 0 -or -not $gitSha) {
      throw 'Cannot determine git SHA.'
    }
    $appImage = "$RegistryHost/$ProjectId/$Repository/zalo-ultty:$gitSha"
    $flowiseImage = "$RegistryHost/$ProjectId/$Repository/flowise-3.1.4-deepseek-fix:$gitSha"
    Invoke-Gcloud @('auth', 'configure-docker', $RegistryHost, '--quiet')
    Invoke-Native 'docker' @(
      'build',
      '--file', 'deploy/netviet/Dockerfile',
      '--label', "org.opencontainers.image.revision=$gitSha",
      '--tag', $appImage,
      '.'
    )
    Invoke-Native 'docker' @(
      'build',
      '--file', 'deploy/flowise/Dockerfile',
      '--label', "org.opencontainers.image.revision=$gitSha",
      '--label', 'org.opencontainers.image.base.digest=sha256:3922767afb52a5777759fd8b28a3c9eee864daea96018a791f2429eae2a76571',
      '--tag', $flowiseImage,
      '.'
    )
    foreach ($image in @($appImage, $flowiseImage)) {
      Invoke-Native 'docker' @('push', $image)
    }
    $appDigest = (& docker inspect --format '{{index .RepoDigests 0}}' $appImage).Trim()
    $flowiseDigest = (& docker inspect --format '{{index .RepoDigests 0}}' $flowiseImage).Trim()
    if ($LASTEXITCODE -ne 0 -or
        $appDigest -notmatch '@sha256:[a-f0-9]{64}$' -or
        $flowiseDigest -notmatch '@sha256:[a-f0-9]{64}$') {
      throw 'Cannot resolve pushed image digests.'
    }
    return [PSCustomObject]@{
      App = $appDigest
      Flowise = $flowiseDigest
    }
  }
  finally {
    Pop-Location
  }
}

function Deploy-Stack {
  param(
    [Parameter(Mandatory)][string]$AppImage,
    [Parameter(Mandatory)][string]$FlowiseImage,
    [Parameter(Mandatory)][string]$PublicIp
  )
  $remoteParent = "/tmp/netviet-deploy-$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"
  $remoteBundle = "$remoteParent/netviet"
  Invoke-GcloudRetry -Arguments @(
    'compute', 'ssh', $VmName,
    "--zone=$Zone",
    '--tunnel-through-iap',
    '--project', $ProjectId,
    '--quiet',
    '--command', "install -d -m 0700 '$remoteParent'"
  )
  Invoke-GcloudRetry -Arguments @(
    'compute', 'scp', '--recurse', $PSScriptRoot,
    "${VmName}:$remoteParent/",
    "--zone=$Zone",
    '--tunnel-through-iap',
    '--project', $ProjectId,
    '--quiet'
  )

  Invoke-Gcloud @(
    'compute', 'ssh', $VmName,
    "--zone=$Zone",
    '--tunnel-through-iap',
    '--project', $ProjectId,
    '--quiet',
    '--command', "sudo bash '$remoteBundle/deploy-remote.sh' '$ProjectId' '$AppImage' '$FlowiseImage' '$BackupBucket' '$PublicIp'"
  )
}

function Ensure-NotificationChannel {
  $token = Invoke-Gcloud -Arguments @('auth', 'print-access-token') -Capture
  $headers = @{ Authorization = "Bearer $token" }
  $uri = "https://monitoring.googleapis.com/v3/projects/$ProjectId/notificationChannels"
  $channels = Invoke-RestMethod -Method Get -Uri $uri -Headers $headers
  $channelList = @()
  $channelProperty = if ($null -ne $channels) {
    $channels.PSObject.Properties['notificationChannels']
  }
  if ($null -ne $channelProperty) {
    $channelList = @($channelProperty.Value)
  }
  $existing = $channelList |
    Where-Object { $_.displayName -eq 'NetViet pilot operator' } |
    Select-Object -First 1
  if ($existing) {
    return $existing.name
  }
  $body = @{
    type = 'email'
    displayName = 'NetViet pilot operator'
    labels = @{ email_address = $OperatorEmail }
  } | ConvertTo-Json -Depth 5
  $created = Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -ContentType 'application/json' -Body $body
  return $created.name
}

function Ensure-AlertPolicy {
  param(
    [Parameter(Mandatory)][string]$DisplayName,
    [Parameter(Mandatory)][string]$Filter,
    [Parameter(Mandatory)][hashtable]$Aggregation,
    [Parameter(Mandatory)][string]$Duration,
    [Parameter(Mandatory)][double]$Threshold,
    [Parameter(Mandatory)][string]$NotificationChannel
  )
  $token = Invoke-Gcloud -Arguments @('auth', 'print-access-token') -Capture
  $headers = @{ Authorization = "Bearer $token" }
  $uri = "https://monitoring.googleapis.com/v3/projects/$ProjectId/alertPolicies"
  $response = Invoke-RestMethod -Method Get -Uri $uri -Headers $headers
  $policyProperty = if ($null -ne $response) {
    $response.PSObject.Properties['alertPolicies']
  }
  $policies = if ($null -ne $policyProperty) {
    @($policyProperty.Value)
  } else {
    @()
  }
  if ($policies | Where-Object { $_.displayName -eq $DisplayName } | Select-Object -First 1) {
    return
  }
  $body = @{
    displayName = $DisplayName
    combiner = 'OR'
    enabled = $true
    notificationChannels = @($NotificationChannel)
    conditions = @(
      @{
        displayName = $DisplayName
        conditionThreshold = @{
          filter = $Filter
          comparison = 'COMPARISON_GT'
          thresholdValue = $Threshold
          duration = $Duration
          trigger = @{ count = 1 }
          aggregations = @($Aggregation)
        }
      }
    )
  } | ConvertTo-Json -Depth 10
  $null = Invoke-RestMethod `
    -Method Post `
    -Uri $uri `
    -Headers $headers `
    -ContentType 'application/json' `
    -Body $body
}

function Ensure-Monitoring {
  $instanceId = Invoke-Gcloud -Arguments @(
    'compute', 'instances', 'describe', $VmName,
    "--zone=$Zone",
    '--project', $ProjectId,
    '--format=value(id)'
  ) -Capture

  if (-not (Test-GcloudResource @('logging', 'metrics', 'describe', 'netviet_health_failures', '--project', $ProjectId))) {
    Invoke-Gcloud @(
      'logging', 'metrics', 'create', 'netviet_health_failures',
      '--description=NetViet health endpoint or container restart failures',
      "--log-filter=resource.type=`"gce_instance`" AND resource.labels.instance_id=`"$instanceId`" AND textPayload:`"NETVIET_HEALTH_FAILURE`"",
      '--project', $ProjectId,
      '--quiet'
    )
  }

  $channel = Ensure-NotificationChannel
  Ensure-AlertPolicy `
    -DisplayName 'NetViet health or container restart failure' `
    -Filter 'resource.type="gce_instance" AND metric.type="logging.googleapis.com/user/netviet_health_failures"' `
    -Aggregation @{ alignmentPeriod = '60s'; perSeriesAligner = 'ALIGN_DELTA' } `
    -Duration '0s' `
    -Threshold '0' `
    -NotificationChannel $channel
  Ensure-AlertPolicy `
    -DisplayName 'NetViet RAM above 85 percent' `
    -Filter "resource.type=`"gce_instance`" AND resource.label.instance_id=`"$instanceId`" AND metric.type=`"agent.googleapis.com/memory/percent_used`" AND metric.label.state=`"used`"" `
    -Aggregation @{ alignmentPeriod = '60s'; perSeriesAligner = 'ALIGN_MEAN' } `
    -Duration '300s' `
    -Threshold '85' `
    -NotificationChannel $channel
  Ensure-AlertPolicy `
    -DisplayName 'NetViet disk above 80 percent' `
    -Filter "resource.type=`"gce_instance`" AND resource.label.instance_id=`"$instanceId`" AND metric.type=`"agent.googleapis.com/disk/percent_used`" AND metric.label.state=`"used`"" `
    -Aggregation @{ alignmentPeriod = '60s'; perSeriesAligner = 'ALIGN_MEAN' } `
    -Duration '300s' `
    -Threshold '80' `
    -NotificationChannel $channel
}

Set-Location $RepositoryRoot
$activeAccount = Invoke-Gcloud -Arguments @('auth', 'list', '--filter=status:ACTIVE', '--format=value(account)') -Capture
if (-not $activeAccount) {
  throw 'No active gcloud account.'
}

if ($MonitoringOnly) {
  Ensure-Monitoring
  Write-Host "Monitoring healthy for VM $VmName."
  exit 0
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw 'Docker is not installed or not in PATH.'
}

Ensure-Project
Ensure-Network
Ensure-ServiceAccount
Ensure-RegistryAndBackupBucket
Ensure-Secrets
Ensure-Vm
$publicIp = Ensure-StaticExternalIp
$images = Build-And-PushImages
Deploy-Stack -AppImage $images.App -FlowiseImage $images.Flowise -PublicIp $publicIp
Ensure-Monitoring

Write-Host "Deployment healthy: app=$($images.App), flowise=$($images.Flowise)"
Write-Host "IAP tunnel: gcloud compute ssh $VmName --project $ProjectId --zone $Zone --tunnel-through-iap -- -L 8080:127.0.0.1:8080 -L 3002:127.0.0.1:3002"
$publicIpLabel = $publicIp.Replace('.', '-')
Write-Host "Demo: https://demo.$publicIpLabel.sslip.io"
Write-Host "Zalo operator: https://operator.$publicIpLabel.sslip.io/zalo"
Write-Host "Flowise: https://flowise.$publicIpLabel.sslip.io"
