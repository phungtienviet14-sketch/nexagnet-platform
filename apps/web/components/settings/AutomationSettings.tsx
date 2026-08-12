'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsApi, type SettingsSummary } from '../../lib/settings';
import { SettingsPanelState } from './SettingsPanelState';

type Props = {
  summary: SettingsSummary;
};

export function AutomationSettings({ summary }: Props) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: settingsApi.setAutoSend,
    onSuccess: ({ autoSend }) => {
      queryClient.setQueryData<SettingsSummary>(['settings-summary'], (current) =>
        current ? { ...current, autoSend } : current,
      );
      void queryClient.invalidateQueries({ queryKey: ['config'] });
      void queryClient.invalidateQueries({ queryKey: ['settings-audit'] });
    },
  });

  return (
    <div className="settings-section-stack">
      <header className="settings-section-heading">
        <div>
          <p className="settings-eyebrow">Kill switch vận hành</p>
          <h2>Tự động hóa</h2>
          <p>
            Dùng cùng trạng thái AUTO_SEND của Trung tâm điều hành; không tạo một công tắc song
            song.
          </p>
        </div>
        <span
          className={`settings-safety-state ${summary.autoSend && summary.orderAutomation?.enabled ? 'is-on' : 'is-off'}`}
        >
          <i aria-hidden="true" />
          {summary.autoSend && summary.orderAutomation?.enabled
            ? 'Tự gửi đang BẬT'
            : summary.autoSend
              ? 'Kill switch BẬT · policy TẮT'
              : 'Tự gửi đang TẮT'}
        </span>
      </header>

      <section className={`settings-automation-console ${summary.autoSend ? 'is-live' : ''}`}>
        <div className="settings-automation-dial" aria-hidden="true">
          <span>AUTO</span>
          <i />
          <b>{summary.autoSend ? 'ON' : 'OFF'}</b>
        </div>
        <div className="settings-automation-copy">
          <p className="settings-eyebrow">Trạng thái runtime hiện tại</p>
          <h3>
            {summary.autoSend && summary.orderAutomation?.enabled
              ? 'Policy tự xác nhận của tenant đang được phép chạy'
              : 'Mọi đơn đều chuyển Sale trước khi gửi'}
          </h3>
          <p>
            {summary.orderAutomation
              ? `Chỉ đơn đủ dữ liệu và có tổng số lượng ≤ ${summary.orderAutomation.maxAutoConfirmQuantity} sản phẩm mới tự gửi.`
              : 'Tenant chưa có policy hợp lệ nên hệ thống fail-closed và không tự gửi.'}{' '}
            Sau khi gửi, hệ thống tạo việc Sale nhập ERP thủ công. Khởi động lại API sẽ quay về giá
            trị môi trường; mặc định là tắt.
          </p>
          <button
            type="button"
            className={`settings-button ${summary.autoSend ? 'settings-button--danger' : 'settings-button--primary'}`}
            role="switch"
            aria-checked={summary.autoSend}
            disabled={mutation.isPending}
            onClick={() => mutation.mutate(!summary.autoSend)}
          >
            {mutation.isPending
              ? 'Đang cập nhật…'
              : summary.autoSend
                ? 'Tắt Tự gửi'
                : 'Bật Tự gửi'}
          </button>
        </div>
      </section>

      <div className="settings-guard-grid">
        <article>
          <span>01</span>
          <strong>Policy tenant</strong>
          <p>
            {summary.orderAutomation
              ? `Đang cấu hình ${summary.orderAutomation.enabled ? 'bật' : 'tắt'}, ngưỡng ≤ ${summary.orderAutomation.maxAutoConfirmQuantity} sản phẩm.`
              : 'Chưa cấu hình; hệ thống không tự gửi.'}
          </p>
        </article>
        <article>
          <span>02</span>
          <strong>Đúng kênh nguồn</strong>
          <p>Phản hồi đi qua Bot Platform hoặc zca đã nhận tin.</p>
        </article>
        <article>
          <span>03</span>
          <strong>Handoff sau gửi</strong>
          <p>Đơn đã gửi vẫn nằm trong hàng việc đến khi Sale nhập ERP thủ công.</p>
        </article>
      </div>

      {mutation.error && (
        <SettingsPanelState
          tone="error"
          title="Chưa cập nhật được Tự gửi"
          detail={`${mutation.error.message}. Trạng thái an toàn hiện vẫn là ${summary.autoSend ? 'bật' : 'tắt'}.`}
        />
      )}
    </div>
  );
}
