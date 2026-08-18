'use client';

import React from 'react';

/**
 * Knowledge Hub Signature Visual
 * Luồng: Tập hợp tài liệu -> Đánh chỉ mục Vector -> Tra cứu đối soát RAG -> Trích dẫn tuyệt đối
 */
export function KnowledgeHeroVisual() {
  return (
    <div className="product-simulator-card knowledge-sim" aria-label="Khung mô phỏng Enterprise Knowledge Hub">
      <div className="sim-header">
        <div className="sim-header-left">
          <span className="sim-dot active" />
          <span className="sim-title">ENTERPRISE RAG &amp; SOURCE OF TRUTH EXPLORER</span>
        </div>
        <span className="sim-badge">MODULE 02</span>
      </div>

      <div className="sim-body">
        <div className="sim-search-bar">
          <span className="search-icon">🔍</span>
          <span className="search-query">“Chính sách đổi trả hàng do lỗi sản xuất và thời hạn bảo hành động cơ”</span>
          <span className="search-btn">Tìm kiếm</span>
        </div>

        <div className="sim-rag-results">
          <div className="rag-doc-card active">
            <div className="doc-top">
              <span className="doc-type">PDF · NGUỒN SỰ THẬT</span>
              <span className="doc-score">Độ khớp: 99.4%</span>
            </div>
            <div className="doc-name">Chính sách Bảo hành &amp; Đổi trả Sản phẩm Ultty 2026.pdf</div>
            <div className="doc-snippet">
              “Mục 3.2: Khách hàng được đổi mới 1-1 trong vòng 30 ngày nếu phát hiện lỗi từ nhà sản xuất. Động cơ quạt không cánh được bảo hành chính hãng 24 tháng kể từ ngày kích hoạt mã serial...”
            </div>
          </div>

          <div className="sim-citation-box">
            <div className="cite-header">
              <span className="cite-badge">AI Trả lời kèm trích dẫn</span>
              <span className="cite-status">✓ Đã kiểm chứng tài liệu gốc</span>
            </div>
            <p className="cite-content">
              “Sản phẩm được đổi mới 1-1 trong 30 ngày đầu tiên và động cơ được bảo hành 24 tháng. Bạn có muốn kích hoạt bảo hành điện tử cho khách hàng ngay bây giờ không?”
            </p>
          </div>
        </div>
      </div>

      <div className="sim-footer">
        <span>🔒 Phân quyền tài liệu RBAC</span>
        <span>📑 Tuyệt đối không ảo giác / Bịa đặt câu trả lời</span>
      </div>
    </div>
  );
}

/**
 * Campaigns Signature Visual
 * Luồng: Phân tập đối tượng -> Soạn thảo & Duyệt kịch bản -> Lập lịch phân bổ giãn cách -> Báo cáo chuyển đổi
 */
export function CampaignsHeroVisual() {
  return (
    <div className="product-simulator-card campaigns-sim" aria-label="Khung mô phỏng Proactive Campaigns">
      <div className="sim-header">
        <div className="sim-header-left">
          <span className="sim-dot active" />
          <span className="sim-title">OUTBOUND CARE &amp; STAGGERED DISPATCH SIMULATOR</span>
        </div>
        <span className="sim-badge">MODULE 03</span>
      </div>

      <div className="sim-body">
        <div className="camp-timeline-bar">
          <div className="camp-step completed">
            <span className="step-dot">1</span>
            <span className="step-name">Lọc Tệp Khách</span>
          </div>
          <div className="camp-step-line active" />
          <div className="camp-step completed">
            <span className="step-dot">2</span>
            <span className="step-name">Duyệt Kịch Bản</span>
          </div>
          <div className="camp-step-line active" />
          <div className="camp-step in-progress">
            <span className="step-dot">3</span>
            <span className="step-name">Phân Bổ Lịch Gửi</span>
          </div>
        </div>

        <div className="camp-dispatch-monitor">
          <div className="monitor-row">
            <span className="mon-label">TẬP MỤC TIÊU:</span>
            <span className="mon-val">250 Đại lý có kỳ đặt hàng định kỳ tuần 3</span>
          </div>
          <div className="monitor-row">
            <span className="mon-label">TIẾN ĐỘ GỬI:</span>
            <span className="mon-val text-brand">Đang phát 120/250 tin (Giãn cách an toàn: 15s)</span>
          </div>
          <div className="monitor-progress-track">
            <div className="monitor-progress-fill" style={{ width: '48%' }} />
          </div>
        </div>

        <div className="camp-safety-guard">
          <span>🛡️ Kiểm soát an toàn: Không gửi trùng lặp · Tự động tạm dừng nếu đại lý đang chat</span>
        </div>
      </div>

      <div className="sim-footer">
        <span>⏱️ Tự động giãn cách tránh khóa nick</span>
        <span>📈 Đo lường tỷ lệ đơn hàng phát sinh</span>
      </div>
    </div>
  );
}
