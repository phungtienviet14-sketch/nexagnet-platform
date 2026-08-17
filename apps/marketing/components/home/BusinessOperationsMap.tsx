'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  IconSales,
  IconMarketing,
  IconCSKH,
  IconOperations,
  IconFinance,
  IconHR,
  IconAIProcessor,
  IconKnowledgeTruth,
  IconRulesEngine,
  IconHumanGate,
} from '@/components/shared/EnterpriseIcons';

interface WorkflowTrack {
  id: string;
  name: string;
  category: string;
  trigger: string;
  inputSample: string;
  extractedData: { label: string; val: string }[];
  ruleCheck: { rule: string; pass: boolean; note: string };
  actionResult: { label: string; status: 'auto' | 'escalate'; target: string; desc: string };
}

const WORKFLOW_TRACKS: WorkflowTrack[] = [
  {
    id: 'flow-commercial',
    name: 'Đơn Bán hàng & Phân phối',
    category: 'Sales & Distribution',
    trigger: 'Tin nhắn đặt hàng Zalo (viết tắt)',
    inputSample: '"HN_30.6_Meta HN, 10 x Ghế Felix — 1.150k, giao về Ocean Park c nhé"',
    extractedData: [
      { label: 'Đại lý', val: 'Meta HN (Cấp 1)' },
      { label: 'Mặt hàng', val: '10 × Ghế Felix' },
      { label: 'Đơn giá', val: '1.150.000 đ' },
      { label: 'Giao hàng', val: 'Ocean Park, HN' },
    ],
    ruleCheck: {
      rule: 'Đối soát Bảng giá Đại lý Cấp 1 & Hạn mức Công nợ (≤ 150tr)',
      pass: true,
      note: 'Khớp 100% chính sách · Công nợ hiện tại: 42tr / 150tr',
    },
    actionResult: {
      label: 'Tự động gửi xác nhận & Tạo việc Kế toán / Kho',
      status: 'auto',
      target: 'Vận hành + Kế toán',
      desc: 'Tự động xác nhận trong nhóm Zalo đại lý; tạo hàng việc đối soát xuất kho.',
    },
  },
  {
    id: 'flow-support',
    name: 'Khiếu nại & Đổi trả Hàng',
    category: 'Customer Escalation',
    trigger: 'Yêu cầu hỗ trợ bảo hành quá hạn',
    inputSample: '"Khách bên mình mua máy AP-02 được 45 ngày báo lỗi nguồn, xin đổi mới"',
    extractedData: [
      { label: 'Khách hàng', val: 'Đại lý Thái Nguyên' },
      { label: 'Thiết bị', val: 'Máy lọc AP-02' },
      { label: 'Thời gian', val: '45 ngày (Chuẩn: 30 ngày)' },
      { label: 'Vấn đề', val: 'Nguồn điện chập chờn' },
    ],
    ruleCheck: {
      rule: 'Kiểm tra Chính sách Đổi trả Tiêu chuẩn (Ngưỡng 30 ngày)',
      pass: false,
      note: 'Vượt hạn mức tự động 30 ngày → Kích hoạt Cổng duyệt Ngoại lệ',
    },
    actionResult: {
      label: 'Gom hồ sơ & Chuyển Quản lý CSKH phê duyệt',
      status: 'escalate',
      target: 'Cổng duyệt Quản lý CSKH',
      desc: 'Hồ sơ bảo hành kèm video lỗi được chuyển thẳng tới Trưởng bộ phận xử lý.',
    },
  },
  {
    id: 'flow-internal',
    name: 'Đề xuất & Phê duyệt Nội bộ',
    category: 'Internal Operations',
    trigger: 'Phiếu đề xuất chiết khấu đặc biệt',
    inputSample: '"Đề xuất giảm thêm 3% cho dự án Trường Quốc tế liên cấp (tổng 120 bộ)"',
    extractedData: [
      { label: 'Người gửi', val: 'Sales Lead Miền Bắc' },
      { label: 'Quy mô', val: '120 bộ thiết bị' },
      { label: 'Đề xuất', val: 'Thêm 3% chiết khấu dự án' },
      { label: 'Dự án', val: 'Trường Quốc tế VN' },
    ],
    ruleCheck: {
      rule: 'Quy chế Thẩm quyền Phê duyệt Chiết khấu Dự án lớn',
      pass: false,
      note: 'Chiết khấu vượt khung phòng Sales → Chuyển Ban Giám đốc',
    },
    actionResult: {
      label: 'Chuyển Ban Giám đốc ký duyệt 1-click',
      status: 'escalate',
      target: 'Ban Giám đốc (CEO)',
      desc: 'Thông báo kèm biên bản thẩm định giá được gửi trực tiếp tới CEO xem xét.',
    },
  },
];

