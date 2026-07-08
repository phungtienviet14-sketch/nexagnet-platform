import type { Intent } from './order.js';

/**
 * Dinh nghia 7 y dinh + vi du few-shot (KHONG DAU) — dung de dung PROMPT phan loai
 * cho parser LLM (Claude/DeepSeek). Tach rieng de 2 parser dung CHUNG, va de tune.
 */
export interface IntentDef {
  intent: Intent;
  label: string;
  /** Khi nao chon intent nay. */
  description: string;
  /** Vi du tin nhan (khong dau) — few-shot. */
  examples: string[];
}

export const INTENT_DEFINITIONS: IntentDef[] = [
  {
    intent: 'dat_don',
    label: 'Đặt đơn',
    description:
      'Đại lý muốn ĐẶT hàng: có SỐ LƯỢNG cụ thể + tên sản phẩm. TH1 giao cho đại lý; TH2 giao thẳng khách lẻ (kèm tên + SĐT/địa chỉ). CHỈ chọn khi có con số đặt cụ thể.',
    examples: [
      'gui 10 ghe felix ve TN cho c, ko VAT',
      'Meta HN dat 5 noi chien + 3 robot gui ve kho',
      'gui khach c Lan 0912345678 so 25 Tran Duy Hung, 1 ghe felix thu ho',
    ],
  },
  {
    intent: 'hoi_gia',
    label: 'Hỏi giá',
    description:
      'Hỏi GIÁ sản phẩm ("bao nhieu tien", "may tien", "bao gia si"), KHÔNG kèm số lượng đặt cụ thể. Kể cả hỏi giá nhiều SP hoặc giá sỉ vẫn là hoi_gia nếu chưa chốt số lượng.',
    examples: ['ghe felix bao nhieu tien c oi', 'bao gia si robot voi quat dieu hoa nhe', 'loc nuoc RO lay sll thi gia bao nhieu'],
  },
  {
    intent: 'hoi_san_pham',
    label: 'Hỏi sản phẩm',
    description:
      'Hỏi CÔNG NĂNG/tính năng/so sánh/tư vấn sản phẩm — KHÔNG hỏi giá, KHÔNG đặt. Có nhắc tên SP nhưng là để hỏi về nó.',
    examples: ['ghe felix ngoi lau co dau lung ko c', 'robot hut bui co lau duoc san go khong', 'nha co tre nho nen lap loc nuoc hay loc khong khi truoc'],
  },
  {
    intent: 'chinh_sach_cong_no',
    label: 'Chính sách / công nợ',
    description: 'Hỏi công nợ, ký gửi, hạn thanh toán, phí thu hộ/COD, chính sách áp dụng cho đại lý.',
    examples: ['thang nay cho cong no 45 ngay dc ko a', 'ben minh cho ky gui khong', 'phi thu ho COD tinh the nao a'],
  },
  {
    intent: 'bao_hanh_khieu_nai',
    label: 'Bảo hành / khiếu nại',
    description: 'Sản phẩm lỗi/hỏng, đổi trả, khiếu nại, hoặc giao sai/thiếu hàng.',
    examples: ['robot moi nhan 3 hom da ko sac dc pin, doi hang dc ko', 'may loc nuoc dung 2 thang bi chay nuoc', 'dat 10 con giao co 8 thieu 2'],
  },
  {
    intent: 'van_chuyen',
    label: 'Vận chuyển',
    description: 'Hỏi tình trạng giao hàng: khi nào tới, đơn đi đến đâu, xin mã vận đơn/tracking.',
    examples: ['don ghe felix hom qua bao gio ship ve TN', 'don meta hn di den dau roi', 'cho xin ma van don don hom qua'],
  },
  {
    intent: 'khac',
    label: 'Khác',
    description:
      'Chào hỏi, cảm ơn, off-topic, hoặc tin QUÁ MƠ HỒ không rõ thuộc 6 loại trên. Khi không chắc thì chọn khac và để confidence.intent thấp.',
    examples: ['chao shop', 'ok c cam on e nhe', 'a oi'],
  },
];
