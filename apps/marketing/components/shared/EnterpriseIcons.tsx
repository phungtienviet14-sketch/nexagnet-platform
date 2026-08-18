import React from 'react';

export interface IconProps {
  className?: string;
  size?: number;
  color?: string;
  strokeWidth?: number;
  'aria-hidden'?: boolean | 'true' | 'false';
}

/* ========================================================================= */
/* 1. DEPARTMENT ICONS (7 Core Functions)                                    */
/* ========================================================================= */

/** Executive / Ban Giám đốc: Command Center / Leadership Pillars */
export function IconExecutive({ className = '', size = 20, color = 'currentColor', strokeWidth = 1.75, 'aria-hidden': ariaHidden = true }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden={ariaHidden}>
      <path d="M3 21h18" />
      <path d="M5 21V7l7-4 7 4v14" />
      <path d="M9 10h1" />
      <path d="M9 14h1" />
      <path d="M14 10h1" />
      <path d="M14 14h1" />
    </svg>
  );
}

/** Sales / Phòng Bán hàng: Commercial Pipeline / Order Intake */
export function IconSales({ className = '', size = 20, color = 'currentColor', strokeWidth = 1.75, 'aria-hidden': ariaHidden = true }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden={ariaHidden}>
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  );
}

/** Marketing / Phòng Tiếp thị: Controlled Broadcast / Audience Reach */
export function IconMarketing({ className = '', size = 20, color = 'currentColor', strokeWidth = 1.75, 'aria-hidden': ariaHidden = true }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden={ariaHidden}>
      <path d="m3 11 18-5v12L3 13v-2z" />
      <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
    </svg>
  );
}

/** Customer Service / Chăm sóc Khách hàng: Structured Triage & Routing */
export function IconCSKH({ className = '', size = 20, color = 'currentColor', strokeWidth = 1.75, 'aria-hidden': ariaHidden = true }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden={ariaHidden}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <path d="M8 10h.01" />
      <path d="M12 10h.01" />
      <path d="M16 10h.01" />
    </svg>
  );
}

/** Operations / Phòng Vận hành: Process Orchestration & Node Routing */
export function IconOperations({ className = '', size = 20, color = 'currentColor', strokeWidth = 1.75, 'aria-hidden': ariaHidden = true }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden={ariaHidden}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

/** Finance & Accounting / Tài chính - Kế toán: Reconciliation & Ledger */
export function IconFinance({ className = '', size = 20, color = 'currentColor', strokeWidth = 1.75, 'aria-hidden': ariaHidden = true }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden={ariaHidden}>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <line x1="2" y1="10" x2="22" y2="10" />
      <path d="M6 15h2" />
      <path d="M14 15h4" />
    </svg>
  );
}

/** Human Resources / Nhân sự & Nội bộ: Organization & Employee Requests */
export function IconHR({ className = '', size = 20, color = 'currentColor', strokeWidth = 1.75, 'aria-hidden': ariaHidden = true }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden={ariaHidden}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

/* ========================================================================= */
/* 2. CORE ARCHITECTURAL SYMBOLS (Nexagnet Visual Vocabulary)                */
/* ========================================================================= */

/** AI Understanding / Trích xuất ràng buộc: Constrained Schema Mesh */
export function IconAIUnderstanding({ className = '', size = 20, color = 'currentColor', strokeWidth = 1.75, 'aria-hidden': ariaHidden = true }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden={ariaHidden}>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="9" cy="9" r="1.5" fill={color} />
      <circle cx="15" cy="9" r="1.5" fill={color} />
      <circle cx="9" cy="15" r="1.5" fill={color} />
      <circle cx="15" cy="15" r="1.5" fill={color} />
      <path d="M9 9h6v6H9z" strokeDasharray="2 2" />
      <path d="M9 1v2M15 1v2M9 21v2M15 21v2M1 9h2M1 15h2M21 9h2M21 15h2" />
    </svg>
  );
}
export const IconAIProcessor = IconAIUnderstanding;

