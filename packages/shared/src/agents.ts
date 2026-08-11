import type { Intent } from './order.js';

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
}
