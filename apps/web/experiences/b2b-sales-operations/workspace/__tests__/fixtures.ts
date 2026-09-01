import type { OrderView } from '@netviet/shared';
import type { CapabilityId } from '@netviet/tenant';
import type { AuthRole } from '../../../../lib/auth';
import type { NavigationInput } from '../../navigation';

/**
 * MOT `OrderView` "BAN" — mang DU moi truong chi ky su moi duoc nhin.
 *
 * Fixture nay CO Y ban. Mot fixture sach se lam moi bai kiem tra ranh gioi luon xanh ma khong
 * chung minh gi ca: neu khong co `traceId` trong du lieu vao, thi viec `traceId` khong xuat hien
 * o dau ra la mot su that hien nhien, khong phai mot bang chung.
 *
 * Cac gia tri deu la TONG HOP: khong so dien thoai that, khong chat ID that, khong ten khach
 * that. Xem `tools/customer-source-guardrail/` ve ly do dieu do khong phai mot lua chon tuy y.
 */

export const ENGINEERING_ONLY_VALUES = [
  '0af7651916cd43dd8448eb211c80319c',
  'chat-fixture-0001',
  'uid-fixture-0001',
  'deepseek',
] as const;

export const ENGINEERING_ONLY_KEYS = [
  'traceId',
  'spanId',
  'chatId',
  'senderExternalId',
  'ruleConfigVersion',
  'trace',
  'confidence',
  'parsed',
  'workflowRunId',
  'replyChannel',
  'quoteTarget',
  'brainMode',
  'llmCalls',
] as const;

export function dirtyOrder(overrides: Partial<OrderView> = {}): OrderView {
  return {
    id: 'ord-fixture-1',
    status: 'pending_review',
    createdAt: '2026-09-01T02:10:00.000Z',
    chatId: 'chat-fixture-0001',
    replyChannel: 'zca',
    groupName: 'Nhóm đại lý Thái Nguyên',
    dealerName: 'Đại lý Thái Nguyên',
    rawText: 'gui 2 ghe felix ve TN cho c',
    intent: 'dat_don',
    parsed: null,
    priced: {
      orderType: 'TH1',
      dealerName: 'Đại lý Thái Nguyên',
      branch: 'TN',
      lines: [
        {
          skuRaw: 'ghe felix',
          sku: 'GHE-FELIX',
          productName: 'Ghế Felix',
          quantity: 2,
          unitPrice: 1_150_000,
          lineTotal: 2_300_000,
          matched: true,
        },
      ],
      itemsSubtotal: 2_300_000,
      shippingFee: 0,
      policy: 'cong_no_30',
      codCollect: false,
      codFee: 0,
      vat: false,
      vatAmount: 0,
      grandTotal: 2_300_000,
      warnings: [],
      confirmationText: 'Xác nhận đơn: 2 x Ghế Felix — tổng 2.300.000đ',
    },
    confidence: {},
    senderType: 'dai_ly',
    senderExternalId: 'uid-fixture-0001',
    traceId: '0af7651916cd43dd8448eb211c80319c',
    ruleConfigVersion: 3,
    trace: {
      steps: [],
      primaryRole: 'sales',
      senderType: 'dai_ly',
      llmCalls: 1,
      brainMode: 'deepseek',
      supervisor: { riskLevel: 'none', escalate: false, reasons: [] },
      reply: 'Dạ em ghi nhận đơn ạ.',
    },
    ...overrides,
  } as OrderView;
}

/** Moi chuoi doc duoc trong mot gia tri da chieu — de quet ranh gioi ma khong bo sot nhanh nao. */
export function collectStrings(value: unknown, into: string[] = []): string[] {
  if (typeof value === 'string') into.push(value);
  else if (Array.isArray(value)) for (const item of value) collectStrings(item, into);
  else if (value && typeof value === 'object')
    for (const item of Object.values(value)) collectStrings(item, into);
  return into;
}

/** Moi ten truong xuat hien trong mot gia tri da chieu, o moi do sau. */
export function collectKeys(value: unknown, into: string[] = []): string[] {
  if (Array.isArray(value)) for (const item of value) collectKeys(item, into);
  else if (value && typeof value === 'object')
    for (const [key, item] of Object.entries(value)) {
      into.push(key);
      collectKeys(item, into);
    }
  return into;
}

/**
 * NGUOI DANG XEM — bo nang luc day du cua goi khach, kem mot vai tro.
 *
 * Dung nguyen bo nang luc ma `tenants/ultty/tenant.json` khai, de bai kiem tra hoi dung mot cau:
 * *voi cung mot goi khach, VAI TRO doi thi duong dan doi the nao*. Tron them mot phep loc nang
 * luc vao day se lam mot bai do vi ly do khac han cai no dinh hoi.
 */
export const ALL_CAPABILITIES: readonly CapabilityId[] = [
  'knowledge',
  'messaging',
  'turn-processing',
  'sales-order',
  'campaign',
  'operations',
  'notifications',
];

export function viewer(role: AuthRole | null): NavigationInput {
  return { capabilities: ALL_CAPABILITIES, role };
}

export const SALE = viewer('SALE');
export const ACCOUNTING = viewer('ACCOUNTING');
export const MANAGER = viewer('MANAGER');
export const ADMIN = viewer('ADMIN');
/** Che do khong phien: trinh duyet khong mang danh tinh nao. */
export const ANONYMOUS = viewer(null);
