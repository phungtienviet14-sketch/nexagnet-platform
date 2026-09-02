'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { useBranding } from '../../lib/branding';
import { parseSettingsSummary, settingsApi } from '../../lib/settings';
import { AuditSettings } from './AuditSettings';
import { AutomationSettings } from './AutomationSettings';
import { CampaignSettings } from './CampaignSettings';
import { ContentSettings } from './ContentSettings';
import { NotificationSettings } from './NotificationSettings';
import { OverviewSettings } from './OverviewSettings';
import { ParticipantsSettings } from './ParticipantsSettings';
import { PricePeriodsSettings } from './PricePeriodsSettings';
import { ReadinessSettings } from './ReadinessSettings';
import { RulesSettings } from './RulesSettings';
import { SettingsNav } from './SettingsNav';
import { SettingsPanelState } from './SettingsPanelState';
import { SettingsTabs, type SettingsTab } from './SettingsTabs';
import { SourceTruthSettings } from './SourceTruthSettings';
import { UsersSettings } from './UsersSettings';
import { ZaloSettings } from './ZaloSettings';
import { useAuth } from '../auth/AuthGate';
import { useTenantRuntime } from '../../lib/tenant-runtime-context';
import {
  resolveActiveSettingsSection,
  resolveSettingsAccess,
  selectSettingsSectionIds,
  settingsSectionHref,
  type SettingsRole,
  type SettingsSectionId,
} from './settings-composition';

const EMPTY_SUMMARY = parseSettingsSummary({});

export function SettingsShell() {
  const tenant = useTenantRuntime();
  if (tenant.experience === 'knowledge-workspace') {
    return <KnowledgeSettingsShell />;
  }
  return <OperationsSettingsShell />;
}

function KnowledgeSettingsShell() {
  const branding = useBranding();
  const tenant = useTenantRuntime();
  const sectionIds = selectSettingsSectionIds(tenant);
  const tabs: readonly SettingsTab[] = sectionIds.includes('content')
    ? [
        {
          id: 'content',
          code: 'ND',
          label: 'Nội dung tri thức',
          description: 'FAQ, media, catalog, provenance',
          panel: <ContentSettings />,
        },
      ]
    : [];

  if (tabs.length === 0) {
    throw new Error('Knowledge workspace thieu capability knowledge');
  }

  return (
    <main className="settings-shell" data-experience="knowledge-workspace">
      <header className="settings-hero">
        <div className="settings-hero__nav">
          <a href="/" className="settings-back-link">
            <span aria-hidden="true">←</span> Không gian tri thức
          </a>
        </div>
        <div className="settings-hero__title">
          <div>
            <p className="settings-eyebrow">{branding.shortName} · Nguồn tri thức</p>
            <h1>Quản lý nội dung</h1>
          </div>
          <p>Duyệt và cập nhật nội dung dùng chung cho trợ lý doanh nghiệp.</p>
        </div>
      </header>
      <SettingsTabs tabs={tabs} activeTab="content" onChange={() => undefined} />
    </main>
  );
}

/**
 * Trung tam thiet lap & van hanh cho khach.
 *
 * Muc dang mo nam o `?section=…` chu khong chi trong state: khach phai gui duoc duong dan
 * "vào đây mà sửa bảng giá" cho dong nghiep, va F5 giua chung phai quay lai dung cho (#117 §2).
 */
