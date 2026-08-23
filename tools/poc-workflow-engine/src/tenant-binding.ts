/**
 * KHAI NIEM RANG BUOC THEO KHACH — chung minh cho §34: mot khuon workflow, nhieu khach,
 * KHONG fork code.
 *
 * Diem mau chot: khuon workflow chi biet "co mot dich den va mot phep anh xa".
 * Con "dich den nao / anh xa ra sao" la DU LIEU cua khach, khong phai nhanh `if`.
 *
 * Trong ban that, bang nay se doc tu `tenants/<slug>/tenant.json` (giong `createErpAdapter`
 * hien nay). O POC dung fixture TRUNG TINH — khong hard-code ten khach that.
 */
export type TenantBinding = {
  /** Dich den ma buoc `dispatch` se goi. */
  endpointPath: string;
  /** Truong nao cua don duoc coi la nhay cam va phai che truoc khi roi khoi Nexagnet. */
  redactFields: readonly string[];
  /** Tran retry rieng cua khach. */
  maxAttempts: number;
};

const BINDINGS: Record<string, TenantBinding> = {
  // Khach A — he ngoai kieu "ERP co idempotency key"
  'tenant-alpha': { endpointPath: '/erp/orders', redactFields: ['phone', 'address'], maxAttempts: 3 },
  // Khach B — he ngoai kieu "webhook tho"
  'tenant-beta': { endpointPath: '/webhook/order', redactFields: ['phone'], maxAttempts: 5 },
};

export function bindingFor(tenant: string): TenantBinding {
  const found = BINDINGS[tenant];
  if (!found) {
    // Fail-fast giong hop dong tenant hien nay: thieu cau hinh thi dung, khong doan.
    throw new Error(`TENANT_BINDING_MISSING: ${tenant}`);
  }
  return found;
}
