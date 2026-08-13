export type ReadinessStatus = 'ready' | 'missing' | 'warning' | 'blocked';

export interface ReadinessCheck {
  key: string;
  label: string;
  status: ReadinessStatus;
  blocking: boolean;
  detail: string;
}

export interface OperationalReadinessInput {
  tenantLoaded: boolean;
  currentPricePeriod: boolean;
  dealerCount: number;
  enabledGroupMappingCount: number;
  parser: { provider: string; productionAllowed: boolean; credentialsPresent: boolean };
  media: { enabled: boolean; healthy: boolean };
  channel: { mode: string; connected: boolean; productionTransport: boolean; detail: string };
  auth: { enabled: boolean; persistentSessions: boolean };
  goldenEval: { evaluated: boolean; passed: boolean; reason?: string };
  campaignDataCount: number;
  blockedCapabilities: ReadonlyArray<{ key: string; label: string; reason: string }>;
}

export interface OperationalReadinessResult {
  codeComplete: boolean;
  goLiveReady: boolean;
  checkedAt: string;
  reasons: string[];
  checks: ReadinessCheck[];
}

/**
 * Pure readiness policy. Customer-specific labels/reasons arrive through tenant data;
 * the platform owns only the generic mandatory runtime gates.
 */
export function evaluateOperationalReadiness(
  input: OperationalReadinessInput,
  now = new Date(),
): OperationalReadinessResult {
  const mandatory: ReadinessCheck[] = [
    check('tenant.loaded', 'Tenant package', input.tenantLoaded, 'missing_tenant'),
    check(
      'price.current_period',
      'Bảng giá tháng hiện hành',
      input.currentPricePeriod,
      'missing_current_price_period',
    ),
    check('dealers.configured', 'Đại lý đã cấu hình', input.dealerCount > 0, 'missing_dealers'),
    check(
      'groups.mapped',
      'Nhóm đã map đại lý',
      input.enabledGroupMappingCount > 0,
      'missing_group_mappings',
    ),
    check(
      'parser.production',
      'Parser production',
      input.parser.productionAllowed && input.parser.credentialsPresent,
      'parser_not_production_ready',
      input.parser.provider,
    ),
    check(
      'media.production',
      'Kho media production',
      input.media.enabled && input.media.healthy,
      'media_not_production_ready',
    ),
    check(
      'channel.production',
      'Kênh nhận/gửi production',
      input.channel.connected && input.channel.productionTransport,
      'channel_not_production_ready',
      input.channel.detail,
      `channel_not_production_ready:${input.channel.detail}`,
    ),
    check(
      'auth.production',
      'Xác thực và session bền vững',
      input.auth.enabled && input.auth.persistentSessions,
      'auth_not_production_ready',
    ),
    check(
      'golden.evaluated',
      'Golden dataset đã đạt',
      input.goldenEval.evaluated && input.goldenEval.passed,
      input.goldenEval.reason ?? 'golden_eval_not_passed',
    ),
  ];
  const optional: ReadinessCheck[] = [
    {
      key: 'campaign.data',
      label: 'Dữ liệu campaign',
      status: input.campaignDataCount > 0 ? 'ready' : 'warning',
      blocking: false,
      detail:
        input.campaignDataCount > 0
          ? `${input.campaignDataCount} campaign đã được tạo`
          : 'Chưa có campaign; Sale có thể nhập sau trên giao diện.',
    },
    ...input.blockedCapabilities.map(
      (capability): ReadinessCheck => ({
        key: `business.${capability.key}`,
        label: capability.label,
        status: 'blocked',
        blocking: false,
        detail: capability.reason,
      }),
    ),
  ];
  const checks = [...mandatory, ...optional];
  const reasons = mandatory
    .filter((item) => item.status !== 'ready')
    .map((item) => item.detail);

  return {
    codeComplete: true,
    goLiveReady: reasons.length === 0,
    checkedAt: now.toISOString(),
    reasons,
    checks,
  };
}

function check(
  key: string,
  label: string,
  ready: boolean,
  missingReason: string,
  readyDetail = 'ready',
  missingDetail = missingReason,
): ReadinessCheck {
  return {
    key,
    label,
    status: ready ? 'ready' : 'missing',
    blocking: true,
    detail: ready ? readyDetail : missingDetail,
  };
}
