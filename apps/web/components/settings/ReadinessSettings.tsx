'use client';

import { useQuery } from '@tanstack/react-query';
import { readinessCheckSection, resolveReadinessFocus } from '../../lib/settings-focus';
import { settingsApi, type ReadinessCheckView, type ReadinessStatus } from '../../lib/settings';
import {
  SettingsActionRow,
  SettingsAdvanced,
  SettingsStatusBar,
  SettingsWorkCard,
} from './SettingsFocus';
import type { SettingsSectionId } from './settings-composition';
import { formatSettingsDate } from './settings-format';
import { SettingsPanelState } from './SettingsPanelState';

const STATUS_LABELS: Readonly<Record<ReadinessStatus, string>> = {
  ready: 'Đã sẵn sàng',
  missing: 'Còn thiếu',
  warning: 'Cần lưu ý',
  blocked: 'Chưa mở',
};

/**
 * Trang thai he thong = HANG VIEC, khong phai mot danh sach kiem (#146 §9).
 *
 * CO Y khong hien "đã sẵn sàng" khi thieu du lieu: muc thieu phai doc ra la thieu. Day van la man
 * phan biet CODE COMPLETE (nen tang da lam xong) voi GO-LIVE READY (khach da du du lieu that) —
 * #146 chi doi CACH TRINH BAY, khong doi ket luan cua may chu.
 */
export function ReadinessSettings({
  onNavigate,
}: {
  onNavigate?: (section: SettingsSectionId) => void;
}) {
  const { data, isPending, error } = useQuery({
    queryKey: ['settings', 'readiness'],
    queryFn: settingsApi.readiness,
  });
  // KHONG chuyen tieu diem o day (#154 Finding A): kiem tra san sang la KET LUAN CUA MAY CHU,
  // khong thao tac nao trong man nay doi duoc no. Mot lan nap lai lam mot kiem tra chuyen tu
  // `missing` sang `ready` khong phai la "nguoi van hanh vua chuyen viec".

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

  const focus = resolveReadinessFocus({ checks: data.checks, goLiveReady: data.goLiveReady });
  const next = focus.open[0];
  const rest = focus.open.slice(1);
  const settled = focus.blocking.filter((check) => check.status === 'ready');
  const nextSection = next ? readinessCheckSection(next.key) : undefined;

  return (
    <section className="settings-section-stack" aria-labelledby="settings-readiness-title">
      <header className="settings-section-heading">
        <div>
          <p className="settings-eyebrow">Sẵn sàng vận hành</p>
          <h2 id="settings-readiness-title">Trạng thái hệ thống</h2>
          <p>Những việc còn thiếu trước khi hệ thống được phép chạy với khách hàng thật.</p>
        </div>
      </header>

      <SettingsStatusBar
        tone={focus.tone}
        title={focus.title}
        detail={focus.detail}
        facts={[
          {
            label: 'Phần code nền tảng',
            value: data.codeComplete ? 'Đã hoàn tất' : 'Chưa hoàn tất',
          },
          ...(data.checkedAt
            ? [{ label: 'Kiểm lúc', value: formatSettingsDate(data.checkedAt) }]
            : []),
        ]}
      />

      {next ? (
        <SettingsWorkCard
          eyebrow="Điều kiện cần xử lý trước"
          title={next.label}
          problem={readinessProblem(next)}
          tone="blocked"
          headingId="settings-readiness-work"
          actions={
            <SettingsActionRow
              primary={
                nextSection && onNavigate ? (
                  <button
                    type="button"
                    className="settings-button settings-button--primary"
                    onClick={() => onNavigate(nextSection)}
                  >
                    Mở màn xử lý việc này
                  </button>
                ) : undefined
              }
              blockedReason={
                nextSection
                  ? undefined
                  : 'Việc này không sửa được trong màn cài đặt — cần người vận hành hệ thống xử lý.'
              }
            />
          }
        >
          <details className="settings-technical-details">
            <summary>Chi tiết kỹ thuật</summary>
            <code>{next.detail}</code>
          </details>
        </SettingsWorkCard>
      ) : (
        <SettingsWorkCard
          eyebrow="Cổng go-live"
          title="Đủ điều kiện chạy thật"
          problem="Mọi điều kiện bắt buộc đã đạt. Việc bật chạy thật vẫn là quyết định của người vận hành."
          tone="ok"
          headingId="settings-readiness-work"
        />
      )}

      {rest.length > 0 && (
        <section aria-labelledby="settings-readiness-queue">
          <div className="settings-subheading">
            <h3 id="settings-readiness-queue">Làm tiếp sau đó</h3>
            <span className="settings-count">{rest.length} điều kiện</span>
          </div>
          <ul className="settings-focus-queue">
            {rest.map((check) => (
              <CheckRow key={check.key} check={check} onNavigate={onNavigate} />
            ))}
          </ul>
        </section>
      )}

      {settled.length > 0 && (
        <SettingsAdvanced
          title="Điều kiện bắt buộc đã đạt"
          hint={`${settled.length} mục`}
          defaultOpen={focus.open.length === 0}
        >
          <ul className="settings-focus-queue">
            {settled.map((check) => (
              <CheckRow key={check.key} check={check} onNavigate={onNavigate} />
            ))}
          </ul>
        </SettingsAdvanced>
      )}

      {focus.informational.length > 0 && (
        <SettingsAdvanced
          title="Ghi chú và nghiệp vụ chưa mở"
          hint={`${focus.informational.length} mục · không chặn chạy thật`}
        >
          <ul className="settings-focus-queue">
            {focus.informational.map((check) => (
              <CheckRow key={check.key} check={check} onNavigate={onNavigate} />
            ))}
          </ul>
        </SettingsAdvanced>
      )}
    </section>
  );
}

/** Ly do doc duoc cho nguoi khong ky thuat; ma goc cua may van con o "Chi tiết kỹ thuật". */
function readinessProblem(check: ReadinessCheckView): string {
  if (check.status === 'missing') return 'Dữ liệu cho điều kiện này chưa có trong hệ thống.';
  if (check.status === 'warning') return 'Điều kiện này có dấu hiệu bất thường, cần xem lại.';
  if (check.status === 'blocked') return 'Nghiệp vụ này chưa được mở, nên điều kiện chưa tính là đạt.';
  return 'Điều kiện đã đạt.';
}

function CheckRow({
  check,
  onNavigate,
}: {
  check: ReadinessCheckView;
  onNavigate?: (section: SettingsSectionId) => void;
}) {
  const section = readinessCheckSection(check.key);
  return (
    <li className={`settings-readiness-item--${check.status}`}>
      <div>
        <span className="settings-readiness-item__status">{STATUS_LABELS[check.status]}</span>{' '}
        <strong>{check.label}</strong>
      </div>
      {section && onNavigate && check.status !== 'ready' && (
        <button
          type="button"
          className="settings-button settings-button--quiet"
          onClick={() => onNavigate(section)}
        >
          Mở màn xử lý
        </button>
      )}
      <small>
        {/* Ma ly do cua may chi nam trong "Chi tiết kỹ thuật" — o mat truoc no khong noi duoc gi
            cho nguoi khong ky thuat (#117 §9). */}
        <details className="settings-technical-details">
          <summary>Chi tiết kỹ thuật</summary>
          <code>{check.detail}</code>
        </details>
      </small>
    </li>
  );
}
