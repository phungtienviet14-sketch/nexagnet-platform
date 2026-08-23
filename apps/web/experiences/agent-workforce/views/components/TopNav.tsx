import React from 'react';
import { useBranding } from '../../../../lib/branding';
import type { WorkforceViewId } from '../../navigation';

interface TopNavProps {
  readonly activeView: WorkforceViewId;
  readonly onChangeView: (view: WorkforceViewId) => void;
  readonly alertsCount?: number;
}

interface NavItem {
  readonly id: WorkforceViewId;
  readonly label: string;
  readonly badge?: number;
}

export function TopNav({ activeView, onChangeView, alertsCount = 4 }: TopNavProps) {
  const branding = useBranding();

  const navItems: readonly NavItem[] = [
    { id: 'overview', label: 'Tổng quan' },
    { id: 'directory', label: 'Đội ngũ AI' },
    { id: 'assistant', label: 'Trợ lý điều hành' },
    { id: 'alerts', label: 'Công việc & Cảnh báo', badge: alertsCount },
    { id: 'documents', label: 'Tri thức & Tài liệu' },
    { id: 'operations', label: 'Vận hành Agent' },
  ];

  return (
    <header className="wf-topbar" role="banner">
      <div className="wf-topbar__brand">
        <div className="wf-topbar__logo-wrap">
          {branding.logoPath ? (
            <img
              src={branding.logoPath}
              alt={`${branding.shortName} logo`}
              className="wf-topbar__logo-img"
            />
          ) : (
            <span className="wf-topbar__monogram" aria-hidden="true">
              {branding.monogram}
            </span>
          )}
        </div>
        <div className="wf-topbar__titles">
          <div className="wf-topbar__main-row">
            <h1 className="wf-topbar__title">{branding.productName}</h1>
            <span className="wf-topbar__chip">CONTROL PLANE</span>
          </div>
          <span className="wf-topbar__subtitle">Bàn điều khiển & giám sát đội ngũ AI doanh nghiệp</span>
        </div>
      </div>

      <nav className="wf-topbar__nav" aria-label="Điều hướng chính">
        <ul className="wf-nav-list" role="tablist">
          {navItems.map((item) => {
            const isActive = activeView === item.id;
            return (
              <li key={item.id} role="presentation">
                <button
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`wf-nav-btn ${isActive ? 'wf-nav-btn--active' : ''}`}
                  onClick={() => onChangeView(item.id)}
                >
                  <span className="wf-nav-btn__label">{item.label}</span>
                  {Boolean(item.badge && item.badge > 0) && (
                    <span className="wf-nav-btn__badge">{item.badge}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="wf-topbar__actions">
        <span className="wf-demo-tag" title={`Môi trường thử nghiệm minh họa ${branding.productName}`}>
          <span className="wf-demo-tag__dot" aria-hidden="true" />
          DỮ LIỆU DEMO
        </span>

        <div className="wf-status-indicator" title="Tất cả dịch vụ AI đang hoạt động bình thường">
          <span className="wf-status-indicator__dot" />
          <span className="wf-status-indicator__text">6/6 Agent Online</span>
        </div>

        <a href="/settings" className="wf-settings-link" title="Mở trang cấu hình vận hành và nguồn sự thật">
          Cấu hình →
        </a>
      </div>
    </header>
  );
}
