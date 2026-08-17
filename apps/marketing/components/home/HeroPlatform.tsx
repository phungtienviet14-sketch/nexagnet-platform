'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

export function HeroPlatform() {
  const [activeStep, setActiveStep] = useState<number>(1); // 0: Input, 1: AI, 2: Rules, 3: Decision
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-cycle through the 4 orchestration steps every 3.5s unless hovered/paused
  useEffect(() => {
    if (isPaused) return;

    timerRef.current = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % 4);
    }, 3800);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPaused]);

  return (
    <section className="hero-section platform-hero" aria-label="Hero Platform Overview">
      <div className="container">
        <div className="hero-content">
          {/* 1. Eyebrow */}
          <div className="hero-eyebrow-wrap animate-hero-eyebrow">
            <div className="hero-eyebrow">
              <span className="eyebrow-node" aria-hidden="true" />
              <span className="eyebrow-text">NỀN TẢNG AI VẬN HÀNH DOANH NGHIỆP</span>
            </div>
          </div>

          {/* 2. Headline */}
          <h1 className="hero-headline animate-hero-headline">
            AI cho từng quy trình
            <br />
            vận hành của bạn.
          </h1>

          {/* 3. Subheadline */}
          <p className="hero-subheadline animate-hero-subheadline">
            nexagnet là nền tảng AI Agent theo module, giúp doanh nghiệp tự động hóa từng quy trình — từ hội thoại, xử lý đơn hàng và chăm sóc khách hàng đến các tác vụ vận hành phức tạp hơn — mà vẫn duy trì quy tắc và quyền kiểm soát.
          </p>

          {/* 4. Action CTAs */}
          <div className="hero-cta-group animate-hero-cta">
            <Link href="#demo" className="btn-primary hero-btn-main">
              <span>Yêu cầu Demo</span>
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
                className="cta-arrow-icon"
              >
                <path
                  d="M6 3.5L10.5 8L6 12.5"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>

            <Link href="#platform" className="btn-secondary hero-btn-sub">
              <span>Khám phá nền tảng</span>
            </Link>
          </div>

          {/* 5. Supporting Trust Copy */}
          <div className="hero-supporting-copy animate-hero-supporting">
            <span className="supporting-icon" aria-hidden="true">✦</span>
            <span>Bắt đầu từ một quy trình. Mở rộng khi doanh nghiệp của bạn sẵn sàng.</span>
          </div>

          {/* 6. Platform Operational Canvas / Orchestration Visual */}
          <div
            className="platform-canvas-wrapper animate-hero-visual"
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
          >
            <div className="canvas-header-bar">
              <div className="canvas-header-left">
                <span className="canvas-dot red" />
                <span className="canvas-dot yellow" />
                <span className="canvas-dot green" />
                <span className="canvas-title">nexagnet Operational Orchestration Canvas</span>
              </div>
              <div className="canvas-header-right">
                <span className="orchestration-badge">Module-based Architecture</span>
              </div>
            </div>

            <div className="canvas-body-grid">
              {/* Left Sidebar: Modules Registry */}
              <div className="canvas-sidebar">
                <div className="sidebar-heading">MODULES VẬN HÀNH</div>
                <div className="sidebar-modules-list">
                  <div className="sidebar-mod-item active-mod">
                    <span className="mod-status-dot live" />
                    <div className="mod-info">
                      <span className="mod-name">Order Automation</span>
                      <span className="mod-tag">Sản phẩm tiêu biểu</span>
                    </div>
                  </div>
                  <div className="sidebar-mod-item">
                    <span className="mod-status-dot ready" />
                    <div className="mod-info">
                      <span className="mod-name">Knowledge Base</span>
                      <span className="mod-tag">Tri thức &amp; CSKH</span>
                    </div>
                  </div>
                  <div className="sidebar-mod-item">
                    <span className="mod-status-dot ready" />
                    <div className="mod-info">
                      <span className="mod-name">Campaigns Dispatch</span>
                      <span className="mod-tag">Phát tin định kỳ</span>
                    </div>
                  </div>
                  <div className="sidebar-mod-item custom-mod">
                    <span className="mod-status-dot expand" />
                    <div className="mod-info">
                      <span className="mod-name">+ Thêm module</span>
                      <span className="mod-tag">Mở rộng quy trình</span>
                    </div>
                  </div>
                </div>

                <div className="sidebar-footer-note">
                  <span>Một lớp bảo mật &amp; quy tắc dùng chung</span>
                </div>
              </div>

              {/* Center & Right: Orchestration Pipeline Flow */}
              <div className="canvas-orchestration-flow">
                <div className="flow-steps-nav" role="tablist" aria-label="Orchestration Steps">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeStep === 0}
                    className={`step-btn ${activeStep === 0 ? 'active' : ''}`}
                    onClick={() => {
                      setActiveStep(0);
                      setIsPaused(true);
                    }}
                  >
                    <span>1. ĐẦU VÀO ĐA KÊNH</span>
                    {activeStep === 0 && !isPaused && <span className="step-progress-line" />}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeStep === 1}
                    className={`step-btn ${activeStep === 1 ? 'active' : ''}`}
                    onClick={() => {
                      setActiveStep(1);
                      setIsPaused(true);
                    }}
                  >
                    <span>2. AI HIỂU CÓ RÀNG BUỘC</span>
                    {activeStep === 1 && !isPaused && <span className="step-progress-line" />}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeStep === 2}
                    className={`step-btn ${activeStep === 2 ? 'active' : ''}`}
                    onClick={() => {
                      setActiveStep(2);
                      setIsPaused(true);
                    }}
                  >
                    <span>3. RULES QUYẾT ĐỊNH</span>
                    {activeStep === 2 && !isPaused && <span className="step-progress-line" />}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeStep === 3}
                    className={`step-btn ${activeStep === 3 ? 'active' : ''}`}
                    onClick={() => {
                      setActiveStep(3);
                      setIsPaused(true);
                    }}
                  >
                    <span>4. KIỂM SOÁT THỰC THI</span>
                    {activeStep === 3 && !isPaused && <span className="step-progress-line" />}
                  </button>
                </div>

                <div className="flow-canvas-stage">
                  {/* Step 1: Input */}
                  <div
                    className={`flow-node-box ${activeStep === 0 ? 'highlight-box' : ''}`}
                    onClick={() => {
                      setActiveStep(0);
                      setIsPaused(true);
                    }}
                  >
                    <div className="node-top-label">
                      <span className="node-tag input-tag">ĐẦU VÀO HỘI THOẠI</span>
                      <span className="node-source">Zalo cá nhân/nhóm · Kiến trúc mở rộng đa kênh</span>
                    </div>
                    <div className="node-content-sample">
                      “Gửi về Kho HN cho a 20 Felix, áp giá ĐL Cấp 1 nhé”
                    </div>
                  </div>

                  <div className={`flow-connector-line ${activeStep >= 1 ? 'active-path' : ''}`}>
                    <span className="connector-pulse-dot" />
                    <span className="connector-arrow">↓</span>
                  </div>

                  {/* Step 2: AI Extraction */}
                  <div
                    className={`flow-node-box ${activeStep === 1 ? 'highlight-box' : ''}`}
                    onClick={() => {
                      setActiveStep(1);
                      setIsPaused(true);
                    }}
                  >
                    <div className="node-top-label">
                      <span className="node-tag ai-tag">AI TRÍCH XUẤT</span>
                      <span className="node-source">Ép kiểu JSON Schema theo từ điển đóng</span>
                    </div>
                    <div className="node-schema-preview">
                      <span className="schema-pill" style={{ animationDelay: '50ms' }}>Ý định: Đặt hàng</span>
                      <span className="schema-pill" style={{ animationDelay: '100ms' }}>SKU: FLX-01</span>
                      <span className="schema-pill" style={{ animationDelay: '150ms' }}>SL: 20 chiếc</span>
                      <span className="schema-pill" style={{ animationDelay: '200ms' }}>Đối tác: Meta HN</span>
                    </div>
                  </div>

                  <div className={`flow-connector-line ${activeStep >= 2 ? 'active-path' : ''}`}>
                    <span className="connector-pulse-dot" />
                    <span className="connector-arrow">↓</span>
                  </div>

                  {/* Step 3: Rules Evaluation */}
                  <div
                    className={`flow-node-box ${activeStep === 2 ? 'highlight-box' : ''}`}
                    onClick={() => {
                      setActiveStep(2);
                      setIsPaused(true);
                    }}
                  >
                    <div className="node-top-label">
                      <span className="node-tag rules-tag">RULES ENGINE TẤT ĐỊNH</span>
                      <span className="node-source">Logic TypeScript đối soát Nguồn sự thật trong DB</span>
                    </div>
                    <div className="node-rules-checks">
                      <div className="r-check" style={{ animationDelay: '50ms' }}>✓ Bảng giá: Khớp biểu giá ĐL C1 (1.150k)</div>
                      <div className="r-check" style={{ animationDelay: '100ms' }}>✓ Thuế &amp; Chiết khấu: Tính tất định 100%</div>
                      <div className="r-check" style={{ animationDelay: '150ms' }}>✓ Chính sách đối tác: Hạn mức nợ hợp lệ</div>
                      <div className="r-check" style={{ animationDelay: '200ms' }}>✓ Ngưỡng an toàn: Tổng SL ≤ 50 (Đạt tự động)</div>
                    </div>
                  </div>

                  <div className={`flow-connector-line ${activeStep >= 3 ? 'active-path' : ''}`}>
                    <span className="connector-pulse-dot" />
                    <span className="connector-arrow">↓</span>
                  </div>

                  {/* Step 4: Decision Split */}
                  <div className="flow-split-row">
                    <div
                      className={`split-card auto-card ${activeStep === 3 ? 'highlight-box active-branch' : ''}`}
                      onClick={() => {
                        setActiveStep(3);
                        setIsPaused(true);
                      }}
                    >
                      <div className="split-badge auto-badge">TỰ ĐỘNG THỰC THI</div>
                      <div className="split-title">Đơn hợp lệ trong ngưỡng</div>
                      <div className="split-desc">Soạn đơn chuẩn hóa, gửi tin xác nhận nhóm, thông báo Sales nhận việc</div>
                    </div>

                    <div
                      className="split-card review-card"
                      onClick={() => {
                        setActiveStep(3);
                        setIsPaused(true);
                      }}
                    >
                      <div className="split-badge review-badge">CỔNG NHÂN SỰ DUYỆT</div>
                      <div className="split-title">Ngoại lệ / Vượt ngưỡng</div>
                      <div className="split-desc">Định tuyến vào hàng việc Sales duyệt trước khi gửi</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
