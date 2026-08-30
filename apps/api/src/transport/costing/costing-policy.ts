import { loadTenantConfig } from '@netviet/tenant';

/**
 * Chinh sach cua `transport-costing` — phan CAU HINH THEO KHACH, khong phai bat bien cua mien.
 *
 * T1 §10.1 khai capability nay can `transportCosting` (danh muc chi phi, ky quy, CO DUYET TAM UNG
 * HAY KHONG). Ca ba deu la lua chon cua khach, khong phai luat ke toan — nen chung o goi khach.
 *
 * Khoi cau hinh nay HOAN TOAN TUY CHON, cung ly do voi `transportCore`: bat mot khach van tai phai
 * go mot khoi rong chi de he thong khoi chet la mot yeu cau khong phuc vu ai.
 */
export interface TransportCostingPolicy {
  /**
   * Danh muc ma nhom chi phi duoc phep. RONG = khong gioi han (demo nhap tu do).
   *
   * Mac dinh rong chu khong phai mot danh sach bia san: mot danh muc do CHUNG TA nghi ra se bi doc
   * nhu la danh muc cua khach ngay lan dau ai do mo giao dien ra xem.
   */
  readonly expenseCategories: readonly string[];
  /**
   * `INV-10` / VT-085 — duyet tam ung hai buoc. MAC DINH TAT.
   *
   * Giu lai trong hop dong cau hinh de mot khach sau bat duoc, nhung demo nay CHUA hien thuc trang
   * thai cho duyet. Neu mot goi khach bat len, `tenantTransportCostingPolicy()` NEM ngay luc boot
   * — xem chu thich cua no. Im lang bo qua mot co duyet tien la kieu hong te nhat co the co o day.
   */
  readonly advanceApprovalRequired: boolean;
}

export const TRANSPORT_COSTING_POLICY = Symbol('TRANSPORT_COSTING_POLICY');

export class TransportCostingPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransportCostingPolicyError';
  }
}

export function tenantTransportCostingPolicy(): TransportCostingPolicy {
  const configured = loadTenantConfig().policies.transportCosting;

  /*
   * FAIL-FAST LUC BOOT, khong phai mot canh bao luc chay.
   *
   * Mot goi khach bat `advanceApprovalRequired` la dang noi "tien khong duoc ra khoi quy neu chua
   * co nguoi thu hai duyet". Demo nay khong co buoc do. Chay tiep va lang le bo qua co se cho ra
   * dung dieu khach so nhat, o dung cho ho da yeu cau mot cai khoa. Chet luc boot thi khong ai
   * mat tien, va thong diep noi ro phai lam gi.
   */
  if (configured?.advanceApprovalRequired === true) {
    throw new TransportCostingPolicyError(
      'policies.transportCosting.advanceApprovalRequired = true nhung ban demo T3 chua hien thuc ' +
        'buoc cho duyet tam ung (INV-10/VT-085). Tat co, hoac hien thuc trang thai duyet truoc.',
    );
  }

  return {
    expenseCategories: configured?.expenseCategories ?? [],
    advanceApprovalRequired: false,
  };
}