function OperationsSettingsShell() {
  const branding = useBranding();
  const tenant = useTenantRuntime();
  const auth = useAuth();
  const access = resolveSettingsAccess(auth.user?.role as SettingsRole | undefined);
  const visibleSections = selectSettingsSectionIds(tenant, access);
  // Muc dang mo duoc TINH RA moi lan render chu khong luu san. Vai tro nap ve khong dong bo, nen
  // `visibleSections` co the HEP LAI giua chung (vd MANAGER mat muc quan ly tai khoan). Neu giu
  // muc dang mo trong state thi mot deep-link `?section=users` se ket lai o mot man dang le khong
  // duoc thay; tinh lai thi no tu roi ve Tong quan dung luc danh sach doi.
  const [chosenSection, setChosenSection] = useState<string | null>(null);
  const [linkedSection, setLinkedSection] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setLinkedSection(params.get('section') ?? params.get('tab'));
  }, []);
  const activeSection = resolveActiveSettingsSection(
    visibleSections,
    chosenSection ?? linkedSection,
  );

  const navigate = (section: SettingsSectionId) => {
    setChosenSection(section);
    window.history.replaceState({}, '', settingsSectionHref(section));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const summaryQuery = useQuery({
    queryKey: ['settings-summary'],
    queryFn: settingsApi.summary,
    refetchInterval: 15_000,
  });
  const summary = summaryQuery.data ?? EMPTY_SUMMARY;
  const dataClassificationTest = summary.dataClassification === 'test';

  const panels: Readonly<Record<SettingsSectionId, ReactNode>> = {
    overview: (
      <OverviewSettings
        summary={summary}
        access={access}
        blockedCapabilities={tenant.readiness.blockedCapabilities}
        showPricing={visibleSections.includes('products-pricing')}
        onNavigate={navigate}
      />
    ),
    'products-pricing': (
      <div className="settings-section-stack">
        <PricePeriodsSettings
          dataClassificationTest={dataClassificationTest}
          canConfigure={access.canConfigure}
        />
        <SourceTruthSettings
          adminUiEnabled={summary.adminUi === 'on'}
          resources={['products', 'glossary']}
          heading={{
            eyebrow: 'Danh mục hàng',
            title: 'Sản phẩm',
            description:
              'Mặt hàng bán ra và các cách viết tắt mà đại lý hay dùng khi nhắn tin đặt hàng.',
          }}
        />
      </div>
    ),
    'dealers-groups': (
      <div className="settings-section-stack">
        <SourceTruthSettings
          adminUiEnabled={summary.adminUi === 'on'}
          resources={['dealers', 'overrides']}
          heading={{
            eyebrow: 'Ai mua hàng của mình',
            title: 'Đại lý & giá riêng',
            description:
              'Đại lý, chính sách thanh toán, và giá riêng đã thỏa thuận cho từng mặt hàng.',
          }}
        />
        <ZaloSettings
          summary={summary}
          onRefresh={() => summaryQuery.refetch()}
          onOpenMembers={() => navigate('dealers-groups')}
          view="groups"
        />
        <details className="settings-secondary-detail">
          <summary>Thành viên trong nhóm và vai trò của từng người</summary>
          <ParticipantsSettings groups={summary.groups} />
        </details>
      </div>
    ),
    'sales-policy': <RulesSettings />,
    content: <ContentSettings />,
    campaigns: <CampaignSettings groups={summary.groups} />,
    notifications: (
      <NotificationSettings summary={summary} onRefreshSummary={() => summaryQuery.refetch()} />
    ),
    zalo: (
      <ZaloSettings
        summary={summary}
        onRefresh={() => summaryQuery.refetch()}
        onOpenMembers={() => navigate('dealers-groups')}
        view="connection"
      />
    ),
    automation: <AutomationSettings summary={summary} />,
    'system-status': <ReadinessSettings />,
    users: <UsersSettings />,
    audit: <AuditSettings />,
  };

  return (
    <main className="settings-shell">
      <header className="settings-hero">
        <div className="settings-hero__nav">
          <a href="/" className="settings-back-link">
            <span aria-hidden="true">←</span> Quay lại màn hình làm việc
          </a>
          {auth.user && (
            <span className="settings-environment">
              {auth.user.name} · {roleLabel(auth.user.role as SettingsRole)}
            </span>
          )}
        </div>
        <div className="settings-hero__title">
          <div>
            <p className="settings-eyebrow">{branding.shortName}</p>
            <h1>Thiết lập &amp; vận hành</h1>
          </div>
          <p>
            Mọi thứ cần để hệ thống bán hàng đúng: hàng hóa và giá, đại lý và nhóm, chính sách, và
            các công tắc an toàn.
          </p>
        </div>
      </header>

      {!access.canConfigure && (
        <div className="settings-shell__notice">
          <SettingsPanelState
            title="Bạn đang xem ở chế độ chỉ đọc"
            detail="Tài khoản của bạn xem được cấu hình nhưng không sửa được. Cần thay đổi thì nhờ Quản lý hoặc Quản trị viên."
          />
        </div>
      )}
      {summaryQuery.isLoading && (
        <div className="settings-shell__notice">
          <SettingsPanelState
            title="Đang kiểm tra hệ thống"
            detail="Các phần cài đặt sẽ sẵn sàng trong giây lát…"
          />
        </div>
      )}
      {summaryQuery.error && (
        <div className="settings-shell__notice">
          <SettingsPanelState
            tone="error"
            title="Không tải được tổng quan"
            detail="Bạn vẫn mở được từng phần. Thao tác nào chưa kết nối được sẽ báo lỗi ngay tại chỗ."
            action={
              <button
                type="button"
                className="settings-button settings-button--quiet"
                onClick={() => summaryQuery.refetch()}
              >
                Thử lại
              </button>
            }
          />
        </div>
      )}
      {summary.warnings.map((warning) => (
        <div key={warning} className="settings-shell__warning" role="status">
          <span aria-hidden="true">!</span>
          {warning}
        </div>
      ))}

      <SettingsNav sections={visibleSections} activeSection={activeSection} onChange={navigate}>
        {panels[activeSection]}
      </SettingsNav>
    </main>
  );
}

const ROLE_LABELS: Readonly<Record<SettingsRole, string>> = {
  SALE: 'Sale',
  ACCOUNTING: 'Kế toán',
  MANAGER: 'Quản lý',
  ADMIN: 'Quản trị viên',
};

function roleLabel(role: SettingsRole | undefined): string {
  return role ? (ROLE_LABELS[role] ?? role) : '';
}
