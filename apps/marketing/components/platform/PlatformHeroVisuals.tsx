'use client';

import React from 'react';

/**
 * 1. Platform Overview Signature Visual
 * Sơ đồ 4 Tầng Kiến trúc: Channels -> AI Understanding -> Rules Engine -> Human & Execution
 */
export function PlatformOverviewVisual() {
  return (
    <div className="platform-tech-card overview-tech" aria-label="Sơ đồ 4 tầng kiến trúc nexagnet">
      <div className="tech-header">
        <div className="tech-header-left">
          <span className="tech-dot active" />
          <span className="tech-title">4-LAYER ENTERPRISE AI ARCHITECTURE</span>
        </div>
        <span className="tech-badge">CORE INFRASTRUCTURE</span>
      </div>

      <div className="tech-body">
        <div className="layer-stack">
          {/* Layer 1: Ingest */}
          <div className="layer-card">
            <div className="layer-meta">
              <span className="layer-num">TẦNG 01</span>
              <span className="layer-role">CHANNELS &amp; INGEST</span>
            </div>
            <div className="layer-content">
              <span>Zalo Userbot / Bot Platform · Telegram · Webhook · Đa kênh tiếp nhận</span>
            </div>
          </div>

          {/* Layer 2: Understanding */}
          <div className="layer-card highlight-ai">
            <div className="layer-meta">
              <span className="layer-num">TẦNG 02</span>
              <span className="layer-role">AI SEMANTIC UNDERSTANDING</span>
            </div>
            <div className="layer-content">
              <span>Trích xuất ràng buộc trong từ điển đóng · Ép JSON Schema qua Tool Use</span>
            </div>
          </div>

          {/* Layer 3: Rules */}
          <div className="layer-card highlight-rules">
            <div className="layer-meta">
              <span className="layer-num">TẦNG 03</span>
              <span className="layer-role">DETERMINISTIC RULES ENGINE</span>
            </div>
            <div className="layer-content">
              <span>100% Mã TypeScript tất định · Tính giá, thuế VAT, kiểm soát hạn mức công nợ từ DB</span>
            </div>
          </div>

          {/* Layer 4: Execution */}
          <div className="layer-card highlight-exec">
            <div className="layer-meta">
              <span className="layer-num">TẦNG 04</span>
              <span className="layer-role">EXECUTION &amp; HUMAN-IN-THE-LOOP</span>
            </div>
            <div className="layer-content">
              <span>Tự động gửi xác nhận / Phân luồng Hàng việc Sales · Đồng bộ ERP &amp; KiotViet</span>
            </div>
          </div>
        </div>
      </div>

      <div className="tech-footer">
        <span>🛡️ AI không tính tiền · Rules không võ đoán</span>
        <span>⚡ Độ trễ toàn trình &lt; 3.2s</span>
      </div>
    </div>
  );
}

/**
 * 2. Platform Control Signature Visual
 * Bảng kiểm soát: Rules Gate + Audit Trail Ledger + Safety Kill-Switch
 */
export function PlatformControlVisual() {
  return (
    <div className="platform-tech-card control-tech" aria-label="Sơ đồ Kiểm soát & Quản trị AI">
      <div className="tech-header">
        <div className="tech-header-left">
          <span className="tech-dot active" />
          <span className="tech-title">GOVERNANCE, AUDIT &amp; SAFETY GATES</span>
        </div>
        <span className="tech-badge danger">KILL-SWITCH ARMED</span>
      </div>

      <div className="tech-body">
        <div className="control-switches-row">
          <div className="switch-item active">
            <span className="sw-indicator" />
            <div className="sw-info">
              <span className="sw-title">DETERMINISTIC RULE ENGINE</span>
              <span className="sw-status">ENFORCED (100% ACTIVE)</span>
            </div>
          </div>

          <div className="switch-item armed">
            <span className="sw-indicator armed" />
            <div className="sw-info">
              <span className="sw-title">AUTO-SEND KILL SWITCH</span>
              <span className="sw-status">ARMED &amp; MONITORED</span>
            </div>
          </div>
        </div>

        <div className="audit-ledger-feed">
          <div className="ledger-header">NHẬT KÝ KIỂM TOÁN THỜI GIAN THỰC (AUDIT LOG):</div>
          <div className="ledger-entry">
            <span className="time">10:48:12</span>
            <span className="actor">[RulesEngine]</span>
            <span className="event">Khớp SKU FLX-01 (15 cái) → Hạn mức công nợ PASS → Tự động xác nhận</span>
          </div>
          <div className="ledger-entry warn">
            <span className="time">10:47:05</span>
            <span className="actor">[GateKeeper]</span>
            <span className="event">Đơn 120 chiếc &gt; ngưỡng maxAutoConfirm (50) → Chuyển Sales duyệt</span>
          </div>
        </div>
      </div>

      <div className="tech-footer">
        <span>🔒 Tuân thủ Luật Bảo vệ dữ liệu 91/2025/QH15</span>
        <span>📑 Lưu vết bất biến mọi quyết định</span>
      </div>
    </div>
  );
}

/**
 * 3. Platform Integrations Signature Visual
 * Bus kết nối Ingest Adapters và System Connectors
 */
export function PlatformIntegrationsVisual() {
  return (
    <div className="platform-tech-card integrations-tech" aria-label="Sơ đồ Hạ tầng Tích hợp & Kết nối">
      <div className="tech-header">
        <div className="tech-header-left">
          <span className="tech-dot active" />
          <span className="tech-title">INTEGRATION BUS &amp; ADAPTER NETWORK</span>
        </div>
        <span className="tech-badge brand">OPEN ARCHITECTURE</span>
      </div>

      <div className="tech-body">
        <div className="integration-flow-grid">
          {/* Column 1: Ingest Adapters */}
          <div className="bus-col">
            <div className="bus-col-title">INGEST ADAPTERS</div>
            <div className="bus-item active">
              <span>📱 Zalo Web (zca-js)</span>
              <span className="bus-tag ok">Active</span>
            </div>
            <div className="bus-item active">
              <span>🤖 Zalo Bot Platform</span>
              <span className="bus-tag ok">Ready</span>
            </div>
            <div className="bus-item">
              <span>✈️ Telegram &amp; Webhook</span>
              <span className="bus-tag">Plug-in</span>
            </div>
          </div>

          {/* Bus Core Connector */}
          <div className="bus-center">
            <div className="bus-core-node">
              <span className="core-icon">⚡</span>
              <span className="core-text">NEXAGNET CORE BUS</span>
            </div>
          </div>

          {/* Column 2: System Connectors */}
          <div className="bus-col">
            <div className="bus-col-title">ERP &amp; DATABASE</div>
            <div className="bus-item active">
              <span>🗄️ PostgreSQL + Prisma</span>
              <span className="bus-tag ok">Source of Truth</span>
            </div>
            <div className="bus-item">
              <span>🔌 ErpPort (KiotViet / MISA)</span>
              <span className="bus-tag ready">Standardized</span>
            </div>
            <div className="bus-item">
              <span>🚚 Base / AhaMove Webhook</span>
              <span className="bus-tag ready">Outbound</span>
            </div>
          </div>
        </div>
      </div>

      <div className="tech-footer">
        <span>🔌 Tách biệt cổng ErpPort trung lập</span>
        <span>🛡️ Không phụ thuộc cứng vào bên thứ ba</span>
      </div>
    </div>
  );
}