/** Rules Engine / Quy tắc tất định: Deterministic Balance Scale */
export function IconRulesEngine({ className = '', size = 20, color = 'currentColor', strokeWidth = 1.75, 'aria-hidden': ariaHidden = true }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden={ariaHidden}>
      <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
      <path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
      <path d="M7 21h10" />
      <path d="M12 3v18" />
      <path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2" />
    </svg>
  );
}

/** Source of Truth / Nguồn sự thật: Master Data Store */
export function IconKnowledgeTruth({ className = '', size = 20, color = 'currentColor', strokeWidth = 1.75, 'aria-hidden': ariaHidden = true }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden={ariaHidden}>
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  );
}

/** Human Gate / Cổng duyệt nhân sự: Verification Shield Gate */
export function IconHumanGate({ className = '', size = 20, color = 'currentColor', strokeWidth = 1.75, 'aria-hidden': ariaHidden = true }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden={ariaHidden}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}
export const IconHumanReview = IconHumanGate;
export const IconControlRules = IconHumanGate;
export const IconControlGovernance = IconHumanGate;

/** Workflow Nodes / Luồng quy trình: Sequential Pipeline */
export function IconWorkflowNodes({ className = '', size = 20, color = 'currentColor', strokeWidth = 1.75, 'aria-hidden': ariaHidden = true }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden={ariaHidden}>
      <rect x="2" y="3" width="6" height="6" rx="1.5" />
      <rect x="16" y="3" width="6" height="6" rx="1.5" />
      <rect x="9" y="15" width="6" height="6" rx="1.5" />
      <path d="M5 9v3a2 2 0 0 0 2 2h2" />
      <path d="M19 9v3a2 2 0 0 1-2 2h-2" />
      <path d="M12 12v3" />
    </svg>
  );
}

/** Audit Trail / Nhật ký kiểm toán: Immutable Transaction Log */
export function IconAuditTrail({ className = '', size = 20, color = 'currentColor', strokeWidth = 1.75, 'aria-hidden': ariaHidden = true }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden={ariaHidden}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="13" y2="17" />
      <circle cx="17" cy="17" r="1.5" fill={color} />
    </svg>
  );
}

/** Kill Switch / Dừng khẩn cấp: Circuit Breaker Switch */
export function IconKillSwitch({ className = '', size = 20, color = 'currentColor', strokeWidth = 1.75, 'aria-hidden': ariaHidden = true }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden={ariaHidden}>
      <circle cx="12" cy="12" r="10" />
      <rect x="9" y="9" width="6" height="6" rx="1" />
    </svg>
  );
}

/** Queue Pacing / Hàng đợi giãn cách an toàn: Controlled Rate Limiter */
export function IconQueuePacing({ className = '', size = 20, color = 'currentColor', strokeWidth = 1.75, 'aria-hidden': ariaHidden = true }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden={ariaHidden}>
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15 15" />
      <path d="M12 3a9 9 0 0 1 9 9" strokeDasharray="2 2" />
    </svg>
  );
}

/** Realtime Metrics / Đo lường vận hành: Telemetry Bars */
export function IconRealtimeMetrics({ className = '', size = 20, color = 'currentColor', strokeWidth = 1.75, 'aria-hidden': ariaHidden = true }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden={ariaHidden}>
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
      <line x1="2" y1="20" x2="22" y2="20" />
    </svg>
  );
}

/** Data Security / Bảo vệ Dữ liệu: Privacy Encryption Lock */
export function IconDataSecurity({ className = '', size = 20, color = 'currentColor', strokeWidth = 1.75, 'aria-hidden': ariaHidden = true }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden={ariaHidden}>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      <circle cx="12" cy="16" r="1.5" fill={color} />
    </svg>
  );
}

/* ========================================================================= */
/* 3. PRODUCT & PLATFORM MODULE ICONS                                        */
/* ========================================================================= */

/** Order Automation / Xử lý đơn hàng: Structured Order Flow */
export function IconOrderAutomation({ className = '', size = 20, color = 'currentColor', strokeWidth = 1.75, 'aria-hidden': ariaHidden = true }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden={ariaHidden}>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
      <path d="M7 8h10M7 12h6" />
    </svg>
  );
}

