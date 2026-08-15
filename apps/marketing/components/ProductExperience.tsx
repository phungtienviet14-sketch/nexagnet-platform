'use client';

import { useState, useEffect, useCallback } from 'react';

type ModuleType = 'orders' | 'knowledge' | 'campaigns';

function ZaloIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2C6.48 2 2 6.03 2 11C2 13.88 3.51 16.43 5.86 18.02L5 22L9.2 20.3C10.1 20.62 11.03 20.8 12 20.8C17.52 20.8 22 16.77 22 11.8C22 6.83 17.52 2 12 2Z"
        fill="#FFFFFF"
      />
      <path
        d="M8.5 9H15.5L9 15.5H15.5"
        stroke="#0068FF"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MessengerIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3C6.48 3 2 7.03 2 12C2 14.88 3.51 17.43 5.86 19.02L5 23L9.2 21.3C10.1 21.62 11.03 21.8 12 21.8C17.52 21.8 22 17.77 22 12.8C22 7.83 17.52 3 12 3Z"
        fill="#FFFFFF"
      />
      <path
        d="M12.8 14.5L10.5 12L6.5 14.5L11.2 9.5L13.5 12L17.5 9.5L12.8 14.5Z"
        fill="#0084FF"
      />
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 11.5L19.5 5.5L16 18.5L11 14L8.5 16V13.5L16.5 8L6.8 12.2L4 11.5Z"
        fill="#FFFFFF"
      />
    </svg>
  );
}

interface WorkflowData {
  name: string;
  badge: string;
  description: string;
  platformName: string;
  platformClass: 'zalo' | 'messenger' | 'telegram';
  sourceTag: string;
  channelBadge: string;
  sourceTime: string;
  inputText: string;
  aiBadge: string;
  aiFields: Array<{ label: string; value: string; badge?: string }>;
  rulesBadge: string;
  rulesItems: Array<{ label: string; status: string; detail: string }>;
  validateText: string;
  autoTitle: string;
  autoDetail: string;
  autoTarget: string;
  humanTitle: string;
  humanTrigger: string;
  humanStatus: string;
}