const DEPARTMENTS = [
  {
    id: 'sales',
    name: 'Sales',
    label: 'Bán hàng',
    Icon: IconSales,
    color: '#0284C7',
    href: '/departments/sales',
    role: 'Tiếp nhận lead, tra giá, bóc tách đơn',
    badge: '12 active',
  },
  {
    id: 'marketing',
    name: 'Marketing',
    label: 'Tiếp thị',
    Icon: IconMarketing,
    color: '#7C3AED',
    href: '/departments/marketing',
    role: 'Phân loại lead, điều phối chiến dịch',
    badge: '2 campaigns',
  },
  {
    id: 'cs',
    name: 'CSKH',
    label: 'Chăm sóc KH',
    Icon: IconCSKH,
    color: '#10B981',
    href: '/departments/customer-service',
    role: 'Giải đáp 24/7, chuyển ngoại lệ',
    badge: '38 handled · 4 esc',
  },
  {
    id: 'operations',
    name: 'Operations',
    label: 'Vận hành',
    Icon: IconOperations,
    color: '#F59E0B',
    href: '/departments/operations',
    role: 'Phân luồng tác vụ, kiểm tra điều kiện',
    badge: '7 pending',
  },
  {
    id: 'finance',
    name: 'Finance',
    label: 'Tài chính - KT',
    Icon: IconFinance,
    color: '#EC4899',
    href: '/departments/finance',
    role: 'Chuẩn hóa số liệu, chờ duyệt thanh toán',
    badge: '3 approval',
  },
  {
    id: 'hr',
    name: 'HR',
    label: 'Nhân sự',
    Icon: IconHR,
    color: '#6366F1',
    href: '/departments/hr',
    role: 'Cẩm nang quy chế, tiếp nhận đề xuất',
    badge: '5 requests',
  },
];

