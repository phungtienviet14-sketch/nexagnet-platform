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
  # KHACH duoc deploy. Mac dinh 'ultty' giu nguyen hanh vi cua moi lan chay truoc tham so nay.
  # Bien moi truong TENANT van duoc chap nhan de khong pha script/thoi quen cu.
  [string]$Tenant = $(if ($env:TENANT) { $env:TENANT } else { 'ultty' }),
  # STACK duoc bootstrap. Tenant tra loi "phuc vu khach nao"; stack tra loi "chay o dau" — thu muc,
  # compose project (=> volume) va TIEN TO SECRET. Mac dinh bang tenant nen moi lan chay cu khong
  # doi hanh vi; `-Stack ultty-gd1-test` bootstrap bo secret cho moi truong ky thuat GD1-test ma
  # KHONG dung toi bo secret cua stack dang chay.
  [string]$Stack = '',
  # Chi tao secret + cap quyen doc roi dung. ci-cd.md §4.2 cam dung script nay de rollout mot khach
  # dang van hanh; nhung buoc bootstrap secret thi van phai di qua day, vi day la noi DUY NHAT ma
  # danh sach secret va danh sach cap quyen di ra tu cung mot mang (su co 6.5: hai danh sach roi
  # lech nhau, secret co ma service account khong doc duoc).
  [switch]$SecretsOnly,
  [switch]$MonitoringOnly
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ($Tenant -notmatch '^[a-z0-9-]+$') {
  throw "Tenant khong hop le: '$Tenant'. Chi cho phep chu thuong, so va dau gach ngang."
}

