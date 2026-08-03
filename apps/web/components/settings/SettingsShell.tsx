'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { parseSettingsSummary, settingsApi } from '../../lib/settings';
import { AuditSettings } from './AuditSettings';
import { AutomationSettings } from './AutomationSettings';
import { ParticipantsSettings } from './ParticipantsSettings';
import { RulesSettings } from './RulesSettings';
import { SettingsPanelState } from './SettingsPanelState';
import { SettingsTabs, type SettingsTab, type SettingsTabId } from './SettingsTabs';
import { SourceTruthSettings } from './SourceTruthSettings';
import { ZaloSettings } from './ZaloSettings';

const EMPTY_SUMMARY = parseSettingsSummary({});

const CHANNEL_LABELS = {
  mock: 'Mock · offline',
  bot: 'Bot Platform',
  zca: 'Zalo cá nhân',
  hybrid: 'Hybrid hai kênh',
} as const;

export function SettingsShell() {
  const [activeTab, setActiveTab] = useState<SettingsTabId>('zalo');
  const summaryQuery = useQuery({
    queryKey: ['settings-summary'],
    queryFn: settingsApi.summary,
    refetchInterval: 15_000,
  });
  const summary = summaryQuery.data ?? EMPTY_SUMMARY;
  const tabs: readonly SettingsTab[] = [
    {
      id: 'zalo',
      code: 'ZA',
      label: 'Kênh Zalo',
      description: 'Kết nối, allowlist, đồng bộ',
      panel: <ZaloSettings summary={summary} onRefresh={() => summaryQuery.refetch()} />,
    },
    {
      id: 'members',
      code: 'TV',
      label: 'Nhóm & thành viên',
      description: 'Rank, vai trò, cách xử lý',
      panel: <ParticipantsSettings groups={summary.groups} />,
    },
    {
      id: 'source-truth',
      code: 'GI',
      label: 'Đại lý & giá',
      description: 'SKU, bốn cột giá, deal riêng',
      panel: <SourceTruthSettings />,
    },
    {
      id: 'rules',
      code: 'RL',
      label: 'Rules & công thức',
      description: 'Nháp, xem trước, kích hoạt',
      panel: <RulesSettings />,
    },
    {
      id: 'automation',
      code: 'AT',
      label: 'Tự động hóa',
      description: 'AUTO_SEND và cổng D4',
      panel: <AutomationSettings summary={summary} />,
    },
    {
      id: 'audit',
      code: 'LS',
      label: 'Lịch sử thay đổi',
      description: 'Audit chỉ đọc, diff rõ ràng',
      panel: <AuditSettings />,
    },
  ];

  return (
    <main className="settings-shell">
      <header className="settings-hero">
        <div className="settings-hero__nav">
          <a href="/" className="settings-back-link">
            <span aria-hidden="true">←</span> Trung tâm điều hành
          </a>
          <span className="settings-environment">OPERATOR · PILOT</span>
        </div>
        <div className="settings-hero__title">
          <div>
            <p className="settings-eyebrow">U Ultty · Bàn điều khiển nguồn sự thật</p>
            <h1>Cấu hình vận hành</h1>
          </div>
          <p>
            Một nơi để kiểm soát kênh nhận tin, người gửi, giá và các cổng tự động hóa — dành cho
            người vận hành, không cần đọc cấu hình kỹ thuật.
          </p>
        </div>

        <section className="settings-control-rail" aria-label="Ba trạng thái vận hành chính">
          <article>
            <span className={`settings-rail-light settings-rail-light--${summary.availability}`} />
            <small>Kênh nhận tin</small>
            <strong>{CHANNEL_LABELS[summary.channelMode]}</strong>
            <p>
              {summary.zcaState === 'ready' ? 'Tài khoản phụ đang nghe' : 'Kiểm tra kết nối Zalo'}
            </p>
          </article>
          <i aria-hidden="true" />
          <article>
            <span
              className={`settings-rail-light settings-rail-light--${summary.sourceTruth.status}`}
            />
            <small>Nguồn sự thật</small>
            <strong>
              {summary.sourceTruth.productCount || '—'} SKU ·{' '}
              {summary.sourceTruth.dealerCount || '—'} đại lý
            </strong>
            <p>
              {summary.sourceTruth.status === 'available'
                ? 'Đang đọc dữ liệu động'
                : 'Chưa có số liệu tổng quan'}
            </p>
          </article>
          <i aria-hidden="true" />
          <article>
            <span
              className={`settings-rail-light ${summary.autoSend ? 'is-warning' : 'is-safe'}`}
            />
            <small>Cổng an toàn</small>
            <strong>AUTO_SEND {summary.autoSend ? 'ON' : 'OFF'}</strong>
            <p>{summary.autoSend ? 'Chỉ đơn không rủi ro' : 'Sale duyệt mọi đơn'}</p>
          </article>
        </section>
      </header>

      {summaryQuery.isLoading && (
        <div className="settings-shell__notice">
          <SettingsPanelState
            title="Đang kiểm tra hệ thống"
            detail="Các phần cấu hình sẽ sẵn sàng trong giây lát…"
          />
        </div>
      )}
      {summaryQuery.error && (
        <div className="settings-shell__notice">
          <SettingsPanelState
            tone="error"
            title="Không tải được tổng quan"
            detail="Bạn vẫn có thể mở từng phần. Các thao tác chưa kết nối sẽ hiển thị lỗi riêng."
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

      <SettingsTabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
    </main>
  );
}
