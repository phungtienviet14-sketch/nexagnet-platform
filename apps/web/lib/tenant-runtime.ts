import type { CapabilityId, ExperienceId, TenantConfig } from '@netviet/tenant';
import type { Branding } from './branding';

/**
 * Mot nang luc nghiep vu khach DA KHAI la chua san sang — nguyen van tu goi khach.
 *
 * Ba truong nay la du lieu NGHIEP VU do khach viet ra, khong phai trang thai ky thuat: `label` la
 * ten khach goi nang luc do, `reason` la ly do khach noi vi sao no chua mo. Khong truong nao la bi
 * mat, nen chung duoc phep qua ranh gioi server -> trinh duyet.
 */
export interface BlockedCapabilityDescriptor {
  readonly key: string;
  readonly label: string;
  readonly reason: string;
}

export interface PublicTenantDescriptor {
  readonly branding: Branding;
  readonly experience: ExperienceId;
  readonly capabilities: readonly CapabilityId[];
  /** Adapter identifiers are safe for UI composition. Credentials are deliberately omitted. */
  readonly integrationAdapters: {
    readonly channel: readonly string[];
    readonly parser: readonly string[];
    readonly erp?: string;
    readonly contentSource?: string;
  };
  /**
   * NANG LUC KHACH DA KHAI LA CHUA SAN SANG — de be mat huong khach noi that duoc.
   *
   * Doc tu GOI KHACH chu khong doi mot lan goi API: cau "COD chua san sang" phai hien ra ngay o
   * lan render dau, ke ca khi API dang do hay dang loi. Mot man hinh im lang ve nang luc bi chan
   * la mot man hinh khien nguoi dung tuong no chay duoc — dung thu Issue #107 §7 cam.
   *
   * Danh sach RONG nghia la khach khong khai nang luc nao bi chan. No KHONG co nghia la "moi thu
   * da san sang": do la cau hoi cua cong go-live (`/settings/readiness`), mot nguon khac.
   */
  readonly readiness: {
    readonly blockedCapabilities: readonly BlockedCapabilityDescriptor[];
  };
}

/**
 * Build the only tenant shape that may cross the Server Component -> browser boundary.
 * Select fields explicitly so a future credential reference cannot leak through object spreading.
 */
export function toPublicTenantDescriptor(config: TenantConfig): PublicTenantDescriptor {
  return {
    branding: { ...config.branding, shortName: config.identity.shortName },
    experience: config.experience,
    capabilities: [...config.capabilities],
    integrationAdapters: {
      channel: [...(config.integrations.channel?.allowedAdapters ?? [])],
      parser: [...(config.integrations.parser?.allowedAdapters ?? [])],
      ...(config.integrations.erp ? { erp: config.integrations.erp.adapter } : {}),
      ...(config.integrations.contentSource
        ? { contentSource: config.integrations.contentSource.adapter }
        : {}),
    },
    readiness: {
      blockedCapabilities: config.policies.readiness.blockedCapabilities.map(
        ({ key, label, reason }) => ({ key, label, reason }),
      ),
    },
  };
}

export function hasCapability(
  tenant: PublicTenantDescriptor,
  capability: CapabilityId,
): boolean {
  return tenant.capabilities.includes(capability);
}

export function hasZaloIntegration(tenant: PublicTenantDescriptor): boolean {
  if (!hasCapability(tenant, 'messaging')) return false;
  return tenant.integrationAdapters.channel.some((adapter) =>
    ['bot', 'zca', 'hybrid'].includes(adapter),
  );
}