$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
# MOI KHACH MOT THU MUC va MOT BO SECRET. Truoc 17/08/2026 hai gia tri nay cam cung 'zalo-ultty'
# trong khi phan upload goi khach lai doc $env:TENANT — chay `TENANT=amico` se ghi goi cua Amico
# DE LEN goi cua Ultty trong cung mot thu muc stack. Buoc tu mot nguon duy nhat de khong lech nua.
$TenantSlug = $Tenant
$StackSlug = if ($Stack) { $Stack } else { $TenantSlug }
if ($StackSlug -notmatch '^[a-z0-9-]+$') {
  throw "Stack khong hop le: '$StackSlug'. Chi cho phep chu thuong, so va dau gach ngang."
}
$AppDirectory = "/srv/netviet/apps/zalo-$StackSlug"
$SecretPrefix = "zalo-$StackSlug"
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
  $temporaryPath = Join-Path ([IO.Path]::GetTempPath()) "netviet-secret-$([Guid]::NewGuid().ToString('N')).txt"
  try {
    $ErrorActionPreference = 'Continue'
    # Windows PowerShell them CRLF khi pipe string vao native stdin. Secret Manager
    # se luu ca CR do, lam password nguoi dung khong the nhap dung trong browser.
    [IO.File]::WriteAllText($temporaryPath, $InputValue, [Text.UTF8Encoding]::new($false))
    $resolvedArguments = @($Arguments | ForEach-Object {
      if ($_ -eq '--data-file=-') { "--data-file=$temporaryPath" } else { $_ }
    })
    if ('--data-file=-' -notin $Arguments) {
      throw 'Invoke-GcloudWithInput requires --data-file=-.'
    }
    & $script:GcloudExecutable @resolvedArguments *> $null
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
      throw "gcloud failed while reading stdin: gcloud $($Arguments -join ' ')"
    }
  }
  finally {
    if (Test-Path -LiteralPath $temporaryPath) {
      Remove-Item -LiteralPath $temporaryPath -Force
    }
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

function Get-LocalEnvValue {
  param([Parameter(Mandatory)][string]$Name)

  # Doc gia tri tu .env cuc bo de bootstrap Secret Manager lan dau. Gia tri KHONG bao gio duoc
  # in ra stdout/log — no di thang vao Invoke-GcloudWithInput (file tam, xoa ngay sau khi ghi).
  $envPath = Join-Path $RepositoryRoot '.env'
  if (-not (Test-Path -LiteralPath $envPath)) {
    throw "Secret for $Name has no version and local .env is missing."
  }
  $line = Get-Content -LiteralPath $envPath |
    Where-Object { $_ -match "^\s*$([regex]::Escape($Name))\s*=" } |
    Select-Object -First 1
  if (-not $line) {
    throw "Secret for $Name has no version and $Name is missing in local .env."
  }
  $value = ($line -replace "^\s*$([regex]::Escape($Name))\s*=\s*", '').Trim()
  if (($value.StartsWith('"') -and $value.EndsWith('"')) -or
      ($value.StartsWith("'") -and $value.EndsWith("'"))) {
    $value = $value.Substring(1, $value.Length - 2)
  }
  if (-not $value) {
    throw "$Name in local .env is empty."
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

# VO SECRET — tao secret nhung CO Y khong gieo version nao.
#
# Dung cho secret ma GIA TRI phai den tu noi khac, va mot gia tri ngau nhien sinh o day se la
# gia tri SAI ma khong ai phat hien duoc cho toi luc chay:
#   - bam bcrypt cua dashboard: phai do `caddy hash-password` sinh (PowerShell khong co bcrypt);
#   - token cua workflow engine: JWT do CHINH engine duc sau migrate + quickstart.
#
# Tao vo o day de VM co the `versions add` ma KHONG can `secrets.create` cap project: mot service
# account phuc vu bon stack tren cung mot VM khong duoc phep de ra secret moi o bat ky dau.
# Ben doc deu fail-closed khi vo con rong (render-secrets.sh:161/163, deploy-stack.sh:105).
function Ensure-SecretShell {
  param(
    [Parameter(Mandatory)][string]$Name
  )
  if (-not (Test-GcloudResource @('secrets', 'describe', $Name, '--project', $ProjectId))) {
    Invoke-Gcloud @('secrets', 'create', $Name, '--replication-policy=automatic', '--project', $ProjectId, '--quiet')
  }
}

function Ensure-FlowiseAdminPasswordSecret {
  $name = "$SecretPrefix-flowise-admin-password"
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
  Ensure-Secret "$SecretPrefix-postgres-admin-password" { New-RandomSecret }
  Ensure-Secret "$SecretPrefix-zalo-db-password" { New-RandomSecret }
  Ensure-Secret "$SecretPrefix-flowise-db-password" { New-RandomSecret }
  Ensure-Secret "$SecretPrefix-deepseek-api-key" { Get-LocalEnvValue 'DEEPSEEK_API_KEY' }
  # Khoa Claude cho AGENT TU VAN (`ADVICE_COMPOSER=claude`). Tach khoi parser co chu y: parser va
  # nguoi soan cau tra loi la HAI quyet dinh xu ly du lieu khac nhau. Claude nam trong danh sach
  # ben thu ba DA DUOC DUYET (CLAUDE.md), DeepSeek thi chua — nen day cung la duong de dua cau chu
  # gui cho khach sang mot nha cung cap hop le ma khong phai doi parser.
  Ensure-Secret "$SecretPrefix-anthropic-api-key" { Get-LocalEnvValue 'ANTHROPIC_API_KEY' }
  # Token chi duoc render san. Kenh van mock neu operator chua tao override co y bang
  # set-channel-mode.sh; co token KHONG tu bat bot/hybrid.
  Ensure-Secret "$SecretPrefix-zalo-bot-token" { Get-LocalEnvValue 'ZALO_BOT_TOKEN' }
  Ensure-Secret "$SecretPrefix-api-key" { New-RandomSecret }
  Ensure-Secret "$SecretPrefix-flowise-secretkey" { New-RandomSecret }
  Ensure-Secret "$SecretPrefix-flowise-admin-email" { $OperatorEmail }
  Ensure-FlowiseAdminPasswordSecret
  Ensure-Secret "$SecretPrefix-flowise-jwt-secret" { New-RandomSecret 48 }
  Ensure-Secret "$SecretPrefix-flowise-refresh-secret" { New-RandomSecret 48 }
  Ensure-Secret "$SecretPrefix-flowise-session-secret" { New-RandomSecret 48 }
  Ensure-Secret "$SecretPrefix-flowise-token-hash-secret" { New-RandomSecret 48 }
  Ensure-Secret "$SecretPrefix-demo-password" { New-FlowiseAdminPassword }
  Ensure-Secret "$SecretPrefix-operator-password" { New-FlowiseAdminPassword }
  # WORKFLOW ENGINE (Hatchet) — ba secret ma `render-secrets.sh` doc that su (dong 133/137/141).
  #
  # SU CO 23/08/2026: ba cai nay truoc day duoc tao TAY o phien 7/8, tuc chi chay NUA DAU cua thu
  # tuc hai-nua. Deploy gd1-test chet voi "thieu secret zalo-ultty-gd1-test-hatchet-db-password"
  # trong khi secret CO THAT — VM chi khong co binding de doc. `optional_secret` nuot
  # PERMISSION_DENIED thanh chuoi rong nen loi IAM hien ra thanh "thieu secret", va mat tron mot
  # vong deploy de tim. Dua chung vao day de "hai viec di tu MOT danh sach" thanh dung nhu
  # ci-cd.md §4.2 da hua.
  #
  # `workflow-dashboard-password` CO Y khong nam trong danh sach: khong ai doc no bang may — no la
  # ban ro cho NGUOI. Them vao day la cap cho VM quyen doc mot thu VM khong dung.
  Ensure-Secret "$SecretPrefix-hatchet-db-password" { New-RandomSecret }
  Ensure-SecretShell "$SecretPrefix-workflow-dashboard-htpasswd"
  Ensure-SecretShell "$SecretPrefix-workflow-engine-token"

  # MOT NGUON DUY NHAT cho ca hai viec: tao secret o tren va cap quyen doc o duoi. Truoc day day la
  # hai danh sach roi phai tu tay giu khop nhau — dung dip len khach Amico (17/08/2026) thi lech:
  # secret co that nhung service account cua VM khong co binding, stack chet voi PERMISSION_DENIED
  # giua chung. `render-secrets.sh` doc 14 ten dau tien; demo/operator-password danh cho nguoi.
  $secretSuffixes = @(
    'postgres-admin-password',
    'zalo-db-password',
    'flowise-db-password',
    'deepseek-api-key',
    'anthropic-api-key',
    'zalo-bot-token',
    'api-key',
    'flowise-secretkey',
    'flowise-admin-email',
    'flowise-admin-password',
    'flowise-jwt-secret',
    'flowise-refresh-secret',
    'flowise-session-secret',
    'flowise-token-hash-secret',
    'demo-password',
    'operator-password',
    'hatchet-db-password',
    'workflow-dashboard-htpasswd',
    'workflow-engine-token'
  )
  $secretNames = $secretSuffixes | ForEach-Object { "$SecretPrefix-$_" }
  foreach ($name in $secretNames) {
    Invoke-Gcloud @(
      'secrets', 'add-iam-policy-binding', $name,
      "--member=serviceAccount:$ServiceAccount",
      '--role=roles/secretmanager.secretAccessor',
      '--project', $ProjectId,
      '--quiet'
    )
  }

  # NGOAI LE DUY NHAT trong ca ham: token cua workflow engine la secret duy nhat VM phai GHI, chu
  # khong chi doc. `bootstrap-workflow-engine.sh` duc token TREN VM (engine moi biet gia tri) roi
  # `versions add` vao day.
  #
  # `secretVersionAdder` = `versions.add`, KHONG kem `secrets.create` — do la diem mau chot: VM ghi
  # duoc version vao DUNG mot vo da co san, va van khong the de ra secret moi o bat ky dau. Phuong
  # an "cap roles/secretmanager.admin cap project" bi loai vi no cho VM doc/ghi MOI secret cua MOI
  # khach tren cung may (zalo-ultty prod, amico, wata) — ban tron cach ly bi mat lay mot lan tien.
  Invoke-Gcloud @(
    'secrets', 'add-iam-policy-binding', "$SecretPrefix-workflow-engine-token",
    "--member=serviceAccount:$ServiceAccount",
    '--role=roles/secretmanager.secretVersionAdder',
    '--project', $ProjectId,
    '--quiet'
  )
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
    # Windows gcloud uses pscp, which refuses an absent final destination for a recursive upload.
    # Create tenant-pack up front; deploy-remote.sh deliberately flattens the resulting
    # tenant-pack/<slug>/tenant.json layout before installing it.
    '--command', "install -d -m 0700 '$remoteParent' '$remoteParent/tenant-pack' '$remoteParent/catalog-assets'"
  )
  Invoke-GcloudRetry -Arguments @(
    'compute', 'scp', '--recurse', $PSScriptRoot,
    "${VmName}:$remoteParent/",
    "--zone=$Zone",
    '--tunnel-through-iap',
    '--project', $ProjectId,
    '--quiet'
  )

  # GOI KHACH di RIENG, khong nam trong image. Image la ban chung cho moi khach (.dockerignore loai
  # `tenants/`), nen gia si + dieu khoan cong no + chat ID nhom Zalo cua mot khach chi duoc len dung
  # VM cua khach do. Compose mount thu muc nay vao api/web o che do chi-doc.
  $repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
  $tenantPack = Join-Path $repoRoot "tenants/$TenantSlug"
  if (-not (Test-Path $tenantPack)) {
    throw "Khong tim thay goi khach '$tenantPack'. Dung -Tenant <slug> khop mot thu muc trong tenants/."
  }
  Invoke-GcloudRetry -Arguments @(
    'compute', 'scp', '--recurse', $tenantPack,
    "${VmName}:$remoteParent/tenant-pack",
    "--zone=$Zone",
    '--tunnel-through-iap',
    '--project', $ProjectId,
    '--quiet'
  )

  # ANH CATALOG SAN PHAM — cung ly do di ngoai image nhu goi khach. Khac goi khach o cho THIEU
  # DUOC: khong co anh thi tu van van gui, chi la khong kem anh. Nen o day chi canh bao.
  $catalogAssets = Join-Path $repoRoot 'catalog-assets'
  if (Test-Path $catalogAssets) {
    Invoke-GcloudRetry -Arguments @(
      'compute', 'scp', '--recurse', $catalogAssets,
      "${VmName}:$remoteParent/catalog-assets",
      "--zone=$Zone",
      '--tunnel-through-iap',
      '--project', $ProjectId,
      '--quiet'
    )
  } else {
    Write-Warning "Khong co '$catalogAssets' — tu van se gui khong kem anh. Chay: node apps/api/scripts/build-catalog-assets.mjs"
  }

  Invoke-Gcloud @(
    'compute', 'ssh', $VmName,
    "--zone=$Zone",
    '--tunnel-through-iap',
    '--project', $ProjectId,
    '--quiet',
    # Tham so thu 6 la SLUG KHACH. Thieu no thi deploy-remote.sh roi ve mac dinh 'ultty' va goi
    # khach vua upload o tren se duoc cai vao thu muc stack cua Ultty — dung nghia la thay bang gia
    # cua khach nay bang bang gia cua khach kia.
    '--command', "sudo bash '$remoteBundle/deploy-remote.sh' '$ProjectId' '$AppImage' '$FlowiseImage' '$BackupBucket' '$PublicIp' '$TenantSlug'"
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

if ($SecretsOnly) {
  # CO Y khong goi Ensure-ServiceAccount: no sua IAM o muc PROJECT, viec khong lien quan toi
  # bootstrap secret, va no da lam het quota doc cloudresourcemanager mot lan (20/08/2026).
  # Quyen doc tung secret duoc cap ngay trong Ensure-Secrets, tu chinh danh sach tao secret.
  Ensure-Secrets
  Write-Host "Secret bootstrap healthy for stack $StackSlug (prefix $SecretPrefix-)."
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
