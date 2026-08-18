'use client';

import React from 'react';

/**
 * 1. Sales Department Signature Visual
 * Luồng: Lead / Khách hàng -> Đánh giá cơ hội -> Báo giá theo Rules -> Xác nhận đơn -> Hàng việc Sales
 */
export function SalesHeroVisual() {
  return (
    <div className="dept-visual-card dept-visual-sales" aria-label="Sơ đồ xử lý Bán hàng nexagnet">
      <div className="visual-card-header">
        <div className="visual-header-left">
          <span className="visual-status-dot active" />
          <span className="visual-title">SALES PIPELINE &amp; AUTOMATION</span>
        </div>
        <span className="visual-badge">REAL-TIME</span>
      </div>

      <div className="visual-body">
        {/* Step 1: Lead Ingest */}
        <div className="flow-node active">
          <div className="node-icon">💬</div>
          <div className="node-info">
            <div className="node-label">TIẾP NHẬN YÊU CẦU</div>
            <div className="node-val">Zalo / Hotline: “Báo giá 20 quạt Felix về HN”</div>
          </div>
          <span className="node-tag success">Đã nhận diện</span>
        </div>

        <div className="flow-connector">
          <span className="flow-line" />
          <span className="flow-arrow">↓</span>
        </div>

        {/* Step 2: Qualification & Rule Match */}
        <div className="flow-node highlight">
          <div className="node-icon">⚖️</div>
          <div className="node-info">
            <div className="node-label">RULES ENGINE BÁN HÀNG</div>
            <div className="node-val">Áp biểu giá Đại lý Cấp 1 · Chiết khấu 15% · Tồn kho: 84 chiếc</div>
          </div>
          <span className="node-tag brand">Khớp 100%</span>
        </div>

        <div className="flow-connector">
          <span className="flow-line" />
          <span className="flow-arrow">↓</span>
        </div>

        {/* Step 3: Branching Decision */}
        <div className="flow-branch-row">
          <div className="branch-card auto">
            <div className="branch-header">
              <span className="branch-pill auto">TỰ ĐỘNG</span>
              <span className="branch-title">Báo giá &amp; Soạn đơn</span>
            </div>
            <p className="branch-desc">Gửi báo giá chuẩn vào nhóm Zalo trong 3 giây</p>
          </div>

          <div className="branch-card human">
            <div className="branch-header">
              <span className="branch-pill human">SALES DUYỆT</span>
              <span className="branch-title">Đàm phán ngoại lệ</span>
            </div>
            <p className="branch-desc">Chuyển hàng việc khi khách yêu cầu chiết khấu riêng</p>
          </div>
        </div>
      </div>

      <div className="visual-footer">
        <span className="footer-metric">⚡ Phản hồi: &lt; 3s</span>
        <span className="footer-metric">🛡️ Sai sót giá: 0%</span>
        <span className="footer-metric">📈 Tỷ lệ chốt: +35%</span>
      </div>
    </div>
  );
}

/**
 * 2. Operations Department Signature Visual
 * Luồng: Tiếp nhận đơn -> Đối soát SKU & Tồn kho -> Phân luồng kho chi nhánh -> Đồng bộ ERP
 */
