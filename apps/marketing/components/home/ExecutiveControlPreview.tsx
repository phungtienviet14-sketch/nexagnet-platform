'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  IconSales,
  IconCSKH,
  IconOperations,
  IconFinance,
  IconMarketing,
  IconHR,
  IconExecutive,
} from '@/components/shared/EnterpriseIcons';

interface DeptStatus {
  id: string;
  name: string;
  label: string;
  Icon: React.ComponentType<{ size?: number; color?: string; 'aria-hidden'?: boolean }>;
  activeCount: number;
  subStatus: string;
  health: 'healthy' | 'attention' | 'review';
  href: string;
}

interface AttentionItem {
  id: string;
  dept: string;
  type: string;
  title: string;
  detail: string;
  actionRequired: string;
  urgency: 'high' | 'medium' | 'normal';
}

const DEPT_STATUSES: DeptStatus[] = [
  {
    id: 'sales',
    name: 'Sales',
    label: 'Phòng Bán hàng',
    Icon: IconSales,
    activeCount: 12,
    subStatus: '2 việc cần xem xét',
    health: 'review',
    href: '/departments/sales',
  },
  {
    id: 'cs',
    name: 'Customer Service',
    label: 'Chăm sóc Khách hàng',
    Icon: IconCSKH,
    activeCount: 38,
    subStatus: '4 ngoại lệ chuyển tiếp',
    health: 'attention',
    href: '/departments/customer-service',
  },
  {
    id: 'ops',
    name: 'Operations',
    label: 'Phòng Vận hành',
    Icon: IconOperations,
    activeCount: 7,
    subStatus: '1 quy trình bị nghẽn',
    health: 'attention',
    href: '/departments/operations',
  },
  {
    id: 'finance',
    name: 'Finance',
    label: 'Tài chính - Kế toán',
    Icon: IconFinance,
    activeCount: 3,
    subStatus: '3 yêu cầu chờ duyệt',
    health: 'review',
    href: '/departments/finance',
  },
  {
    id: 'marketing',
    name: 'Marketing',
    label: 'Phòng Tiếp thị',
    Icon: IconMarketing,
    activeCount: 2,
    subStatus: '2 chiến dịch đang chạy',
    health: 'healthy',
    href: '/departments/marketing',
  },
  {
    id: 'hr',
    name: 'HR',
    label: 'Nhân sự & Nội bộ',
    Icon: IconHR,
    activeCount: 5,
    subStatus: '5 yêu cầu đề xuất',
    health: 'healthy',
    href: '/departments/hr',
  },
];

const ATTENTION_QUEUE: AttentionItem[] = [
  {
    id: 'att-1',
    dept: 'Sales & Rules',
    type: 'Ngoại lệ Giá (Pricing Exception)',
    title: 'Đơn hàng sỉ vượt chiết khấu chuẩn',
    detail: 'Đại lý Meta HN đặt 60 chiếc quạt Felix đề xuất chiết khấu 18% (ngưỡng tự động tối đa là 15%).',
    actionRequired: 'Cần Trưởng phòng Sales hoặc CEO phê duyệt mức chiết khấu',
    urgency: 'high',
  },
  {
    id: 'att-2',
    dept: 'Customer Service',
    type: 'Khiếu nại Chuyển tiếp (Escalation)',
    title: 'Yêu cầu đổi trả bảo hành vượt chính sách 30 ngày',
    detail: 'Khách hàng yêu cầu đổi mới sau 45 ngày sử dụng do lỗi nguồn điện. AI đã gom hồ sơ chứng từ.',
    actionRequired: 'Cần Quản lý CSKH xác nhận phương án hỗ trợ',
    urgency: 'high',
  },
  {
    id: 'att-3',
    dept: 'Finance & Ops',
    type: 'Phê duyệt Quản lý (Manager Approval)',
    title: 'Yêu cầu xuất kho đơn hàng công nợ chạm trần',
    detail: 'Đối tác NPP Miền Trung có công nợ hiện tại 148tr (hạn mức tối đa 150tr), đơn mới trị giá 28tr.',
    actionRequired: 'Cần Kế toán trưởng duyệt ngoại lệ bảo lãnh',
    urgency: 'medium',
  },
  {
    id: 'att-4',
    dept: 'Knowledge Engine',
    type: 'Thiếu Dữ liệu Cấu hình (Missing Data)',
    title: 'Phát hiện mã sản phẩm mới chưa có biểu giá đại lý Cấp 2',
    detail: 'SKU "Lọc không khí AP-02" đã được tạo trong hệ thống nhưng chưa cấu hình giá bán buôn cho đại lý cấp 2.',
    actionRequired: 'Cần Quản trị viên cập nhật biểu giá vào Source of Truth',
    urgency: 'normal',
  },
];

