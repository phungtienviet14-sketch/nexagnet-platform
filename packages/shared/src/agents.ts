import type { Intent } from './order.js';
import type { OutboundContent } from './content.js';
import type { OutboundAuthorityVerdict } from './outbound-authority.js';
import type { OutboundComposition } from './outbound-composition.js';

/**
 * Multi-agent 6 con theo docs/khach-hang/ultty/nguon-goc/de-xuat-giai-phap-netviet.md §5.1 — pham vi demo.
 * QUAN TRONG: 6 VAI duoi 1 orchestrator, dung CHUNG 1 lan goi LLM (Router parse),
 * KHONG phai 6 agent LLM doc lap. Rules engine van la noi DUY NHAT tinh tien.
 */

/** 6 vai agent (thu tu hien thi tren trace). */
export const AGENT_ROLES = [
  'router',
  'product_advisor',
  'sales',
  'policy_finance',
  'after_sales',
  'supervisor',
] as const;
export type AgentRole = (typeof AGENT_ROLES)[number];

/** Nhan tieng Viet tung vai (§5.1). */
export const ROLE_LABELS: Record<AgentRole, string> = {
  router: 'Điều phối',
  product_advisor: 'Tư vấn sản phẩm',
  sales: 'Bán hàng & chốt đơn',
  policy_finance: 'Chính sách & tài chính',
  after_sales: 'Hậu mãi & bảo hành',
  supervisor: 'Giám sát',
};

/** Nhan intent (dung chung web + trace). */
export const INTENT_LABELS: Record<Intent, string> = {
  hoi_san_pham: 'Hỏi sản phẩm',
  hoi_gia: 'Hỏi giá',
  dat_don: 'Đặt đơn',
  chinh_sach_cong_no: 'Chính sách / công nợ',
  bao_hanh_khieu_nai: 'Bảo hành / khiếu nại',
  van_chuyen: 'Vận chuyển',
  khac: 'Khác',
};

/** Map 7 intent -> vai xu ly chinh. */
export const INTENT_TO_ROLE: Record<Intent, AgentRole> = {
  hoi_san_pham: 'product_advisor',
  hoi_gia: 'policy_finance',
  dat_don: 'sales',
  chinh_sach_cong_no: 'policy_finance',
  bao_hanh_khieu_nai: 'after_sales',
  van_chuyen: 'policy_finance',
  khac: 'router',
};

/** Nguon 1 buoc — badge minh bach: tien do 'rules', prose do 'llm', tra cuu 'knowledge'. */
export type AgentSource = 'router' | 'rules' | 'knowledge' | 'llm' | 'none';

/** Trang thai 1 hang agent (UI luon hien du 6 hang). */
export type AgentStepStatus = 'active' | 'skipped' | 'flagged' | 'handoff';

/** Loai nguoi gui suy ra tu nhom Zalo. */
export type SenderType = 'dai_ly' | 'ctv' | 'khach_le' | 'unknown';

export const SENDER_LABELS: Record<SenderType, string> = {
  dai_ly: 'Đại lý',
  ctv: 'CTV',
  khach_le: 'Khách lẻ',
  unknown: 'Chưa xác định',
};

export type RiskLevel = 'none' | 'watch' | 'escalate';

export interface AgentStep {
  role: AgentRole;
  label: string;
  status: AgentStepStatus;
  /** Cau mo ta agent da lam gi (timeline). */
  action: string;
  /** Ghi chu chi tiet (moi dong 1 note). */
  notes: string[];
  source: AgentSource;
  usedLlm: boolean;
  handoff?: boolean;
}

export interface SupervisorSummary {
  riskLevel: RiskLevel;
  escalate: boolean;
  reasons: string[];
}

export interface AgentTrace {
  /** 6 buoc theo thu tu vai (con khong tham gia = status 'skipped'). */
  steps: AgentStep[];
  primaryRole: AgentRole;
  senderType: SenderType;
  /** So lan goi LLM cho tin nay (0 o che do mock) — minh bach chi phi. */
  llmCalls: number;
  brainMode: string;
  supervisor: SupervisorSummary;
  /** Van ban de xuat tra loi (co-pilot: Sale copy, GD1 khong auto-gui). */
  reply?: string;
  /** Payload du kien de channel gui dung capability; video/catalog luon la link. */
  outbound?: OutboundContent;
  /**
   * QUYET DINH THAM QUYEN cho chinh `outbound` o tren — thu bien mot ban nhap thanh mot tin
   * GUI DUOC CHO KHACH.
   *
   * Vi sao no nam TREN TRACE chu khong chi la mot bien cuc bo luc soan: co hai duong dua `outbound`
   * toi khach — cong tu dong (`PipelineService.evaluateAutoReplyAdvice`) va nut "Duyệt & gửi" cua
   * Sale (`OrdersService.approve`) — va ca hai deu doc BAN GHI DA LUU, khong doc lai ngu canh luc
   * soan. Khong ghim quyet dinh vao day thi duong nguoi-duyet se khong biet gi ve tham quyen, va
   * mot ban nhap thieu tham quyen van ra khoi he thong chi vi co nguoi bam nut.
   *
   * VANG MAT = CHUA QUA CONG. `TurnReplyService` doc do la `AUTHORITY_DECISION_ABSENT` va TU CHOI
   * gui — ban ghi cu (truoc ban nay) va moi duong soan tuong lai quen goi cong deu roi vao day.
   */
  outboundAuthority?: OutboundAuthorityVerdict;
  /**
   * BAN SOAN CO KIEU ma phan quyet o tren duoc cap cho (Issue #189).
   *
   * Doi voi `outboundAuthority` thi day la BANG CHUNG, khong phai mot ban sao: phan quyet noi
   * "duoc gui", con ban ghi nay noi RA KHOI NAO da duoc dung, tu du kien tat dinh nao, khoi nao
   * bi bo va vi sao, va loi nhan co qua duoc hop dong neo nguon khong.
   *
   * VANG MAT = CHUA QUA BO SOAN CO KIEU. `TurnReplyService` doc do la `COMPOSITION_ABSENT` va TU
   * CHOI gui — ban ghi soan truoc #189 roi vao day, dung nhu muc 8 ca 10 hop dong doi.
   */
  outboundComposition?: OutboundComposition;
  /**
   * `reply` do AGENT CO CONG CU soan (khong phai ban mau tat dinh).
   *
   * Ben goi can phan biet hai thu nay: mot cau do LLM viet sau khi tra cuu nguon su that duoc
   * phep di thang toi khach, con chuoi mac dinh ("Da em da ghi nhan a...") thi khong — gui no
   * chi lam khach tuong da duoc tra loi.
   */
  composed?: boolean;
}
