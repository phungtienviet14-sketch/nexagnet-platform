'use client';

import { useState } from 'react';
import Link from 'next/link';
import { INDUSTRIES_DATA, type IndustryItem } from '../data/industries';

export function HeroGeneral() {
  const featuredIndustries = INDUSTRIES_DATA.slice(0, 4);
  const [selectedSlug, setSelectedSlug] = useState<string>(featuredIndustries[0]?.slug ?? 'real-estate');

  const activeIndustry: IndustryItem =
    INDUSTRIES_DATA.find((ind) => ind.slug === selectedSlug) ?? INDUSTRIES_DATA[0]!;

  return (
    <section className="hero-section" aria-label="Giới thiệu Nền tảng AI Agent Doanh Nghiệp">
      <div className="container">
        <div className="hero-content">
          {/* Eyebrow badge */}
          <div className="hero-eyebrow-wrap">
            <div className="hero-eyebrow">
              <span className="eyebrow-node" aria-hidden="true" />
              <span className="eyebrow-text">NỀN TẢNG AI AGENT ĐA NGÀNH & ĐA KÊNH</span>
            </div>
          </div>

          {/* Main Headline */}
          <h1 className="hero-headline">
            Tự động hóa tư vấn & vận hành
            <br />
            cho doanh nghiệp đa ngành.
          </h1>

          {/* Subheadline */}
          <p className="hero-subheadline">
            nexagnet là nền tảng AI Agent thế hệ mới, giúp doanh nghiệp tư vấn bán hàng 24/7, thu thập &amp; sàng lọc lead, đối soát quy tắc và tự động hóa quy trình nghiệp vụ trên Zalo, Messenger, Website và Telegram.
          </p>

          {/* Action CTAs */}
          <div className="hero-cta-group">
            <Link href="#demo" className="btn-primary hero-btn-main">
              <span>Đăng ký tư vấn 1-1</span>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M6 3.5L10.5 8L6 12.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>

            <Link href="/solutions" className="btn-secondary hero-btn-sub">
              <span>Xem giải pháp theo ngành</span>
            </Link>
          </div>

          {/* Trust points */}
          <div className="hero-supporting-copy">
            <span className="supporting-icon" aria-hidden="true">✦</span>
            <span>Ràng buộc theo quy tắc doanh nghiệp · Không bịa đặt · Con người kiểm soát</span>
          </div>

          {/* Interactive Multi-Industry Live Simulator */}
          <div className="hero-simulator-wrapper">
            <div className="simulator-header-bar">
              <div className="simulator-tab-title">
                <span className="live-indicator-dot" aria-hidden="true" />
                <span>TRẢI NGHIỆM TRỰC TIẾP THEO NGÀNH:</span>
              </div>
              <div className="simulator-industry-tabs" role="tablist">
                {featuredIndustries.map((ind) => (
                  <button
                    key={ind.slug}
                    type="button"
                    role="tab"
                    aria-selected={selectedSlug === ind.slug}
                    className={`sim-tab-btn ${selectedSlug === ind.slug ? 'active' : ''}`}
                    onClick={() => setSelectedSlug(ind.slug)}
                  >
                    <span className="sim-tab-icon">{ind.icon}</span>
                    <span className="sim-tab-text">{ind.title}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Interactive Showcase Frame */}
            <div className="simulator-frame">
              <div className="sim-window-chrome">
                <div className="chrome-dots">
                  <span className="c-dot red" />
                  <span className="c-dot yellow" />
                  <span className="c-dot green" />
                  <span className="c-channel-name">
                    {activeIndustry.simulatorData.channelName}
                  </span>
                </div>
                <div className="chrome-badges">
                  <span className="engine-badge">AI RAG + Rules Engine</span>
                  <Link href={`/solutions/${activeIndustry.slug}`} className="view-industry-link">
                    Xem chi tiết giải pháp →
                  </Link>
                </div>
              </div>

              <div className="sim-content-split">
                {/* Left Column: Simulated Chat Conversation */}
                <div className="sim-chat-column">
                  <div className="chat-stream-header">
                    <div className="channel-avatar">
                      {activeIndustry.icon}
                    </div>
                    <div className="channel-info">
                      <div className="channel-title">nexagnet AI Assistant ({activeIndustry.title})</div>
                      <div className="channel-status">Đang trực tuyến 24/7 · Phản hồi ngay lập tức</div>
                    </div>
                  </div>

                  <div className="chat-messages-body">
                    {activeIndustry.simulatorData.conversation.map((msg, idx) => (
                      <div key={idx} className={`sim-msg-bubble ${msg.sender}`}>
                        <div className="msg-sender-label">
                          {msg.sender === 'user' ? 'Khách hàng' : 'nexagnet AI'}
                          {msg.time && <span className="msg-time">{msg.time}</span>}
                        </div>
                        <div className="msg-bubble-content">
                          {msg.text.split('\n').map((line, lIdx) => (
                            <p key={lIdx}>{line}</p>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right Column: AI Extraction & Deterministic Rules Inspector */}
                <div className="sim-inspector-column">
                  <div className="inspector-header">
                    <span className="inspector-title">HỆ THỐNG XỬ LÝ DỮ LIỆU THỰC TẾ</span>
                    <span className="inspector-badge">Tất định 100%</span>
                  </div>

                  <div className="inspector-body">
                    {/* Step 1: Intent & Extracted Entities */}
                    <div className="inspect-card intent-card">
                      <div className="card-lbl">1. NHẬN DIỆN Ý ĐỊNH & THÔNG TIN</div>
                      <div className="intent-name">
                        {activeIndustry.simulatorData.conversation[1]?.metadata?.intent ?? 'Tư vấn & Phản hồi'}
                      </div>
                      {activeIndustry.simulatorData.conversation[1]?.metadata?.extracted && (
                        <div className="extracted-fields-grid">
                          {Object.entries(
                            activeIndustry.simulatorData.conversation[1].metadata.extracted
                          ).map(([k, v]) => (
                            <div key={k} className="field-item">
                              <span className="f-key">{k}:</span>
                              <span className="f-val">{v}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Step 2: Business Rules Evaluation */}
                    <div className="inspect-card rules-card">
                      <div className="card-lbl">2. ĐỐI SOÁT QUY TẮC NGHIỆP VỤ</div>
                      <ul className="rules-check-list">
                        {(
                          activeIndustry.simulatorData.conversation[1]?.metadata?.rules ?? [
                            'Đối soát kho tri thức đã kiểm duyệt',
                            'Xác thực tính hợp lệ của dữ liệu',
                          ]
                        ).map((rule, rIdx) => (
                          <li key={rIdx} className="rule-item">
                            <span className="check-icon">✓</span>
                            <span>{rule}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Step 3: Action Execution */}
                    <div className="inspect-card action-card">
                      <div className="card-lbl">3. HÀNH ĐỘNG TỰ ĐỘNG</div>
                      <div className="action-detail">
                        <span className="action-arrow">→</span>
                        <span>
                          {activeIndustry.simulatorData.conversation[1]?.metadata?.action ??
                            'Gửi phản hồi chuẩn xác kèm đề xuất chuyển đổi'}
                        </span>
                      </div>
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
