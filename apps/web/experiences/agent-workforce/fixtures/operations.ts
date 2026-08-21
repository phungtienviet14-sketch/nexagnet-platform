import type {
  DataConnector,
  McpToolInfo,
  ModelProviderInfo,
  PlatformTelemetry,
  RbacRole,
} from '../services/types';

export const DATA_CONNECTORS: readonly DataConnector[] = [
  {
    id: 'conn-knowledge',
    name: 'Cơ sở Tri thức Doanh nghiệp (Postgres Knowledge Engine)',
    type: 'Database / RAG Store',
    status: 'connected',
    latency: '8 ms',
    recordsCount: '1.240 mục tri thức',
    lastSync: '10 phút trước',
    note: 'Nguồn sự thật sản phẩm, bảng giá, quy chế nội bộ và từ điển viết tắt.',
  },
  {
    id: 'conn-docstore',
    name: 'Kho Lưu trữ Tài liệu & Hợp đồng (Document Store)',
    type: 'Object Storage / Manifest',
    status: 'connected',
    latency: '14 ms',
    recordsCount: '86 tài liệu số hóa',
    lastSync: '5 phút trước',
    note: 'Lưu trữ các mẫu hợp đồng pháp chế, quy trình SOP và file XML hóa đơn.',
  },
  {
    id: 'conn-erp',
    name: 'Hệ thống Quản trị ERP (ErpPort / Cổng mở)',
    type: 'ERP Adapter',
    status: 'planned',
    note: 'Kiến trúc ErpPort chuẩn hóa sẵn sàng kết nối KiotViet, SAP, MISA hoặc FAST.',
  },
  {
    id: 'conn-crm',
    name: 'Hệ thống Quản lý Khách hàng (CRM)',
    type: 'CRM Connector',
    status: 'planned',
    note: 'Lộ trình đồng bộ hồ sơ đại lý, lịch sử tương tác và chấm điểm lead tiềm năng.',
  },
  {
    id: 'conn-mes',
    name: 'Hệ thống Điều hành Sản xuất (MES / SCADA)',
    type: 'Manufacturing Gateway',
    status: 'planned',
    note: 'Cổng giao tiếp nhận dữ liệu tiến độ gia công và trạng thái máy móc xưởng.',
  },
  {
    id: 'conn-iot',
    name: 'Mạng Cảm biến IoT & Rung động Nhà máy',
    type: 'IoT Telemetry Stream',
    status: 'planned',
    note: 'Cổng tiếp nhận dữ liệu cảm biến rung, nhiệt độ để phục vụ mô hình bảo trì dự đoán (PdM).',
  },
];

export const MODEL_PROVIDERS: readonly ModelProviderInfo[] = [
  {
    id: 'mod-codex',
    name: 'Codex / Claude 3.5 Sonnet Engine',
    role: 'Lập luận cao cấp, trích xuất cấu trúc và phân tích hợp đồng',
    provider: 'Anthropic / Codex Cloud (Bảo mật Enterprise)',
    status: 'active',
    contextWindow: '200k tokens',
  },
  {
    id: 'mod-deepseek',
    name: 'DeepSeek V4 Flash Parser',
    role: 'Phân loại ý định, trích xuất nhanh và tiền xử lý câu hỏi',
    provider: 'DeepSeek API Dedicated Instance',
    status: 'configured',
    contextWindow: '128k tokens',
  },
  {
    id: 'mod-embed',
    name: 'Multilingual Semantic Embedding',
    role: 'Vector hóa và tìm kiếm ngữ nghĩa trong kho tri thức nội bộ',
    provider: 'Local Embedding Server (On-Premises / Silo)',
    status: 'active',
    contextWindow: '8k tokens',
  },
  {
    id: 'mod-vision',
    name: 'Edge Vision QC Model',
    role: 'Thị giác máy tính kiểm tra ngoại quan và phát hiện khuyết tật phôi',
    provider: 'Edge AI Inference Node (Định hướng)',
    status: 'planned',
    contextWindow: 'Image Tensor Input',
  },
];

export const MCP_TOOLS: readonly McpToolInfo[] = [
  {
    id: 'tool-search',
    name: 'enterprise_search',
    group: 'Tri thức & Dữ liệu',
    status: 'active',
    permissions: 'Read-only (Nguồn tri thức)',
    description: 'Tìm kiếm chính xác quy định, quy chế và chính sách đại lý theo ngữ cảnh.',
  },
  {
    id: 'tool-doc-analyze',
    name: 'document_analyzer',
    group: 'Pháp chế & Kế toán',
    status: 'active',
    permissions: 'Read-only (Tài liệu upload)',
    description: 'Bóc tách điều khoản hợp đồng và kiểm tra tính hợp lệ của hóa đơn điện tử.',
  },
  {
    id: 'tool-alert-dispatch',
    name: 'smart_alert_dispatcher',
    group: 'Vận hành & Cảnh báo',
    status: 'active',
    permissions: 'Write (Hàng đợi công việc)',
    description: 'Phát hiện sự cố và gửi thông báo cảnh báo đến đúng vai trò phụ trách.',
  },
  {
    id: 'tool-solver-bridge',
    name: 'scheduling_solver_bridge',
    group: 'Sản xuất & Điều độ',
    status: 'demo',
    permissions: 'Execute (Mô phỏng lập lịch)',
    description: 'Kết nối mô hình tối ưu hóa cân bằng chuyền và tính toán ETA đơn hàng.',
  },
];

export const RBAC_ROLES: readonly RbacRole[] = [
  {
    role: 'Ban Lãnh đạo (Executive)',
    description: 'Toàn quyền giám sát Control Plane, phê duyệt các điều khoản vượt trần và ký số quyết định.',
    userCount: 3,
    permissions: ['view:all', 'approve:executive', 'sign:digital', 'export:reports'],
  },
  {
    role: 'Quản trị viên Nền tảng (Platform Admin)',
    description: 'Cấu hình kết nối dữ liệu, quản lý mô hình LLM, giám sát bảo mật và phân quyền tài khoản.',
    userCount: 2,
    permissions: ['manage:agents', 'manage:connectors', 'manage:rbac', 'view:audit_logs'],
  },
  {
    role: 'Chuyên viên Vận hành (Operator)',
    description: 'Xử lý các cảnh báo nghiệp vụ, tiếp nhận công việc, rà soát văn bản và điều phối sản xuất.',
    userCount: 8,
    permissions: ['view:alerts', 'action:acknowledge', 'action:resolve', 'upload:documents'],
  },
  {
    role: 'Kiểm toán viên (Auditor)',
    description: 'Chỉ đọc toàn bộ nhật ký kiểm toán (Audit Trail), đối chiếu tuân thủ và xuất báo cáo an toàn.',
    userCount: 2,
    permissions: ['view:audit_logs', 'view:compliance_reports'],
  },
];

export const PLATFORM_TELEMETRY: PlatformTelemetry = {
  p95Latency: '420 ms',
  errorRate: '0.00%',
  bufferHealth: '100% (Tối ưu)',
  activeRuns: 6,
  uptime: '99.98%',
  totalTasksToday: 142,
};
