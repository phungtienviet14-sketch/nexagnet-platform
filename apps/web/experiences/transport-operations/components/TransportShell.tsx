'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';
import { useBranding } from '../../../lib/branding';
import {
  buildDriverUrl,
  buildSectionUrl,
  NAVIGATION_ENFORCEMENT_NOTE,
  type DriverScreen,
  type DriverScreenId,
  type TransportNavigationGroup,
  type TransportSectionId,
} from '../navigation';

/**
 * VO cua be mat van hanh van tai.
 *
 * VO KHONG BIET DU LIEU — #161 §2 doi dung dieu do: moi khung nhin tu giu trang thai tai/loi/rong
 * cua chinh no. Nen tep nay khong goi mot query nao; no chi nhan danh muc da duoc loc va mot khoi
 * noi dung.
 *
 * `data-experience="transport-operations"` tren the goc phai GIU NGUYEN: hop dong
 * `apps/web/tenant-runtime.contract.mjs` doc chinh thuoc tinh do de chung minh mot image chay duoc
 * nhieu khach.
 */

const ROLE_LABEL: Readonly<Record<string, string>> = {
  SALE: 'Lái xe',
  ACCOUNTING: 'Kế toán',
  MANAGER: 'Quản lý',
  ADMIN: 'Giám đốc',
};

export const roleLabelOf = (role: string | null): string | null =>
  role === null ? null : (ROLE_LABEL[role] ?? role);

export function TransportShell({
  groups,
  activeSection,
  activeTitle,
  roleLabel,
  onNavigate,
  driverScreens,
  children,
}: {
  readonly groups: readonly TransportNavigationGroup[];
  readonly activeSection: TransportSectionId;
  readonly activeTitle: string;
  readonly roleLabel: string | null;
  readonly onNavigate: (section: TransportSectionId) => void;
  /** Rong ⇒ khong bay loi vao be mat lai xe. */
  readonly driverScreens: readonly DriverScreen[];
  readonly children: ReactNode;
}) {
  const branding = useBranding();
  const [isDrawerOpen, setDrawerOpen] = useState(false);

  return (
    <div
      className="tx-shell"
      data-experience="transport-operations"
      data-drawer={isDrawerOpen ? 'open' : 'closed'}
      style={
        {
          '--tx-accent': branding.themeColor,
          '--tx-canvas': branding.backgroundColor,
        } as CSSProperties
      }
    >
      {/* Duong nhay ban phim — phai la phan tu bat tieu diem DAU TIEN cua trang. */}
      <a className="tx-skip" href="#tx-main">
        Bỏ qua danh mục, vào nội dung
      </a>

      <aside className="tx-rail" id="tx-rail">
        <div className="tx-brand">
          <span className="tx-brand__monogram" aria-hidden="true">
            {branding.monogram}
          </span>
          <span className="tx-brand__text">
            <span className="tx-brand__name">{branding.shortName}</span>
            <span className="tx-brand__unit">Vận hành vận tải</span>
          </span>
        </div>

        <nav className="tx-nav" aria-label="Điều hướng vận hành vận tải">
          {groups.map((entry) => (
            <div className="tx-nav__group" key={entry.group.id}>
              {entry.group.label === '' ? null : (
                <p className="tx-nav__grouplabel">{entry.group.label}</p>
              )}
              <ul>
                {entry.sections.map((section) => (
                  <li key={section.id}>
                    <a
                      className="tx-nav__item"
                      href={buildSectionUrl(section.id)}
                      aria-current={section.id === activeSection ? 'page' : undefined}
                      onClick={(event) => {
                        // Giu duong dan that tren `href` de bam giua/mo tab moi van chay; chi chan
                        // lan bam thuong de dieu huong trong ung dung.
                        if (event.metaKey || event.ctrlKey || event.shiftKey) return;
                        event.preventDefault();
                        setDrawerOpen(false);
                        onNavigate(section.id);
                      }}
                    >
                      <span>{section.label}</span>
                      {section.dataSource === 'awaiting-api' ? (
                        <span className="tx-nav__flag" title="Chưa có đường dữ liệu">
                          chờ API
                        </span>
                      ) : null}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="tx-rail__foot">
          {roleLabel === null ? null : <p className="tx-rail__role">{roleLabel}</p>}
          {driverScreens.length === 0 ? null : (
            <a className="tx-rail__driverlink" href={buildDriverUrl('home')}>
              Mở màn hình lái xe →
            </a>
          )}
          <p className="tx-rail__note">{NAVIGATION_ENFORCEMENT_NOTE}</p>
        </div>
      </aside>

      <div className="tx-body">
        <div className="tx-topbar">
          <button
            type="button"
            className="tx-drawerbtn"
            aria-expanded={isDrawerOpen}
            aria-controls="tx-rail"
            onClick={() => setDrawerOpen((open) => !open)}
          >
            {isDrawerOpen ? 'Đóng danh mục' : 'Danh mục'}
          </button>
          <span className="tx-topbar__title">{activeTitle}</span>
        </div>

        <main className="tx-main" id="tx-main" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}

/**
 * VO cua be mat LAI XE — mot dia chi rieng trong cung experience (`GD-23`), toi uu cho dien thoai.
 *
 * Thanh dieu huong nam DUOI de ngon tay voi duoc, va thao tac chinh cua tung man luon nam tren cung
 * — #161 §3 doi "1–2 cham cho viec thuong lam".
 */
export function DriverShell({
  screens,
  activeScreen,
  onNavigate,
  onLeave,
  children,
}: {
  readonly screens: readonly DriverScreen[];
  readonly activeScreen: DriverScreenId;
  readonly onNavigate: (screen: DriverScreenId) => void;
  /** `null` ⇒ nguoi nay khong co pham vi van hanh, nen khong bay duong quay ra. */
  readonly onLeave: (() => void) | null;
  readonly children: ReactNode;
}) {
  const branding = useBranding();
  return (
    <div
      className="tx-driver"
      data-experience="transport-operations"
      style={{ '--tx-accent': branding.themeColor } as CSSProperties}
    >
      <a className="tx-skip" href="#tx-driver-main">
        Bỏ qua danh mục, vào nội dung
      </a>
      <header className="tx-driver__head">
        <span className="tx-driver__brand">{branding.shortName}</span>
        {onLeave === null ? null : (
          <button type="button" className="tx-btn tx-btn--ghost" onClick={onLeave}>
            Về vận hành
          </button>
        )}
      </header>
      <main className="tx-driver__main" id="tx-driver-main" tabIndex={-1}>
        {children}
      </main>
      <nav className="tx-driver__tabs" aria-label="Điều hướng lái xe">
        {screens.map((screen) => (
          <a
            key={screen.id}
            href={buildDriverUrl(screen.id)}
            aria-current={screen.id === activeScreen ? 'page' : undefined}
            onClick={(event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey) return;
              event.preventDefault();
              onNavigate(screen.id);
            }}
          >
            {screen.label}
          </a>
        ))}
      </nav>
    </div>
  );
}
