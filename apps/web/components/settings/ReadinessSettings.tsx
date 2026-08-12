'use client';

import { useQuery } from '@tanstack/react-query';
import { settingsApi, type ReadinessStatus, type ReadinessView } from '../../lib/settings';
import { formatSettingsDate } from './settings-format';
import { SettingsPanelState } from './SettingsPanelState';

const STATUS_LABELS: Readonly<Record<ReadinessStatus, string>> = {
  ready: 'Đã sẵn sàng',
  missing: 'Còn thiếu',
  warning: 'Cần lưu ý',
  blocked: 'Chưa mở',
};

/**
 * CO Y khong hien "đã sẵn sàng" khi thieu du lieu: muc thieu phai doc ra la thieu. Day la man
 * phan biet CODE COMPLETE (nen tang da lam xong) voi GO-LIVE READY (khach da du du lieu that).
 */
export function ReadinessSettings() {
  const { data, isPending, error } = useQuery({
    queryKey: ['settings', 'readiness'],
    queryFn: settingsApi.readiness,
  });

  if (isPending) {
    return (
      <SettingsPanelState
        title="Đang kiểm tra mức sẵn sàng…"
        detail="Đang đọc trạng thái bảng giá, đại lý, kênh, parser và golden dataset."
      />
    );
  }
  if (error) {
    return (
      <SettingsPanelState
        tone="error"
        title="Không đọc được trạng thái sẵn sàng"
        detail="Thử tải lại trang; nếu vẫn lỗi thì kiểm tra API /settings/readiness."
      />
    );
  }

  const readiness: ReadinessView = data;
  const blocking = readiness.checks.filter((check) => check.blocking);
  const informational = readiness.checks.filter((check) => !check.blocking);
  const notReady = blocking.filter((check) => check.status !== 'ready').length;

  return (
    <section className="settings-readiness" aria-labelledby="settings-readiness-title">
      <div className="settings-subheading">
        <div>
          <p className="settings-eyebrow">Sẵn sàng vận hành</p>
          <h3 id="settings-readiness-title">Cổng go-live</h3>
        </div>
        <span
          className={`settings-version-chip settings-version-chip--${
            readiness.goLiveReady ? 'active' : 'draft'
          }`}
        >
          {readiness.goLiveReady ? 'Đủ điều kiện chạy thật' : 'Chưa đủ điều kiện chạy thật'}
        </span>
      </div>

      <SettingsPanelState
        tone={readiness.goLiveReady ? 'success' : 'neutral'}
        title={
          readiness.goLiveReady
            ? 'Đủ điều kiện chạy thật'
            : `Còn ${notReady} điều kiện bắt buộc chưa đạt`
        }
        detail={`Nền tảng ${
          readiness.codeComplete ? 'đã hoàn tất phần code' : 'chưa hoàn tất phần code'
        }.${readiness.checkedAt ? ` Kiểm lúc ${formatSettingsDate(readiness.checkedAt)}.` : ''}`}
      />

      <h4>Điều kiện bắt buộc</h4>
      <ul className="settings-readiness-list">
        {blocking.map((check) => (
          <li
            key={check.key}
            className={`settings-readiness-item settings-readiness-item--${check.status}`}
          >
            <span className="settings-readiness-item__label">{check.label}</span>
            <span className="settings-readiness-item__status">{STATUS_LABELS[check.status]}</span>
            <code className="settings-readiness-item__detail">{check.detail}</code>
          </li>
        ))}
      </ul>

      <h4>Ghi chú và nghiệp vụ chưa mở</h4>
      <ul className="settings-readiness-list">
        {informational.map((check) => (
          <li
            key={check.key}
            className={`settings-readiness-item settings-readiness-item--${check.status}`}
          >
            <span className="settings-readiness-item__label">{check.label}</span>
            <span className="settings-readiness-item__status">{STATUS_LABELS[check.status]}</span>
            <span className="settings-readiness-item__detail">{check.detail}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