/** Campaigns Orchestration / Chiến dịch: Scheduled Distribution Pulse */
export function IconCampaign({ className = '', size = 20, color = 'currentColor', strokeWidth = 1.75, 'aria-hidden': ariaHidden = true }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden={ariaHidden}>
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  );
}

/** Architecture Layers / Kiến trúc 3 tầng: Multi-layer Stack */
export function IconArchitectureLayers({ className = '', size = 20, color = 'currentColor', strokeWidth = 1.75, 'aria-hidden': ariaHidden = true }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden={ariaHidden}>
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  );
}

/** Integrations Hub / Hạ tầng kết nối: Unified Connector Bus */
export function IconIntegrationsHub({ className = '', size = 20, color = 'currentColor', strokeWidth = 1.75, 'aria-hidden': ariaHidden = true }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden={ariaHidden}>
      <circle cx="18" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <path d="M13 6h3a2 2 0 0 1 2 2v7" />
      <line x1="6" y1="9" x2="6" y2="21" />
      <circle cx="6" cy="18" r="1.5" fill={color} />
    </svg>
  );
}

/* ========================================================================= */
/* 4. INDUSTRY ICONS (12 Distinct Operational Geometries)                    */
/* ========================================================================= */

/** Retail & Distribution / Bán lẻ & Phân phối: B2B SKU Matrix */
export function IconRetail({ className = '', size = 20, color = 'currentColor', strokeWidth = 1.75, 'aria-hidden': ariaHidden = true }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden={ariaHidden}>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );
}

/** Spa & Beauty / Spa & Thẩm mỹ: Treatment Slot & Therapist Routing */
export function IconSpa({ className = '', size = 20, color = 'currentColor', strokeWidth = 1.75, 'aria-hidden': ariaHidden = true }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden={ariaHidden}>
      <path d="M12 2a9 9 0 0 0-9 9c0 4.97 4.03 9 9 9s9-4.03 9-9a9 9 0 0 0-9-9Z" />
      <path d="M12 6v12" />
      <path d="M8 10c2 2 6 2 8 0" />
      <path d="M8 14c2 2 6 2 8 0" />
    </svg>
  );
}

/** Real Estate / Bất động sản: Inventory Unit & Commission Locking */
export function IconRealEstate({ className = '', size = 20, color = 'currentColor', strokeWidth = 1.75, 'aria-hidden': ariaHidden = true }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden={ariaHidden}>
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <path d="M9 22v-4h6v4" />
      <path d="M8 6h.01M16 6h.01M8 10h.01M16 10h.01M8 14h.01M16 14h.01" />
    </svg>
  );
}

/** Education & Admissions / Giáo dục & Tuyển sinh: Admission Pipeline & Program */
export function IconEducation({ className = '', size = 20, color = 'currentColor', strokeWidth = 1.75, 'aria-hidden': ariaHidden = true }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden={ariaHidden}>
      <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
      <path d="M6 12v5c3 3 9 3 12 0v-5" />
    </svg>
  );
}

/** Hospitality / Khách sạn & Nghỉ dưỡng: Guest Request & Room Triage */
export function IconHospitality({ className = '', size = 20, color = 'currentColor', strokeWidth = 1.75, 'aria-hidden': ariaHidden = true }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden={ariaHidden}>
      <path d="M18 8a6 6 0 0 0-12 0c0 7 6 13 6 13s6-6 6-13Z" />
      <circle cx="12" cy="8" r="2" />
    </svg>
  );
}

/** Healthcare & Clinic / Y tế & Phòng khám: Doctor Specialty & Patient Triage */
export function IconHealthcare({ className = '', size = 20, color = 'currentColor', strokeWidth = 1.75, 'aria-hidden': ariaHidden = true }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden={ariaHidden}>
      <path d="M19 14v1a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-1" />
      <path d="M12 2v6" />
      <path d="M9 5h6" />
      <rect width="18" height="12" x="3" y="10" rx="2" />
      <path d="M12 14v4" />
      <path d="M10 16h4" />
    </svg>
  );
}

