'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { buildPricePeriodBoard } from '../../lib/price-period-view';
import {
  buildOverviewCards,
  outstandingWork,
  overviewHeadline,
  type OverviewCard,
} from '../../lib/settings-overview';
import { settingsApi, type SettingsSummary } from '../../lib/settings';
import type { BlockedCapabilityDescriptor } from '../../lib/tenant-runtime';
import type { SettingsAccess, SettingsSectionId } from './settings-composition';
import { SettingsPanelState } from './SettingsPanelState';

/**
 * Man dau — tra loi ba cau trong muoi giay (#117 §3).
 *
 * Ban cu mo thang vao `Kênh Zalo`, tuc la bat khach doan xem viec minh can lam nam o the nao. O
 * day viec dang chan ban hang duoc dua len truoc, moi viec mot cau tieng Viet va dung mot nut dan
 * thang toi man sua duoc no.
 */

type Props = {
  summary: SettingsSummary;
  access: SettingsAccess;
  blockedCapabilities: readonly BlockedCapabilityDescriptor[];
  showPricing: boolean;
  onNavigate: (section: SettingsSectionId) => void;
};

export function OverviewSettings({
  summary,
  access,
  blockedCapabilities,
  showPricing,
  onNavigate,
}: Props) {
  const pricePeriods = useQuery({
    queryKey: ['settings-price-periods'],
    queryFn: settingsApi.pricePeriods,
    enabled: showPricing,
  });
  const readiness = useQuery({
    queryKey: ['settings', 'readiness'],
    queryFn: settingsApi.readiness,
  });

  const board = useMemo(
    () => (pricePeriods.data ? buildPricePeriodBoard(pricePeriods.data) : null),
    [pricePeriods.data],
  );

  const cards = buildOverviewCards({
    summary,
    board,
    readiness: readiness.data ?? null,
    blockedCapabilities,
    canConfigure: access.canConfigure,
    rbacEnforced: access.enforced,
  });
  const outstanding = outstandingWork(cards);
  const headline = overviewHeadline(cards);
  const settled = cards.filter((card) => !outstanding.includes(card));

  return (
    <section className="settings-section-stack" aria-label="Tổng quan">
      <header className="settings-section-heading">
        <div>
          <p className="settings-eyebrow">Bắt đầu ở đây</p>
          <h2>Tổng quan</h2>
          <p>Hệ thống đang chạy thế nào, có gì đang chặn bán hàng, và bạn cần làm gì tiếp.</p>
        </div>
      </header>

      <SettingsPanelState
        tone={
          headline.tone === 'ok' ? 'success' : headline.tone === 'blocked' ? 'error' : 'warning'
        }
        title={headline.title}
        detail={headline.detail}
      />

      {outstanding.length > 0 && (
        <section aria-labelledby="settings-overview-todo">
          <div className="settings-subheading">
            <h3 id="settings-overview-todo">Việc cần hoàn thiện</h3>
            <span className="settings-count">{outstanding.length} việc</span>
          </div>
          <ul className="settings-overview-grid">
            {outstanding.map((card) => (
              <OverviewCardView key={card.key} card={card} onNavigate={onNavigate} />
            ))}
          </ul>
        </section>
      )}

      {settled.length > 0 && (
        <section aria-labelledby="settings-overview-ok">
          <div className="settings-subheading">
            <h3 id="settings-overview-ok">Đang ổn</h3>
          </div>
          <ul className="settings-overview-grid">
            {settled.map((card) => (
              <OverviewCardView key={card.key} card={card} onNavigate={onNavigate} />
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}

function OverviewCardView({
  card,
  onNavigate,
}: {
  card: OverviewCard;
  onNavigate: (section: SettingsSectionId) => void;
}) {
  return (
    <li className={`settings-overview-card settings-overview-card--${card.status}`}>
      {/* Khong chi dua vao mau: moi the co mot nhan trang thai doc duoc (#117 §9). */}
      <span className="settings-overview-card__status">{STATUS_LABELS[card.status]}</span>
      <strong>{card.title}</strong>
      <p>{card.detail}</p>
      {card.action && (
        <button
          type="button"
          className="settings-button settings-button--quiet"
          onClick={() => onNavigate(card.action!.section)}
        >
          {card.action.label}
        </button>
      )}
      {card.technicalDetail && (
        <details className="settings-technical-details">
          <summary>Chi tiết kỹ thuật</summary>
          <code>{card.technicalDetail}</code>
        </details>
      )}
    </li>
  );
}

const STATUS_LABELS: Readonly<Record<OverviewCard['status'], string>> = {
  ok: 'Đang tốt',
  attention: 'Cần hoàn thiện',
  blocked: 'Đang chặn',
  off: 'Đang tắt',
};