const WORKFLOW_PRESETS: Record<ModuleType, WorkflowData> = {
  orders: {
    name: 'Đơn hàng',
    badge: 'ĐANG CHẠY',
    description: 'Xử lý đơn hàng Zalo, đối soát SKU, giá & hạn mức công nợ',
    platformName: 'Zalo',
    platformClass: 'zalo',
    sourceTag: 'Nhóm Zalo · NPP Miền Bắc',
    channelBadge: 'Tin nhắn Zalo',
    sourceTime: '10:42',
    inputText: '“Cho anh 20 Felix, giao về Hà Nội.”',
    aiBadge: 'Trích xuất có ràng buộc',
    aiFields: [
      { label: 'Ý định', value: 'Đặt hàng (Tạo đơn mới)', badge: 'Trọng tâm' },
      { label: 'Sản phẩm', value: 'Ghế Felix (Mã: FLX-01)', badge: 'Khớp danh mục' },
      { label: 'Số lượng', value: '20 chiếc', badge: 'Hợp lệ' },
      { label: 'Khách hàng', value: 'Đại lý Meta HN', badge: 'Đã định danh' },
    ],
    rulesBadge: 'Rules Engine tất định',
    rulesItems: [
      { label: 'Dữ liệu sản phẩm', status: 'Đã xác thực', detail: 'Đơn giá & SKU khớp danh mục chuẩn' },
      { label: 'Dữ liệu tồn kho', status: 'Đã xác thực', detail: 'Kho HN khả dụng 140 chiếc' },
      { label: 'Chính sách đại lý', status: 'Đạt yêu cầu', detail: 'Hạn mức công nợ 30 ngày hợp lệ' },
      { label: 'Ngưỡng tự động hóa', status: 'Đạt yêu cầu', detail: 'Tổng SL ≤ 50 (Ngưỡng tự động)' },
    ],
    validateText: 'ĐÃ XÁC THỰC · ĐẠT 4/4 QUY TẮC',
    autoTitle: 'Tự động thực thi',
    autoDetail: 'Tự động soạn đơn & gửi tin xác nhận Zalo',
    autoTarget: 'Sẵn sàng ghi nhận vào hệ thống quản trị',
    humanTitle: 'Cổng kiểm duyệt nhân sự',
    humanTrigger: 'Kích hoạt khi: Vượt ngưỡng (>50) · Lệch giá · Thiếu thông tin',
    humanStatus: 'Trạng thái: Chờ (Không có ngoại lệ)',
  },
  knowledge: {
    name: 'Tri thức & CSKH',
    badge: 'SẴN SÀNG',
    description: 'Tra cứu chính sách bảo hành & giải đáp kỹ thuật chuẩn xác',
    platformName: 'Messenger',
    platformClass: 'messenger',
    sourceTag: 'Messenger · Fanpage CSKH',
    channelBadge: 'Tin nhắn Messenger',
    sourceTime: '14:15',
    inputText: '“Chính sách đổi trả máy hút ẩm bảo hành bao lâu em?”',
    aiBadge: 'Truy xuất văn bản chuẩn',
    aiFields: [
      { label: 'Ý định', value: 'Hỏi đáp kỹ thuật & CSKH', badge: 'Hỏi đáp' },
      { label: 'Mã sản phẩm', value: 'Máy hút ẩm (Mã: LUK-16)', badge: 'Trong danh mục' },
      { label: 'Chủ đề', value: 'Thời hạn bảo hành & Đổi mới', badge: 'Chính sách' },
      { label: 'Khách hàng', value: 'Đại lý Kim Liên', badge: 'Đại lý Cấp 1' },
    ],
    rulesBadge: 'Quy tắc đối chiếu tri thức',
    rulesItems: [
      { label: 'Tài liệu doanh nghiệp', status: 'Đã xác thực', detail: 'Chính sách bảo hành 2026' },
      { label: 'Điều khoản trích xuất', status: 'Đã xác thực', detail: 'Mục 3.2: Đổi mới 30 ngày đầu' },
      { label: 'Thẩm quyền chính sách', status: 'Đạt yêu cầu', detail: 'Bảo hành chính hãng 24 tháng' },
      { label: 'Kiểm soát độ chính xác', status: 'Đạt yêu cầu', detail: 'Trích xuất từ tài liệu duyệt' },
    ],
    validateText: 'ĐÃ XÁC THỰC · ĐỐI CHIẾU CHUẨN XÁC',
    autoTitle: 'Gửi câu trả lời xác thực',
    autoDetail: 'Gửi câu trả lời kèm trích dẫn văn bản chính thức',
    autoTarget: 'Ghi nhật ký CSKH & lưu vết kiểm toán',
    humanTitle: 'Chuyển chuyên viên kỹ thuật',
    humanTrigger: 'Chuyển chuyên viên khi: Khiếu nại đền bù · Lỗi hiếm gặp',
    humanStatus: 'Trạng thái: Chờ (Khớp nội dung tài liệu)',
  },
  campaigns: {
    name: 'Chiến dịch CSKH',
    badge: 'SẴN SÀNG',
    description: 'Phát tin CSKH định kỳ, phân bổ hàng đợi chống khóa kênh',
    platformName: 'Telegram',
    platformClass: 'telegram',
    sourceTag: 'Telegram B2B · Kênh Đại lý',
    channelBadge: 'Tin nhắn Telegram',
    sourceTime: '09:00',
    inputText: '“Thông báo chính sách chiết khấu Tháng 8 tới 240 đại lý cấp 1.”',
    aiBadge: 'Mô hình phân bổ người nhận',
    aiFields: [
      { label: 'Ý định', value: 'Phát tin chiến dịch hàng loạt', badge: 'Gửi tin' },
      { label: 'Đối tượng', value: '240 Đại lý Cấp 1 (Đang hoạt động)', badge: 'Phân khúc' },
      { label: 'Kênh gửi', value: 'Các nhóm Zalo / Telegram', badge: 'Giãn cách' },
      { label: 'Nội dung', value: 'Chương trình chiết khấu Q3', badge: 'Nội bộ' },
    ],
    rulesBadge: 'Quy tắc giới hạn & An toàn',
    rulesItems: [
      { label: 'Phê duyệt nội dung', status: 'Đã xác thực', detail: 'Trưởng phòng Sale đã ký duyệt' },
      { label: 'Kiểm soát tốc độ', status: 'Đã xác thực', detail: 'Giãn cách 8-15s/nhóm chống spam' },
      { label: 'Kiểm tra người nhận', status: 'Đạt yêu cầu', detail: 'Không trùng lặp, lọc tài khoản khoá' },
      { label: 'Chính sách an toàn kênh', status: 'Đạt yêu cầu', detail: 'Khung giờ gửi: 09:00 - 11:30' },
    ],
    validateText: 'ĐÃ XÁC THỰC · HÀNG ĐỢI AN TOÀN',
    autoTitle: 'Phát tin theo hàng đợi',
    autoDetail: 'Phát tin tuần tự theo hàng đợi phân bổ an toàn',
    autoTarget: 'Cập nhật tiến độ theo thời gian thực',
    humanTitle: 'Tạm dừng khẩn cấp (Kill Switch)',
    humanTrigger: 'Tạm dừng khi: Có phản hồi sai sót nội dung hoặc lỗi kênh',
    humanStatus: 'Trạng thái: Hoạt động bình thường',
  },
};