export function OperationsHeroVisual() {
  return (
    <div className="dept-visual-card dept-visual-operations" aria-label="Sơ đồ Vận hành & Kho vận nexagnet">
      <div className="visual-card-header">
        <div className="visual-header-left">
          <span className="visual-status-dot active" />
          <span className="visual-title">OPERATIONS &amp; FULFILLMENT MATRIX</span>
        </div>
        <span className="visual-badge">ERP SYNC</span>
      </div>

      <div className="visual-body">
        {/* Step 1: Order Ingest */}
        <div className="flow-node active">
          <div className="node-icon">📦</div>
          <div className="node-info">
            <div className="node-label">BÓC TÁCH ĐƠN HÀNG HỘI THOẠI</div>
            <div className="node-val">Khớp SKU: FLX-01 (10 cái) + OCP-AIR (5 cái)</div>
          </div>
          <span className="node-tag success">Đã chuẩn hóa</span>
        </div>

        <div className="flow-connector">
          <span className="flow-line" />
          <span className="flow-arrow">↓</span>
        </div>

        {/* Step 2: Inventory Allocation */}
        <div className="flow-node highlight">
          <div className="node-icon">🏢</div>
          <div className="node-info">
            <div className="node-label">ĐIỀU PHỐI KHO TỐI ƯU</div>
            <div className="node-val">Kho Hà Nội (Sẵn hàng) → Giao qua AhaMove / Viettel Post</div>
          </div>
          <span className="node-tag brand">Auto Routing</span>
        </div>

        <div className="flow-connector">
          <span className="flow-line" />
          <span className="flow-arrow">↓</span>
        </div>

        {/* Step 3: Warehouse Execution State */}
        <div className="flow-grid-status">
          <div className="status-box valid">
            <div className="status-num">98.5%</div>
            <div className="status-lbl">Đơn hợp lệ tự động</div>
          </div>
          <div className="status-box warning">
            <div className="status-num">1.5%</div>
            <div className="status-lbl">Cần kho kiểm tra lại</div>
          </div>
          <div className="status-box ready">
            <div className="status-num">100%</div>
            <div className="status-lbl">Lưu vết kiểm toán</div>
          </div>
        </div>
      </div>

      <div className="visual-footer">
        <span className="footer-metric">⚡ Xử lý đơn: 5 giây/đơn</span>
        <span className="footer-metric">📋 Tránh lệch tồn kho</span>
      </div>
    </div>
  );
}

/**
 * 3. Customer Service Department Signature Visual
 * Luồng: Đa kênh tiếp nhận -> Phân loại ý định -> Tra cứu Tri thức RAG -> Trả lời / Escalate
 */
export function CustomerServiceHeroVisual() {
  return (
    <div className="dept-visual-card dept-visual-cs" aria-label="Sơ đồ Chăm sóc khách hàng nexagnet">
      <div className="visual-card-header">
        <div className="visual-header-left">
          <span className="visual-status-dot active" />
          <span className="visual-title">OMNICHANNEL CS &amp; RESOLUTION GATE</span>
        </div>
        <span className="visual-badge">24/7 SUPPORT</span>
      </div>

      <div className="visual-body">
        <div className="cs-chat-bubble user">
          <span className="cs-sender">Khách hàng (Zalo):</span>
          <p>“Máy lọc không khí báo lỗi E2 và nhấp nháy đèn đỏ xử lý thế nào em?”</p>
        </div>

        <div className="cs-pipeline-tag">
          <span className="tag-ai">AI CLASSIFY: KHIẾU NẠI KỸ THUẬT / LỖI E2</span>
          <span className="tag-rag">RAG: SÁCH HƯỚNG DẪN ULTTY V3</span>
        </div>

        <div className="cs-chat-bubble agent">
          <div className="cs-agent-header">
            <span className="agent-badge">AI CS Agent</span>
            <span className="verified-check">✓ Đã kiểm chứng tài liệu</span>
          </div>
          <p>“Dạ lỗi E2 là cảnh báo màng lọc HEPA cần vệ sinh bụi. Anh/chị tháo nắp sau, lau cảm biến quang học theo video này nhé...”</p>
        </div>

        <div className="cs-action-row">
          <div className="action-pill ok">✓ Tự động giải quyết 85% câu hỏi</div>
          <div className="action-pill route">↗ Chuyển Kỹ thuật viên nếu tái diễn</div>
        </div>
      </div>

      <div className="visual-footer">
        <span className="footer-metric">⏱️ Thời gian chờ: 0s</span>
        <span className="footer-metric">🎯 Độ chính xác: 99.2%</span>
      </div>
    </div>
  );
}

/**
 * 4. Marketing Department Signature Visual
 * Luồng: Phân khúc tệp khách -> Dự thảo chiến dịch -> Giãn cách tần suất gửi -> Đo lường chuyển đổi
 */
