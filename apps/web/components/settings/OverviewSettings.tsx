'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo, useRef } from 'react';
import { buildPricePeriodBoard } from '../../lib/price-period-view';
import { leadingOverviewWork, rankOverviewWork } from '../../lib/settings-focus';
import {
  buildOverviewCards,
  outstandingWork,
  overviewHeadline,
  type OverviewCard,
} from '../../lib/settings-overview';
import { settingsApi, type SettingsSummary } from '../../lib/settings';
import type { BlockedCapabilityDescriptor } from '../../lib/tenant-runtime';
import {
  SettingsActionRow,
  SettingsAdvanced,
  SettingsStatusBar,
  SettingsWorkCard,
  useFocusOnKey,
} from './SettingsFocus';
import type { SettingsAccess, SettingsSectionId } from './settings-composition';

/**
 * Man dau — noi VIEC TIEP THEO, khong bay mot bang dieu khien cac the ngang hang (#146 §1).
 *
 * Ban #117 da dua viec dang chan len truoc, nhung moi viec van la mot the cung co lon, cung mot
 * kieu nut: nguoi van hanh doc het nam the roi tu quyet dinh bat dau tu dau. O day chi MOT viec la
 * khoi noi bat; nhung viec con lai tut xuong thanh mot hang cho gon, va "Đang ổn" gap lai.
 *
 * Thu tu uu tien LAY TU `status` da co (`blocked` > `attention` > `off` > `ok`) chu khong phai mot
 * bang xep hang nghiep vu moi — xem `rankOverviewWork()`.
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

  const leading = leadingOverviewWork(outstanding);
  const queued = rankOverviewWork(outstanding).filter((card) => card !== leading);

  const workHeading = useRef<HTMLHeadingElement>(null);
  useFocusOnKey(workHeading, leading ? `overview-work:${leading.key}` : null);

  return (
    <section className="settings-section-stack" aria-label="Tổng quan">
      <header className="settings-section-heading">
        <div>
          <p className="settings-eyebrow">Bắt đầu ở đây</p>
          <h2>Tổng quan</h2>
          <p>Hệ thống đang chạy thế nào, có gì đang chặn bán hàng, và bạn cần làm gì tiếp.</p>
        </div>
      </header>

      <SettingsStatusBar
        tone={headline.tone === 'ok' ? 'ok' : headline.tone === 'blocked' ? 'blocked' : 'attention'}
        title={headline.title}
        detail={headline.detail}
        facts={[
          { label: 'Việc cần hoàn thiện', value: `${outstanding.length}` },
          { label: 'Đang ổn', value: `${settled.length}` },
        ]}
      />

      {leading ? (
        <SettingsWorkCard
          eyebrow="Việc nên làm trước"
          title={leading.title}
          problem={leading.detail}
          tone={leading.status === 'blocked' ? 'blocked' : 'attention'}
          headingId="settings-overview-work"
          headingRef={workHeading}
          actions={
            leading.action ? (
              <SettingsActionRow
                primary={
                  <button
                    type="button"
                    className="settings-button settings-button--primary"
                    onClick={() => onNavigate(leading.action!.section)}
                  >
                    {leading.action.label}
                  </button>
                }
              />
            ) : undefined
          }
        >
          {leading.technicalDetail && (
            <details className="settings-technical-details">
              <summary>Chi tiết kỹ thuật</summary>
              <code>{leading.technicalDetail}</code>
            </details>
          )}
        </SettingsWorkCard>
      ) : (
        <SettingsWorkCard
          eyebrow="Không còn việc nào chặn"
          title="Hệ thống đủ dữ liệu để chạy"
          problem="Không có việc nào đang chặn bán hàng. Các mục bên dưới để tra cứu và chỉnh khi cần."
          tone="ok"
          headingId="settings-overview-work"
          headingRef={workHeading}
        />
      )}

      {queued.length > 0 && (
        <section aria-labelledby="settings-overview-queue">
          <div className="settings-subheading">
            <h3 id="settings-overview-queue">Làm tiếp sau đó</h3>
            <span className="settings-count">{queued.length} việc</span>
          </div>
          <ul className="settings-focus-queue">
            {queued.map((card) => (
              <QueuedWork key={card.key} card={card} onNavigate={onNavigate} />
            ))}
          </ul>
        </section>
      )}

      {settled.length > 0 && (
        <SettingsAdvanced
          title="Những phần đang ổn"
          hint={`${settled.length} mục`}
          // Khong con viec nao dang cho thi phan "dang on" chinh la noi dung dang gia tri nhat.
          defaultOpen={outstanding.length === 0}
        >
          <ul className="settings-focus-queue">
            {settled.map((card) => (
              <QueuedWork key={card.key} card={card} onNavigate={onNavigate} />
            ))}
          </ul>
        </SettingsAdvanced>
      )}
    </section>
  );
}

const STATUS_LABELS: Readonly<Record<OverviewCard['status'], string>> = {
  ok: 'Đang tốt',
  attention: 'Cần hoàn thiện',
  blocked: 'Đang chặn',
  off: 'Đang tắt',
};

function QueuedWork({
  card,
  onNavigate,
}: {
  card: OverviewCard;
  onNavigate: (section: SettingsSectionId) => void;
}) {
  return (
    <li>
      <div>
        {/* Khong chi dua vao mau: moi dong co mot nhan trang thai doc duoc (#117 §9). */}
        <span className={`settings-overview-card__status settings-overview-card--${card.status}`}>
          {STATUS_LABELS[card.status]}
        </span>{' '}
        <strong>{card.title}</strong>
      </div>
      {card.action && (
        <button
          type="button"
          className="settings-button settings-button--quiet"
          onClick={() => onNavigate(card.action!.section)}
        >
          {card.action.label}
        </button>
      )}
      <small>{card.detail}</small>
      {card.technicalDetail && (
        <details className="settings-technical-details">
          <summary>Chi tiết kỹ thuật</summary>
          <code>{card.technicalDetail}</code>
        </details>
      )}
    </li>
  );
}