export function ProductExperience() {
  const [activeModule, setActiveModule] = useState<ModuleType>('orders');
  const [currentStep, setCurrentStep] = useState<number>(3);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [showMoreModal, setShowMoreModal] = useState<boolean>(false);

  const workflow = WORKFLOW_PRESETS[activeModule];

  // Auto step cycle
  const nextStep = useCallback(() => {
    setCurrentStep((prev) => (prev < 3 ? prev + 1 : 0));
  }, []);

  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(nextStep, 3200);
    return () => clearInterval(interval);
  }, [isPaused, nextStep]);

  const handleModuleSelect = (mod: ModuleType) => {
    setActiveModule(mod);
    setCurrentStep(3);
  };

  const renderPlatformIcon = (cls: 'zalo' | 'messenger' | 'telegram') => {
    switch (cls) {
      case 'zalo':
        return <ZaloIcon />;
      case 'messenger':
        return <MessengerIcon />;
      case 'telegram':
        return <TelegramIcon />;
    }
  };

  return (
    <div className="product-frame-root" aria-label="Trải nghiệm Nền tảng Tương tác Trực quan">
      {/* Top Mac Window Bar */}
      <div className="product-chrome">
        <div className="chrome-left">
          <div className="window-dots" aria-hidden="true">
            <span className="window-dot red" />
            <span className="window-dot yellow" />
            <span className="window-dot green" />
          </div>
          <div className="chrome-breadcrumb">
            <span className="chrome-brand">nexagnet</span>
            <span className="chrome-slash">/</span>
            <span className="chrome-module">trung-tam-dieu-phoi</span>
          </div>
        </div>

        <div className="chrome-center">
          <span className="chrome-philosophy">
            AI thấu hiểu <span className="arrow">→</span> Quy tắc quyết định <span className="arrow">→</span> Con người kiểm soát
          </span>
        </div>

        <div className="chrome-right">
          <div className="status-pill">
            <span className="status-indicator-live" />
            <span>Hệ thống đang hoạt động</span>
          </div>
        </div>
      </div>

      {/* 2-Column Workstation Layout */}
      <div className="product-body">
        {/* Left Module Rail */}
        <aside className="module-rail" aria-label="Danh mục Phân hệ Vận hành">
          <div className="rail-header">
            <span className="rail-title">CÁC MODULE VẬN HÀNH</span>
            <p className="rail-subtitle">Kiến trúc mở rộng linh hoạt</p>
          </div>

          <ul className="rail-list" role="tablist">
            <li>
              <button
                type="button"
                role="tab"
                aria-selected={activeModule === 'orders'}
                className={`rail-btn ${activeModule === 'orders' ? 'active' : ''}`}
                onClick={() => handleModuleSelect('orders')}
              >
                <div className="rail-btn-header">
                  <div className="rail-btn-left">
                    <span className={`rail-dot ${activeModule === 'orders' ? 'filled' : ''}`} />
                    <span className="rail-name">Đơn hàng</span>
                  </div>
                  <span className="rail-badge active-tag">ĐANG CHẠY</span>
                </div>
                <span className="rail-desc">
                  Xử lý đơn hàng Zalo, đối soát SKU, giá &amp; hạn mức công nợ
                </span>
              </button>
            </li>

            <li>
              <button
                type="button"
                role="tab"
                aria-selected={activeModule === 'knowledge'}
                className={`rail-btn ${activeModule === 'knowledge' ? 'active' : ''}`}
                onClick={() => handleModuleSelect('knowledge')}
              >
                <div className="rail-btn-header">
                  <div className="rail-btn-left">
                    <span className={`rail-dot ${activeModule === 'knowledge' ? 'filled' : ''}`} />
                    <span className="rail-name">Tri thức &amp; CSKH</span>
                  </div>
                  <span className="rail-badge">SẴN SÀNG</span>
                </div>
                <span className="rail-desc">
                  Tra cứu chính sách bảo hành &amp; giải đáp kỹ thuật chuẩn xác
                </span>
              </button>
            </li>

            <li>
              <button
                type="button"
                role="tab"
                aria-selected={activeModule === 'campaigns'}
                className={`rail-btn ${activeModule === 'campaigns' ? 'active' : ''}`}
                onClick={() => handleModuleSelect('campaigns')}
              >
                <div className="rail-btn-header">
                  <div className="rail-btn-left">
                    <span className={`rail-dot ${activeModule === 'campaigns' ? 'filled' : ''}`} />
                    <span className="rail-name">Chiến dịch CSKH</span>
                  </div>
                  <span className="rail-badge">SẴN SÀNG</span>
                </div>
                <span className="rail-desc">
                  Phát tin CSKH định kỳ, phân bổ hàng đợi chống khóa kênh
                </span>
              </button>
            </li>

            <li>
              <button
                type="button"
                className="rail-btn"
                onClick={() => setShowMoreModal(!showMoreModal)}
                aria-expanded={showMoreModal}
              >
                <div className="rail-btn-header">
                  <div className="rail-btn-left">
                    <span className="rail-plus">+</span>
                    <span className="rail-name">Thêm quy trình</span>
                  </div>
                  <span className="rail-badge more-tag">MỞ RỘNG</span>
                </div>
                <span className="rail-desc">Tự định nghĩa quy trình AI theo nhu cầu vận hành</span>
              </button>
            </li>
          </ul>

          {/* Module Expansion Popover */}
          {showMoreModal && (
            <div className="more-popover" role="dialog" aria-label="Khả năng mở rộng module">
              <div className="popover-title">Mở rộng theo nghiệp vụ</div>
              <p className="popover-desc">
                Doanh nghiệp bắt đầu từ 1 quy trình và xây dựng thêm các module riêng trên cùng lớp Quy tắc nghiệp vụ &amp; Cổng kiểm soát.
              </p>
              <div className="popover-tags">
                <span className="popover-chip">Báo giá tự động</span>
                <span className="popover-chip">Hậu mãi &amp; Bảo hành</span>
                <span className="popover-chip">Kiểm tra công nợ</span>
                <span className="popover-chip">Đối soát đại lý</span>
              </div>
              <button
                type="button"
                className="popover-close-btn"
                onClick={() => setShowMoreModal(false)}
              >
                Đóng
              </button>
            </div>
          )}

          {/* Reassurance Footer */}
          <div className="rail-footer">
            <div className="reassurance-box">
              <div className="reassurance-title">Lõi vận hành hợp nhất</div>
              <div className="reassurance-body">
                Mọi module đều đi qua cùng một lớp kiểm soát quy tắc kinh doanh và phê duyệt nhân sự.
              </div>
            </div>
          </div>
        </aside>

        {/* Main Orchestration Canvas */}
        <main className="workflow-canvas" aria-live="polite">
          {/* Top Canvas Bar */}
          <div className="canvas-header">
            <div className="workflow-tag">
              <span className="workflow-indicator" />
              <span>Quy trình vận hành: <strong>{workflow.name}</strong></span>
            </div>
            <div className="step-controls" role="tablist" aria-label="Trình tự các bước">
              <button
                type="button"
                className={`step-pill ${currentStep === 0 ? 'active' : ''}`}
                onClick={() => setCurrentStep(0)}
              >
                1. Tiếp nhận tin
              </button>
              <span className="step-sep">→</span>
              <button
                type="button"
                className={`step-pill ${currentStep === 1 ? 'active' : ''}`}
                onClick={() => setCurrentStep(1)}
              >
                2. AI Trích xuất
              </button>
              <span className="step-sep">→</span>
              <button
                type="button"
                className={`step-pill ${currentStep === 2 ? 'active' : ''}`}
                onClick={() => setCurrentStep(2)}
              >
                3. Kiểm tra quy tắc
              </button>
              <span className="step-sep">→</span>
              <button
                type="button"
                className={`step-pill ${currentStep === 3 ? 'active' : ''}`}
                onClick={() => setCurrentStep(3)}
              >
                4. Quyết định &amp; Thực thi
              </button>
            </div>
          </div>

          {/* Interactive Flow Grid */}
          <div className="flow-grid">
            {/* Stage 1: Business Input with Bold Prominent Platform Label */}
            <div className={`flow-stage ${currentStep >= 0 ? 'stage-active' : ''}`}>
              <div className="stage-header">
                <div className="stage-badge-group">
                  <span className="stage-number">01</span>
                  <span className="stage-label">LUỒNG TIN NHẮN ĐẾN</span>
                </div>
                <div className="source-tag-wrap">
                  <span className={`platform-source-chip ${workflow.platformClass}`}>
                    {renderPlatformIcon(workflow.platformClass)}
                    <span>{workflow.platformName}</span>
                  </span>
                  <span className="source-tag-name">{workflow.sourceTag}</span>
                </div>
              </div>
              <div className="input-card">
                <div className="input-quote">{workflow.inputText}</div>
                <div className="input-meta">
                  <span className="input-time">{workflow.sourceTime}</span>
                  <span className="input-channel-badge">{workflow.channelBadge}</span>
                </div>
              </div>
            </div>

            {/* Connecting Node 1 */}
            <div className="connector-block" aria-hidden="true">
              <div className={`connector-line ${currentStep >= 1 ? 'line-active' : ''}`} />
              <div className={`connector-node ${currentStep >= 1 ? 'node-active' : ''}`} />
              <div className={`connector-line ${currentStep >= 1 ? 'line-active' : ''}`} />
            </div>

            {/* Stage 2: AI Understanding */}
            <div className={`flow-stage ${currentStep >= 1 ? 'stage-active' : ''}`}>
              <div className="stage-header">
                <div className="stage-badge-group">
                  <span className="stage-number">02</span>
                  <span className="stage-label">AI TRÍCH XUẤT THÔNG TIN</span>
                </div>
                <span className="tech-badge">{workflow.aiBadge}</span>
              </div>
              <div className="fields-grid">
                {workflow.aiFields.map((field, idx) => (
                  <div key={idx} className="field-row">
                    <span className="field-key">{field.label}</span>
                    <div className="field-val-wrap">
                      <span className="field-value">{field.value}</span>
                      {field.badge && (
                        <span className="field-badge">{field.badge}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Connecting Node 2 */}
            <div className="connector-block" aria-hidden="true">
              <div className={`connector-line ${currentStep >= 2 ? 'line-active' : ''}`} />
              <div className={`connector-node ${currentStep >= 2 ? 'node-active' : ''}`} />
              <div className={`connector-line ${currentStep >= 2 ? 'line-active' : ''}`} />
            </div>

            {/* Stage 3: Business Rules Engine */}
            <div className={`flow-stage ${currentStep >= 2 ? 'stage-active' : ''}`}>
              <div className="stage-header">
                <div className="stage-badge-group">
                  <span className="stage-number">03</span>
                  <span className="stage-label">QUY TẮC KINH DOANH</span>
                </div>
                <span className="tech-badge rules-badge">{workflow.rulesBadge}</span>
              </div>
              <div className="rules-list">
                {workflow.rulesItems.map((rule, idx) => (
                  <div key={idx} className="rule-row">
                    <div className="rule-left">
                      <span className="rule-check-icon" aria-hidden="true">✓</span>
                      <span className="rule-name">{rule.label}</span>
                    </div>
                    <div className="rule-right">
                      <span className="rule-status-pill">{rule.status}</span>
                      <span className="rule-detail">{rule.detail}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Validation Checkpoint Banner */}
            <div className="validation-checkpoint" aria-hidden="true">
              <div className="validation-node-badge validated-active">
                <span className="val-icon">●</span>
                <span>{workflow.validateText}</span>
              </div>
            </div>

            {/* Stage 4: Decision & Execution */}
            <div className={`flow-stage ${currentStep >= 3 ? 'stage-active' : ''}`}>
              <div className="stage-header">
                <div className="stage-badge-group">
                  <span className="stage-number">04</span>
                  <span className="stage-label">QUYẾT ĐỊNH &amp; THỰC THI</span>
                </div>
                <span className="tech-badge rules-badge">Định tuyến tất định</span>
              </div>

              <div className="branches-grid">
                {/* Automated Execution Box */}
                <div className="branch-card branch-auto">
                  <div className="branch-card-header">
                    <div className="branch-title-group">
                      <span className="branch-dot green" />
                      <span className="branch-title">{workflow.autoTitle}</span>
                    </div>
                    <span className="branch-badge auto-badge">Tuyến đang chạy</span>
                  </div>
                  <p className="branch-detail">{workflow.autoDetail}</p>
                  <div className="branch-footer-tag">
                    <span>→</span>
                    <span>{workflow.autoTarget}</span>
                  </div>
                </div>

                {/* Human-in-the-Loop Safeguard Box */}
                <div className="branch-card branch-human">
                  <div className="branch-card-header">
                    <div className="branch-title-group">
                      <span className="branch-dot amber" />
                      <span className="branch-title">{workflow.humanTitle}</span>
                    </div>
                    <span className="branch-badge human-badge">Cổng kiểm soát</span>
                  </div>
                  <p className="branch-detail">{workflow.humanTrigger}</p>
                  <div className="branch-footer-tag human-tag">
                    <span>↺</span>
                    <span>{workflow.humanStatus}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Playback Control Bar */}
          <div className="canvas-footer">
            <div className="playback-info">
              <button
                type="button"
                className={`pause-toggle-btn ${isPaused ? 'is-paused' : ''}`}
                onClick={() => setIsPaused(!isPaused)}
                aria-label={isPaused ? 'Tiếp tục chạy mô phỏng' : 'Tạm dừng mô phỏng'}
              >
                {isPaused ? '▶ Chạy tiếp' : '⏸ Tạm dừng'}
              </button>
              <span className="flow-hint">Di chuột để giữ xem chi tiết từng bước</span>
            </div>
            <div className="progress-track" aria-hidden="true">
              <div
                className="progress-fill"
                style={{ width: `${((currentStep + 1) / 4) * 100}%` }}
              />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
