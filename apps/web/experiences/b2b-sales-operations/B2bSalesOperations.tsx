'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useAuth } from '../../components/auth/AuthGate';
import { useBranding } from '../../lib/branding';
import { useTenantRuntime } from '../../lib/tenant-runtime-context';
import {
  buildSectionUrl,
  findSection,
  navigationGroups,
  parseSectionFromSearch,
  parseSelectionFromSearch,
  resolveSection,
  NAVIGATION_ENFORCEMENT_NOTE,
  type B2bSectionId,
  type NavigationInput,
} from './navigation';
import { SettingsView, UsersView } from './views/AdminViews';
import { AlertsView } from './views/AlertsView';
import { ApprovalsView } from './views/ApprovalsView';
import { ConversationsView } from './views/ConversationsView';
import { OrdersView } from './views/OrdersView';
import { OverviewView } from './views/OverviewView';
import { PlannedView } from './views/PlannedView';
import { KnowledgeView, PoliciesView } from './views/ReferenceViews';

const ROLE_LABEL: Readonly<Record<string, string>> = {
  SALE: 'Sale',
  ACCOUNTING: 'Kế toán',
  MANAGER: 'Quản lý',
  ADMIN: 'Quản trị hệ thống',
};

/**
 * VO cua be mat ban hang B2B huong khach — Issue #107.
 *
 * Vo nay chi lam BA viec, va co y khong lam gi hon:
 *   1. dung thanh dieu huong tu hop dong IA (`navigation.ts`), da loc theo nang luc va vai tro;
 *   2. giu muc dang xem DONG BO voi thanh dia chi, de mot duong dan luu lai duoc va nut Back chay;
 *   3. giao viec tai du lieu cho tung trang con.
 *
 * KHONG goi API o day. Moi lan goi nam trong trang con cua no, de mot muc loi khong lam trang khac
 * trong — va de trang thai tai/rong/loi thuoc ve dung cho no.
 */