export function ExecutiveControlPreview() {
  const [selectedAttention, setSelectedAttention] = useState<string>('att-1');
  const activeAttention = ATTENTION_QUEUE.find((a) => a.id === selectedAttention) ?? ATTENTION_QUEUE[0]!;

  return (
    <div className="executive-control-root" aria-label="Trung tâm Điều hành Hoạt động">
      {/* Chrome Header */}
      <div className="control-chrome">
        <div className="chrome-left">
          <div className="window-dots" aria-hidden="true">
            <span className="dot dot-red" />
            <span className="dot dot-yellow" />
            <span className="dot dot-green" />
          </div>
          <span className="chrome-title-text">
            <span className="mono-label">CONTROL CENTER</span>
            <span className="divider chrome-subtitle-desktop">/</span>
            <span className="chrome-subtitle-desktop">Operations Cockpit &amp; Exception Triage</span>
          </span>
        </div>
        <div className="chrome-right">
          <span className="cockpit-status-tag">
            <span className="pulse-dot" />
            LIVE TELEMETRY
          </span>
        </div>
      </div>

      {/* Control Dashboard Grid */}
      <div className="control-body">
        {/* Left Column: Department Health & Workflow States */}
        <div className="control-left-col">
          <div className="col-header">
            <div className="header-title">
              <span className="header-title-text">Trạng thái Vận hành theo Phòng ban</span>
            </div>
            <span className="header-hint mono-tag">6 BỘ PHẬN ĐỒNG BỘ</span>
          </div>

          <div className="dept-status-grid">
            {DEPT_STATUSES.map((dept) => {
              const { Icon } = dept;
              return (
                <Link key={dept.id} href={dept.href} className={`dept-status-card health-${dept.health}`}>
                  <div className="card-top">
                    <div className="dept-icon-mini">
                      <Icon size={16} color="currentColor" />
                    </div>
                    <span className={`health-badge badge-${dept.health}`}>
                      {dept.health === 'healthy' && '● Ổn định'}
                      {dept.health === 'attention' && '● Cần chú ý'}
                      {dept.health === 'review' && '● Chờ duyệt'}
                    </span>
                  </div>
                  <div className="dept-info">
                    <div className="dept-name">{dept.label}</div>
                    <div className="dept-metrics">
                      <span className="metric-num">{dept.activeCount}</span>
                      <span className="metric-label">luồng xử lý</span>
                    </div>
                  </div>
                  <div className="dept-sub-status">
                    <span>{dept.subStatus}</span>
                    <span className="arrow-hint" aria-hidden="true">→</span>
                  </div>
                </Link>
              );
            })}
          </div>

          <div className="control-filter-summary">
            <div className="summary-pill">
              <span className="sum-dot green" />
              <span><strong>67</strong> tác vụ tự động hoàn tất trong ngày</span>
            </div>
            <div className="summary-pill">
              <span className="sum-dot orange" />
              <span><strong>4</strong> việc cần con người quyết định</span>
            </div>
          </div>
        </div>

        {/* Right Column: Needs Attention Queue */}
        <div className="control-right-col">
          <div className="col-header">
            <div className="header-title">
              <span className="header-title-text">Hàng đợi Cần Chú ý (Needs Attention)</span>
            </div>
            <span className="alert-count-pill">{ATTENTION_QUEUE.length} việc cần can thiệp</span>
          </div>

          <div className="attention-list">
            {ATTENTION_QUEUE.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`attention-item-card ${selectedAttention === item.id ? 'selected' : ''}`}
                onClick={() => setSelectedAttention(item.id)}
              >
                <div className="item-top">
                  <span className="item-dept">{item.dept}</span>
                  <span className={`item-urgency urgency-${item.urgency}`}>
                    {item.urgency === 'high' ? 'Ưu tiên cao' : item.urgency === 'medium' ? 'Cần duyệt' : 'Cấu hình'}
                  </span>
                </div>
                <div className="item-type">{item.type}</div>
                <div className="item-title">{item.title}</div>
              </button>
            ))}
          </div>

          {/* Active Detail Inspection */}
          <div className="attention-detail-box">
            <div className="detail-header">
              <span className="detail-tag">HỒ SƠ NGOẠI LỆ ĐANG CHỌN</span>
              <span className="detail-type-badge">{activeAttention.type}</span>
            </div>
            <p className="detail-text">{activeAttention.detail}</p>
            <div className="detail-action-box">
              <span className="action-label">Hành động yêu cầu:</span>
              <span className="action-text">{activeAttention.actionRequired}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Truthfulness Footer Notice */}
      <div className="control-footer-notice">
        <IconExecutive size={16} color="var(--text-tertiary)" />
        <span>
          Giao diện trên minh họa tầm nhìn trung tâm điều hành Nexagnet: Lọc nhiễu vận hành, gom trạng thái đa phòng ban và chỉ đưa các ngoại lệ thực sự cần thiết đến cấp quản lý.
        </span>
      </div>
    </div>
  );
}