/** Manufacturing / Sản xuất & Gia công: Material BOM & Work Order */
export function IconManufacturing({ className = '', size = 20, color = 'currentColor', strokeWidth = 1.75, 'aria-hidden': ariaHidden = true }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden={ariaHidden}>
      <path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
      <path d="M17 18h1" />
      <path d="M12 18h1" />
      <path d="M7 18h1" />
    </svg>
  );
}

/** Logistics & Freight / Vận tải & Kho bãi: Waybill OCR & Route Pacing */
export function IconLogistics({ className = '', size = 20, color = 'currentColor', strokeWidth = 1.75, 'aria-hidden': ariaHidden = true }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden={ariaHidden}>
      <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
      <path d="M15 18H9" />
      <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14v10Z" />
      <circle cx="17" cy="18" r="2" />
      <circle cx="7" cy="18" r="2" />
    </svg>
  );
}

/** Financial Services / Tài chính & Bảo hiểm: Underwriting & Credit Limits */
export function IconFinancialServices({ className = '', size = 20, color = 'currentColor', strokeWidth = 1.75, 'aria-hidden': ariaHidden = true }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden={ariaHidden}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M12 8v8" />
      <path d="M9.5 10.5A2.5 2.5 0 0 1 12 8a2.5 2.5 0 0 1 2.5 2.5c0 1.5-1.5 2-2.5 2.5s-2.5 1-2.5 2.5A2.5 2.5 0 0 0 12 18a2.5 2.5 0 0 0 2.5-2.5" />
    </svg>
  );
}

/** Construction & Interior / Xây dựng & Nội thất: BOQ Spec & Material Gate */
export function IconConstruction({ className = '', size = 20, color = 'currentColor', strokeWidth = 1.75, 'aria-hidden': ariaHidden = true }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden={ariaHidden}>
      <path d="m2 22 1-1h18l1 1" />
      <path d="M14 18v-4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v4" />
      <path d="M18 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12" />
      <path d="M22 6h-4" />
      <path d="M6 18v-8" />
      <path d="M10 18v-8" />
    </svg>
  );
}

/** F&B Chains & Franchise / Chuỗi F&B: Central Kitchen & Table Dispatch */
export function IconFnB({ className = '', size = 20, color = 'currentColor', strokeWidth = 1.75, 'aria-hidden': ariaHidden = true }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden={ariaHidden}>
      <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
      <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
      <line x1="6" y1="1" x2="6" y2="4" />
      <line x1="10" y1="1" x2="10" y2="4" />
      <line x1="14" y1="1" x2="14" y2="4" />
    </svg>
  );
}