export function B2bSalesOperations() {
  const branding = useBranding();
  const tenant = useTenantRuntime();
  const { mode, user } = useAuth();

  const navigation: NavigationInput = useMemo(
    () => ({ capabilities: tenant.capabilities, role: user?.role ?? null }),
    [tenant.capabilities, user?.role],
  );

  const [section, setSection] = useState<B2bSectionId>(() =>
    typeof window === 'undefined'
      ? 'overview'
      : parseSectionFromSearch(window.location.search, navigation),
  );
  const [selection, setSelection] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : parseSelectionFromSearch(window.location.search),
  );
  const [navOpen, setNavOpen] = useState(false);

  // Vai tro co the den SAU lan render dau (AuthGate con dang hoi `/auth/me`). Muc dang xem phai
  // duoc cham lai theo hop dong moi, neu khong mot duong dan sau se dung o mot muc ma vai tro do
  // khong con thay.
  useEffect(() => {
    setSection((current) => resolveSection(current, navigation));
  }, [navigation]);

  useEffect(() => {
    const onPopState = () => {
      setSection(parseSectionFromSearch(window.location.search, navigation));
      setSelection(parseSelectionFromSearch(window.location.search));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [navigation]);

  /**
   * MOT duong ghi duy nhat len thanh dia chi.
   *
   * Ca "doi muc" lan "chon mot don" deu di qua day. Hai duong ghi song song (mot cho muc, mot cho
   * lua chon) se dua nhau ghi de: bam mot canh bao o Tong quan phai mo DUNG don do o muc Đơn hàng,
   * chu khong duoc mo muc Đơn hàng roi lua chon bi mot lan ghi sau xoa mat.
   *
   * Doi muc ma khong noi ro chon gi thi XOA lua chon cu: mot ma don cua muc Đơn hàng khong co
   * nghia gi o muc Hội thoại, va giu no lai chi tao mot duong dan khong mo duoc.
   */
  const goTo = useCallback((next: B2bSectionId, nextSelection: string | null = null) => {
    setSection(next);
    setSelection(nextSelection);
    setNavOpen(false);
    const url = buildSectionUrl(next, nextSelection);
    if (
      typeof window !== 'undefined' &&
      `${window.location.pathname}${window.location.search}` !== url
    ) {
      window.history.pushState(null, '', url);
    }
  }, []);

  /**
   * Chon mot thu TRONG muc dang xem — thay the (`replaceState`), khong day them mot muc lich su.
   *
   * Xem qua ba cuoc hoi thoai roi bam Back phai quay ve cho nguoi dung TU DAU di toi, chu khong
   * phai lui tung cuoc mot. Nut Back la duong ra khoi mot man hinh, khong phai nut hoan tac.
   */
  const selectWithin = useCallback(
    (nextSelection: string | null) => {
      setSelection(nextSelection);
      if (typeof window === 'undefined') return;
      const url = buildSectionUrl(section, nextSelection);
      if (`${window.location.pathname}${window.location.search}` !== url) {
        window.history.replaceState(null, '', url);
      }
    },
    [section],
  );

  const groups = navigationGroups(navigation);
  const active = findSection(section)!;
  const canUpdateSources = user === null || user.role === 'MANAGER' || user.role === 'ADMIN';
  const blockedCount = tenant.readiness.blockedCapabilities.length;

  return (
    <div
      className="b2b-shell"
      data-experience="b2b-sales-operations"
      data-nav-open={navOpen || undefined}
      style={
        {
          '--b2b-accent': branding.themeColor,
          '--b2b-canvas': branding.backgroundColor,
        } as CSSProperties
      }
    >
      <a className="b2b-skip" href="#b2b-main">
        Bỏ qua điều hướng
      </a>

      <aside className="b2b-sidebar" id="b2b-sidebar">
        <div className="b2b-brand">
          <span className="b2b-brand__monogram" aria-hidden="true">
            {branding.monogram}
          </span>
          <span className="b2b-brand__text">
            <span className="b2b-brand__name">{branding.shortName}</span>
            <span className="b2b-brand__product">{branding.productName}</span>
          </span>
        </div>

        <nav className="b2b-nav" aria-label="Điều hướng chính">
          {groups.map(({ group, sections }) => (
            <div key={group.id} className="b2b-nav__group">
              {group.label ? (
                <p className="b2b-nav__group-label" id={`b2b-group-${group.id}`}>
                  {group.label}
                </p>
              ) : null}
              <ul
                className="b2b-nav__list"
                aria-labelledby={group.label ? `b2b-group-${group.id}` : undefined}
              >
                {sections.map((item) => (
                  <li key={item.id}>
                    <a
                      className="b2b-nav__item"
                      href={buildSectionUrl(item.id)}
                      aria-current={item.id === section ? 'page' : undefined}
                      onClick={(event) => {
                        if (event.metaKey || event.ctrlKey || event.shiftKey) return;
                        event.preventDefault();
                        goTo(item.id);
                      }}
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <footer className="b2b-sidebar__foot">
          <p className="b2b-sidebar__role">
            {user ? `Đang xem với vai trò ${ROLE_LABEL[user.role] ?? user.role}` : null}
            {!user && mode !== 'session' ? 'Hệ thống đang chạy ở chế độ không đăng nhập' : null}
          </p>
          <p className="b2b-sidebar__note">{NAVIGATION_ENFORCEMENT_NOTE}</p>
        </footer>
      </aside>

      <div className="b2b-body">
        <header className="b2b-topbar">
          <button
            type="button"
            className="b2b-navtoggle"
            aria-expanded={navOpen}
            aria-controls="b2b-sidebar"
            onClick={() => setNavOpen((open) => !open)}
          >
            <span aria-hidden="true">☰</span>
            <span className="b2b-visually-hidden">
              {navOpen ? 'Đóng điều hướng' : 'Mở điều hướng'}
            </span>
          </button>
          <div className="b2b-topbar__heading">
            <h1 className="b2b-topbar__title">{active.label}</h1>
            <p className="b2b-topbar__summary">{active.summary}</p>
          </div>
          {blockedCount > 0 ? (
            <a
              className="b2b-topbar__flag"
              href={buildSectionUrl('overview')}
              onClick={(event) => {
                event.preventDefault();
                goTo('overview');
              }}
            >
              {blockedCount} nghiệp vụ chưa sẵn sàng
            </a>
          ) : null}
        </header>

        <main className="b2b-main" id="b2b-main">
          <SectionBody
            section={section}
            selection={selection}
            canUpdateSources={canUpdateSources}
            onNavigate={goTo}
            onSelect={selectWithin}
          />
        </main>
      </div>
    </div>
  );
}

function SectionBody({
  section,
  selection,
  canUpdateSources,
  onNavigate,
  onSelect,
}: {
  section: B2bSectionId;
  selection: string | null;
  canUpdateSources: boolean;
  onNavigate: (section: B2bSectionId, selection?: string | null) => void;
  onSelect: (selection: string | null) => void;
}) {
  const tenant = useTenantRuntime();
  switch (section) {
    case 'overview':
      return (
        <OverviewView
          tenant={tenant}
          canUpdateSources={canUpdateSources}
          onNavigate={onNavigate}
        />
      );
    case 'conversations':
      return <ConversationsView selection={selection} onSelect={onSelect} />;
    case 'approvals':
      return <ApprovalsView selection={selection} onSelect={onSelect} />;
    case 'orders':
      return <OrdersView selection={selection} onSelect={onSelect} />;
    case 'alerts':
      return <AlertsView onNavigate={onNavigate} />;
    case 'knowledge':
      return <KnowledgeView />;
    case 'policies':
      return <PoliciesView />;
    case 'users':
      return <UsersView />;
    case 'settings':
      return <SettingsView tenant={tenant} />;
    default:
      return <PlannedView section={findSection(section)!} />;
  }
}