export function MarketingHeroVisual() {
  return (
    <div className="dept-visual-card dept-visual-marketing" aria-label="Sơ đồ Marketing nexagnet">
      <div className="visual-card-header">
        <div className="visual-header-left">
          <span className="visual-status-dot active" />
          <span className="visual-title">PROACTIVE CAMPAIGN &amp; AUDIENCE HUB</span>
        </div>
        <span className="visual-badge">AUTOMATED DRIP</span>
      </div>

      <div className="visual-body">
        <div className="mkt-segment-bar">
          <div className="segment-item active">
            <span className="seg-dot" />
            <span className="seg-name">Đại lý Cấp 1 (Chưa tái đặt 30 ngày)</span>
            <span className="seg-count">142 đại lý</span>
          </div>
        </div>

        <div className="mkt-campaign-card">
          <div className="campaign-badge">CHIẾN DỊCH CSKH ĐẦU THÁNG</div>
          <div className="campaign-title">Gửi chính sách ưu đãi linh kiện &amp; Catalog tháng mới</div>
          <div className="campaign-schedule">
            <span className="sched-icon">⏱️</span>
            <span>Khung giờ: 09:00 - 11:30 · Giãn cách an toàn: 15s/tin nhắn</span>
          </div>
        </div>

        <div className="mkt-metrics-grid">
          <div className="mkt-metric">
            <span className="mkt-val">100%</span>
            <span className="mkt-lbl">Không spam / An toàn Zalo</span>
          </div>
          <div className="mkt-metric">
            <span className="mkt-val">42.8%</span>
            <span className="mkt-lbl">Tỷ lệ tương tác phản hồi</span>
          </div>
          <div className="mkt-metric">
            <span className="mkt-val">28 đơn</span>
            <span className="mkt-lbl">Tạo tức thì trong ngày</span>
          </div>
        </div>
      </div>

      <div className="visual-footer">
        <span className="footer-metric">🛡️ Tuân thủ ToS &amp; Luật 91/2025</span>
        <span className="footer-metric">📊 Báo cáo thời gian thực</span>
      </div>
    </div>
  );
}

/**
 * 5. Finance Department Signature Visual
 * Luồng: Hóa đơn & Bảng kê -> Đối soát công nợ 30/45 ngày -> Tính VAT & Chiết khấu -> Nhật ký kiểm toán
 */
export function FinanceHeroVisual() {
  return (
    <div className="dept-visual-card dept-visual-finance" aria-label="Sơ đồ Tài chính & Kế toán nexagnet">
      <div className="visual-card-header">
        <div className="visual-header-left">
          <span className="visual-status-dot active" />
          <span className="visual-title">FINANCIAL AUDIT &amp; DEBT GATE</span>
        </div>
        <span className="visual-badge">ZERO MATH ERROR</span>
      </div>

      <div className="visual-body">
        <div className="fin-ledger-row">
          <div className="fin-col">
            <span className="fin-label">ĐỐI TÁC</span>
            <span className="fin-val">Đại lý Meta Hà Nội</span>
          </div>
          <div className="fin-col">
            <span className="fin-label">HẠN MỨC CÔNG NỢ</span>
            <span className="fin-val">50.000.000đ / 30 ngày</span>
          </div>
          <div className="fin-col">
            <span className="fin-label">NỢ HIỆN TẠI</span>
            <span className="fin-val highlight">18.500.000đ</span>
          </div>
        </div>

        <div className="fin-check-box">
          <div className="check-row pass">
            <span className="check-icon">✓</span>
            <span className="check-text">Đơn mới: 11.500.000đ → Tổng sau đơn: 30.000.000đ (Trong hạn mức an toàn)</span>
          </div>
          <div className="check-row pass">
            <span className="check-icon">✓</span>
            <span className="check-text">Chiết khấu thương mại: 15% · Thuế VAT 10% tính bằng Rules Engine tất định</span>
          </div>
          <div className="check-row locked">
            <span className="check-icon">🔒</span>
            <span className="check-text">Không cho phép AI tự sinh số tiền — 100% tính toán từ DB</span>
          </div>
        </div>
      </div>

      <div className="visual-footer">
        <span className="footer-metric">🛡️ Tránh thất thoát tài chính</span>
        <span className="footer-metric">📑 Sẵn sàng xuất hóa đơn điện tử</span>
      </div>
    </div>
  );
}

