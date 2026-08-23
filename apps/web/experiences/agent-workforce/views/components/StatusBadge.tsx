import React from 'react';
import type { AlertSeverity, AlertStatus, CapabilityStatus, IntegrationStatus } from '../../services/types';

export type StatusBadgeType =
  | CapabilityStatus
  | AlertSeverity
  | AlertStatus
  | IntegrationStatus
  | 'ok'
  | 'warn'
  | 'danger';

interface StatusBadgeProps {
  readonly status: StatusBadgeType | string;
  readonly label?: string;
  readonly size?: 'sm' | 'md';
}

const LABELS: Record<string, string> = {
  AVAILABLE: 'SẴN SÀNG',
  DEMO: 'ĐANG CẤU HÌNH',
  PLANNED: 'ĐỊNH HƯỚNG',
  critical: 'Khẩn cấp',
  warning: 'Cảnh báo',
  info: 'Thông tin',
  open: 'Đang chờ',
  in_progress: 'Đang xử lý',
  resolved: 'Đã xử lý',
  connected: 'Đã kết nối',
  configured: 'Đã cấu hình',
  planned: 'Định hướng',
  active: 'Hoạt động',
};

export function StatusBadge({ status, label, size = 'sm' }: StatusBadgeProps) {
  const displayLabel = label ?? LABELS[status] ?? status;
  const statusClass = `wf-badge--${status.toLowerCase().replace(/_/g, '-')}`;

  return (
    <span className={`wf-badge ${statusClass} wf-badge--${size}`}>
      <span className="wf-badge__dot" aria-hidden="true" />
      <span className="wf-badge__label">{displayLabel}</span>
    </span>
  );
}