/** Professional Services / Luật & Tư vấn: Rate Card & Timesheet Audit */
export function IconProfessionalServices({ className = '', size = 20, color = 'currentColor', strokeWidth = 1.75, 'aria-hidden': ariaHidden = true }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden={ariaHidden}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

/* ========================================================================= */
/* 5. UTILITY & GENERAL SEMANTIC ICONS                                       */
/* ========================================================================= */

export function IconDocument({ className = '', size = 20, color = 'currentColor', strokeWidth = 1.75, 'aria-hidden': ariaHidden = true }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden={ariaHidden}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

export function IconDatabase({ className = '', size = 20, color = 'currentColor', strokeWidth = 1.75, 'aria-hidden': ariaHidden = true }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden={ariaHidden}>
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  );
}

export function IconSearch({ className = '', size = 20, color = 'currentColor', strokeWidth = 1.75, 'aria-hidden': ariaHidden = true }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden={ariaHidden}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

export function IconClock({ className = '', size = 20, color = 'currentColor', strokeWidth = 1.75, 'aria-hidden': ariaHidden = true }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden={ariaHidden}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

export function IconCheckCircle({ className = '', size = 20, color = 'currentColor', strokeWidth = 1.75, 'aria-hidden': ariaHidden = true }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden={ariaHidden}>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

export function IconAlert({ className = '', size = 20, color = 'currentColor', strokeWidth = 1.75, 'aria-hidden': ariaHidden = true }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden={ariaHidden}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

export function IconZap({ className = '', size = 20, color = 'currentColor', strokeWidth = 1.75, 'aria-hidden': ariaHidden = true }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden={ariaHidden}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

export function IconTag({ className = '', size = 20, color = 'currentColor', strokeWidth = 1.75, 'aria-hidden': ariaHidden = true }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden={ariaHidden}>
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  );
}

export function IconRefresh({ className = '', size = 20, color = 'currentColor', strokeWidth = 1.75, 'aria-hidden': ariaHidden = true }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden={ariaHidden}>
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

export function IconSettings({ className = '', size = 20, color = 'currentColor', strokeWidth = 1.75, 'aria-hidden': ariaHidden = true }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden={ariaHidden}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

export function IconMessageSquare({ className = '', size = 20, color = 'currentColor', strokeWidth = 1.75, 'aria-hidden': ariaHidden = true }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden={ariaHidden}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

/* ========================================================================= */
/* 6. SMART ICON RESOLVER (NexagnetIcon Component)                           */
/* ========================================================================= */

export interface NexagnetIconProps {
  name: string;
  size?: number;
  color?: string;
  strokeWidth?: number;
  className?: string;
  containerStyle?: 'naked' | 'subtle' | 'line' | 'badge' | 'accent';
  'aria-hidden'?: boolean | 'true' | 'false';
}

/**
 * NexagnetIcon maps semantic identifiers or legacy emojis to clean geometric SVG icons.
 */
export function NexagnetIcon({
  name,
  size = 20,
  color = 'currentColor',
  strokeWidth = 1.75,
  className = '',
  containerStyle = 'naked',
  'aria-hidden': ariaHidden = true,
}: NexagnetIconProps) {
  const normalized = (name || '').toLowerCase().trim();

  let IconComponent: React.ComponentType<IconProps> = IconWorkflowNodes;

  switch (normalized) {
    // Departments
    case 'sales':
    case '⚡':
    case '🤝':
    case 'pipeline':
    case 'deal':
      IconComponent = IconSales;
      break;
    case 'marketing':
    case '📢':
    case '🎯':
    case 'broadcast':
    case 'reach':
      IconComponent = IconMarketing;
      break;
    case 'customer-service':
    case 'cskh':
    case '💬':
    case 'support':
    case 'chat':
      IconComponent = IconCSKH;
      break;
    case 'operations':
    case '⚙️':
    case 'workflow':
    case 'nodes':
    case 'routing':
      IconComponent = IconOperations;
      break;
    case 'finance':
    case '💳':
    case '🧾':
    case 'ledger':
    case 'vat':
    case 'reconciliation':
      IconComponent = IconFinance;
      break;
    case 'hr':
    case '👥':
    case '📖':
    case '📝':
    case 'policy':
    case 'employee':
      IconComponent = IconHR;
      break;
    case 'executive':
    case '🏛️':
    case 'overview':
    case 'command':
      IconComponent = IconExecutive;
      break;

    // Architectural Core
    case 'ai':
    case 'ai-understanding':
    case '🧠':
    case 'robot':
    case '🤖':
    case 'extract':
      IconComponent = IconAIUnderstanding;
      break;
    case 'rules':
    case 'rules-engine':
    case '⚖️':
    case 'balance':
    case 'deterministic':
      IconComponent = IconRulesEngine;
      break;
    case 'knowledge':
    case 'source-of-truth':
    case '🗄️':
    case 'database':
    case 'truth':
      IconComponent = IconKnowledgeTruth;
      break;
    case 'governance':
    case 'control':
    case 'shield':
    case '🛡️':
    case 'security':
    case '🔒':
    case 'gate':
      IconComponent = IconHumanGate;
      break;
    case 'audit':
    case 'audit-trail':
    case '📋':
    case 'log':
    case 'trace':
      IconComponent = IconAuditTrail;
      break;
    case 'kill-switch':
    case '🛑':
    case 'stop':
    case 'emergency':
      IconComponent = IconKillSwitch;
      break;
    case 'queue':
    case 'pacing':
    case '⏳':
    case 'time':
    case '⏰':
    case 'clock':
      IconComponent = IconQueuePacing;
      break;
    case 'metrics':
    case 'telemetry':
    case '📊':
    case 'analytics':
    case 'chart':
      IconComponent = IconRealtimeMetrics;
      break;
    case 'integration':
    case 'connect':
    case 'bus':
    case 'adapter':
    case '🏢':
    case 'erp':
      IconComponent = IconIntegrationsHub;
      break;
    case 'layers':
    case 'stack':
    case 'architecture':
      IconComponent = IconArchitectureLayers;
      break;
    case 'campaign':
    case 'dispatch':
    case 'pulse':
      IconComponent = IconCampaign;
      break;

    // Industries
    case 'retail':
    case 'retail-distribution':
    case '📦':
    case 'b2b':
    case 'sku':
      IconComponent = IconRetail;
      break;
    case 'spa':
    case 'spa-beauty':
    case '🌸':
    case '✨':
    case 'beauty':
    case 'clinic-spa':
      IconComponent = IconSpa;
      break;
    case 'real-estate':
    case 'apartment':
    case 'unit':
    case 'property':
      IconComponent = IconRealEstate;
      break;
    case 'education':
    case 'school':
    case '🎓':
    case 'admission':
      IconComponent = IconEducation;
      break;
    case 'hospitality':
    case 'hotel':
    case 'resort':
    case '🛎️':
    case 'concierge':
      IconComponent = IconHospitality;
      break;
    case 'healthcare':
    case 'healthcare-clinic':
    case 'doctor':
    case '🩺':
    case 'medical':
      IconComponent = IconHealthcare;
      break;
    case 'manufacturing':
    case 'factory':
    case '🏭':
    case 'bom':
    case 'work-order':
      IconComponent = IconManufacturing;
      break;
    case 'logistics':
    case 'freight':
    case 'truck':
    case '🚚':
    case 'waybill':
    case 'pod':
      IconComponent = IconLogistics;
      break;
    case 'financial-services':
    case 'credit':
    case 'claim':
    case 'underwriting':
      IconComponent = IconFinancialServices;
      break;
    case 'construction':
    case 'construction-interior':
    case 'boq':
    case '🏗️':
    case 'interior':
    case '📐':
    case '🚧':
      IconComponent = IconConstruction;
      break;
    case 'fnb':
    case 'fnb-chains':
    case 'restaurant':
    case '🍽️':
    case 'kitchen':
    case '🍲':
      IconComponent = IconFnB;
      break;
    case 'professional-services':
    case 'legal':
    case 'consulting':
    case 'timesheet':
    case 'rate-card':
      IconComponent = IconProfessionalServices;
      break;

    // Utilities
    case 'search':
    case '🔍':
    case 'lookup':
    case 'rag':
      IconComponent = IconSearch;
      break;
    case 'document':
    case 'doc':
    case 'file':
    case 'contract':
    case '📑':
    case '🗂️':
      IconComponent = IconDocument;
      break;
    case 'check':
    case 'check-circle':
    case 'valid':
    case 'verified':
      IconComponent = IconCheckCircle;
      break;
    case 'alert':
    case 'warning':
    case 'exception':
    case '⚠️':
    case '🚦':
      IconComponent = IconAlert;
      break;
    case 'fast':
    case 'instant':
    case 'speed':
    case '🚀':
      IconComponent = IconZap;
      break;
    case 'sync':
    case 'refresh':
    case 'reload':
    case '🔄':
      IconComponent = IconRefresh;
      break;
    case 'settings':
    case 'tool':
    case 'tools':
    case '🛠️':
    case 'config':
      IconComponent = IconSettings;
      break;
    case 'bell':
    case 'notify':
    case 'notification':
    case '🔔':
      IconComponent = IconMarketing;
      break;
    default:
      IconComponent = IconWorkflowNodes;
      break;
  }

  const containerClass = `nexagnet-icon-container nexagnet-icon-${containerStyle} ${className}`.trim();

  return (
    <span className={containerClass} aria-hidden={ariaHidden}>
      <IconComponent size={size} color={color} strokeWidth={strokeWidth} aria-hidden="true" />
    </span>
  );
}
