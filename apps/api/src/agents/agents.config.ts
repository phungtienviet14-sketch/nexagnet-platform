/**
 * Hang so cho tang agent (Supervisor + Hau mai). Tach rieng nhu DEFAULT_RULES_CONFIG
 * de khach hieu chinh nguong va de test. Regex chay tren text DA CHUAN HOA (khong dau).
 */
export interface AgentsConfig {
  /** grandTotal >= nguong nay -> Giam sat leo thang (đơn lớn bất thường). */
  largeOrderTotal: number;
  /** Tong so luong >= nguong nay -> theo doi. */
  largeOrderQuantity: number;
  /** Do tin cay intent < nguong nay -> theo doi. */
  lowConfidence: number;
  /** Dau hieu khieu nai gat -> leo thang. */
  harshComplaint: RegExp;
  /** Bao hanh: giao sai/thieu. */
  warrantyWrongMissing: RegExp;
  /** Bao hanh: con trong 7 ngay. */
  warrantyIn7: RegExp;
}

export const DEFAULT_AGENTS_CONFIG: AgentsConfig = {
  largeOrderTotal: 20_000_000,
  largeOrderQuantity: 30,
  lowConfidence: 0.5,
  harshComplaint:
    /(qua te|te qua|khong the chap nhan|khong chap nhan|doi tra ngay|kien|to cao|lua dao|buc minh|tra het|huy don|bao xau|1 sao)/,
  warrantyWrongMissing: /(giao sai|giao thieu|thieu hang|sai mau|sai loai|nham hang|giao nham|thieu 1|thieu mot)/,
  warrantyIn7: /(moi mua|moi nhan|vua nhan|hom qua|hom nay|trong tuan|chua qua 7|7 ngay|moi giao|vua giao)/,
};