export function BusinessOperationsMap() {
  const [activeTrackId, setActiveTrackId] = useState<string>('flow-commercial');
  const [activeStep, setActiveStep] = useState<number>(0);
  const currentTrack = WORKFLOW_TRACKS.find((t) => t.id === activeTrackId) ?? WORKFLOW_TRACKS[0]!;

  return (
    <div className="business-ops-map-root animate-hero-visual" aria-label="Mô hình Vận hành Doanh nghiệp Nexagnet">
      {/* Top Cockpit Header */}
      <div className="ops-map-chrome">
        <div className="chrome-left">
          <div className="window-dots" aria-hidden="true">
            <span className="dot dot-red" />
            <span className="dot dot-yellow" />
            <span className="dot dot-green" />
          </div>
          <span className="chrome-title-text">
            <span className="mono-label">ARCHITECTURE</span>
            <span className="divider chrome-subtitle-desktop">/</span>
            <span className="chrome-subtitle-desktop">Enterprise AI Operations Pipeline</span>
          </span>
        </div>
        <div className="chrome-telemetry">
          <span className="status-live-dot" />
          <span className="mono-telemetry mono-telemetry-desktop">LAYER ACTIVE · DETERMINISTIC RULES 100%</span>
          <span className="mono-telemetry mono-telemetry-mobile">100% RULES</span>
        </div>
      </div>

      {/* Main Orchestration Canvas */}
      <div className="ops-map-body">
        {/* Department Nodes Orbit Header */}
        <div className="ops-departments-orbit">
          <div className="orbit-section-header">
            <span className="orbit-eyebrow">CÁC PHÒNG BAN KẾT NỐI (CONNECTED DEPARTMENTS)</span>
            <span className="orbit-sub">Luân chuyển dữ liệu không đứt gãy</span>
          </div>
          <div className="orbit-grid">
            {DEPARTMENTS.map((dept) => {
              const { Icon } = dept;
              return (
                <Link
                  key={dept.id}
                  href={dept.href}
                  className="dept-orbit-card"
                  style={{ '--dept-theme': dept.color } as React.CSSProperties}
                >
                  <div className="dept-card-top">
                    <div className="dept-icon-wrapper">
                      <Icon size={18} color="currentColor" />
                    </div>
                    <span className="dept-code">{dept.name}</span>
                  </div>
                  <div className="dept-name">{dept.label}</div>
                  <div className="dept-role">{dept.role}</div>
                  <div className="dept-status-indicator">
                    <span className="tiny-pulse" />
                    <span>{dept.badge}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Central Operations Architecture Core */}
        <div className="ops-central-pipeline">
          <div className="pipeline-track-header">
            <div className="track-scenario-picker">
              <span className="picker-label">Kịch bản minh họa luồng:</span>
              <div className="scenario-buttons">
                {WORKFLOW_TRACKS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`scenario-btn ${activeTrackId === t.id ? 'active' : ''}`}
                    onClick={() => {
                      setActiveTrackId(t.id);
                      setActiveStep(0);
                    }}
                  >
                    <span className="btn-bullet" aria-hidden="true" />
                    <span>{t.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 4-Stage Operational Engine Pipeline */}
          <div className="pipeline-stages-container">
            {/* Stage 1: Ingest & Parse */}
            <div className={`pipeline-stage-card ${activeStep === 0 ? 'stage-active' : ''}`} onClick={() => setActiveStep(0)}>
              <div className="stage-header">
                <span className="stage-step-tag">GIAI ĐOẠN 01</span>
                <span className="stage-tech-tag">AI UNDERSTANDING</span>
              </div>
              <div className="stage-icon-row">
                <div className="stage-icon-box">
                  <IconAIProcessor size={22} color="var(--brand-accent)" />
                </div>
                <div>
                  <h4 className="stage-title">Đọc hiểu &amp; Bóc tách</h4>
                  <span className="stage-subtitle">Tiếp nhận tin nhắn tự nhiên</span>
                </div>
              </div>
              <div className="stage-raw-input">
                <span className="input-tag">Đầu vào:</span>
                <p className="raw-msg-text">{currentTrack.inputSample}</p>
              </div>
              <div className="stage-structured-output">
                <span className="output-tag">Dữ liệu trích xuất:</span>
                <div className="data-pills-wrap">
                  {currentTrack.extractedData.map((d, i) => (
                    <span key={i} className="data-pill">
                      <strong>{d.label}:</strong> {d.val}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Connector Arrow */}
            <div className="pipeline-connector-node" aria-hidden="true">
              <span className="flow-line" />
              <span className="flow-arrow">→</span>
            </div>

            {/* Stage 2: Deterministic Rules Engine */}
            <div className={`pipeline-stage-card ${activeStep === 1 ? 'stage-active' : ''}`} onClick={() => setActiveStep(1)}>
              <div className="stage-header">
                <span className="stage-step-tag">GIAI ĐOẠN 02</span>
                <span className="stage-tech-tag">RULES ENGINE</span>
              </div>
              <div className="stage-icon-row">
                <div className="stage-icon-box">
                  <IconRulesEngine size={22} color="var(--brand-accent)" />
                </div>
                <div>
                  <h4 className="stage-title">Quy tắc Tất định</h4>
                  <span className="stage-subtitle">Đối soát Nguồn sự thật</span>
                </div>
              </div>
              <div className="rule-validation-box">
                <div className="rule-name-row">
                  <IconKnowledgeTruth size={16} />
                  <span>{currentTrack.ruleCheck.rule}</span>
                </div>
                <div className={`rule-result-pill ${currentTrack.ruleCheck.pass ? 'pass' : 'alert'}`}>
                  <span className="result-dot" />
                  <span>{currentTrack.ruleCheck.note}</span>
                </div>
              </div>
            </div>

            {/* Connector Arrow */}
            <div className="pipeline-connector-node" aria-hidden="true">
              <span className="flow-line" />
              <span className="flow-arrow">→</span>
            </div>

            {/* Stage 3: Human Gate / Automated Action */}
            <div className={`pipeline-stage-card ${activeStep === 2 ? 'stage-active' : ''}`} onClick={() => setActiveStep(2)}>
              <div className="stage-header">
                <span className="stage-step-tag">GIAI ĐOẠN 03</span>
                <span className="stage-tech-tag">HUMAN-IN-THE-LOOP</span>
              </div>
              <div className="stage-icon-row">
                <div className="stage-icon-box">
                  <IconHumanGate size={22} color={currentTrack.actionResult.status === 'auto' ? '#10B981' : '#F59E0B'} />
                </div>
                <div>
                  <h4 className="stage-title">Điều phối &amp; Kiểm soát</h4>
                  <span className="stage-subtitle">Tự động hoặc chuyển ngoại lệ</span>
                </div>
              </div>
              <div className={`action-dispatch-box status-${currentTrack.actionResult.status}`}>
                <div className="dispatch-header">
                  <span className="dispatch-badge">
                    {currentTrack.actionResult.status === 'auto' ? '✓ TỰ ĐỘNG XỬ LÝ' : '⚠️ NGOẠI LỆ CẦN DUYỆT'}
                  </span>
                  <span className="dispatch-target">{currentTrack.actionResult.target}</span>
                </div>
                <p className="dispatch-desc">{currentTrack.actionResult.desc}</p>
              </div>
            </div>
          </div>

          {/* Engine Footer Truth Guarantee */}
          <div className="pipeline-footer-bar">
            <div className="truth-point">
              <span className="truth-dot" />
              <span><strong>AI hiểu ngữ cảnh:</strong> Trích xuất chuẩn xác ngôn ngữ chat tự nhiên, viết tắt, không dấu.</span>
            </div>
            <div className="truth-point">
              <span className="truth-dot" />
              <span><strong>Rules quyết định:</strong> Tiền, thuế, hạn mức do thuật toán tất định tính toán, không để AI suy đoán.</span>
            </div>
            <div className="truth-point">
              <span className="truth-dot" />
              <span><strong>Con người kiểm soát:</strong> Ngoại lệ có người duyệt, lưu vết kiểm toán 100%.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