/**
 * 6. HR Department Signature Visual
 * Luồng: Tra cứu chính sách nhân sự -> Nộp đề xuất / Nghỉ phép -> Phê duyệt quản lý -> Ghi nhận hồ sơ
 */
export function HRHeroVisual() {
  return (
    <div className="dept-visual-card dept-visual-hr" aria-label="Sơ đồ Nhân sự & Nội bộ nexagnet">
      <div className="visual-card-header">
        <div className="visual-header-left">
          <span className="visual-status-dot active" />
          <span className="visual-title">HR KNOWLEDGE &amp; INTERNAL GATEWAY</span>
        </div>
        <span className="visual-badge">INTERNAL ONLY</span>
      </div>

      <div className="visual-body">
        <div className="hr-query-card">
          <div className="query-header">
            <span className="user-avatar">👤</span>
            <span className="user-text">Nhân viên hỏi: “Quy định nghỉ phép năm và tạm ứng công tác phí thế nào?”</span>
          </div>
        </div>

        <div className="hr-rule-result">
          <div className="rule-badge">QUY CHẾ NỘI BỘ V2.4</div>
          <ul className="rule-list">
            <li>✓ Phép năm còn lại: 04 ngày (Hạn sử dụng: 31/12)</li>
            <li>✓ Định mức tạm ứng công tác tỉnh: Tối đa 5.000.000đ / đợt</li>
            <li>✓ Form tự động đã được điền sẵn thông tin nhân viên</li>
          </ul>
        </div>

        <div className="hr-action-status">
          <span className="status-badge ready">Trình Trưởng phòng duyệt qua 1 chạm</span>
        </div>
      </div>

      <div className="visual-footer">
        <span className="footer-metric">⚡ Giảm 70% câu hỏi hành chính lặp lại</span>
        <span className="footer-metric">🔒 Bảo mật lương thưởng</span>
      </div>
    </div>
  );
}

/**
 * 7. Executive & Board Signature Visual
 * Luồng: Tổng hợp dữ liệu đa phòng ban -> Giám sát tuân thủ Rules -> Báo động ngoại lệ -> Bảng điều khiển lãnh đạo
 */
export function ExecutiveHeroVisual() {
  return (
    <div className="dept-visual-card dept-visual-executive" aria-label="Sơ đồ Ban Giám đốc nexagnet">
      <div className="visual-card-header">
        <div className="visual-header-left">
          <span className="visual-status-dot active" />
          <span className="visual-title">EXECUTIVE CONTROL &amp; AUDIT DASHBOARD</span>
        </div>
        <span className="visual-badge">OWNER VIEW</span>
      </div>

      <div className="visual-body">
        <div className="exec-kpi-row">
          <div className="exec-kpi">
            <span className="kpi-title">ĐƠN HÀNG HÔM NAY</span>
            <span className="kpi-value">148 đơn</span>
            <span className="kpi-sub green">↑ 92% tự động xác nhận</span>
          </div>
          <div className="exec-kpi">
            <span className="kpi-title">DOANH THU ĐỐI SOÁT</span>
            <span className="kpi-value">482.5 tr</span>
            <span className="kpi-sub">0 sai lệch công nợ</span>
          </div>
          <div className="exec-kpi">
            <span className="kpi-title">HÀNG VIỆC CẦN DUYỆT</span>
            <span className="kpi-value highlight">3 mục</span>
            <span className="kpi-sub amber">Đã phân bổ đúng Sales</span>
          </div>
        </div>

        <div className="exec-safety-row">
          <div className="safety-item">
            <span className="safety-icon">🛡️</span>
            <span className="safety-text">Rules Engine: 100% Hoạt động bình thường</span>
          </div>
          <div className="safety-item">
            <span className="safety-icon">⚡</span>
            <span className="safety-text">Kill Switch: Sẵn sàng can thiệp tức thì</span>
          </div>
        </div>
      </div>

      <div className="visual-footer">
        <span className="footer-metric">👁️ Minh bạch toàn diện</span>
        <span className="footer-metric">📊 Báo cáo tức thì cho Ban Giám đốc</span>
      </div>
    </div>
  );
}
