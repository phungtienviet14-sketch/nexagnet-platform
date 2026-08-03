'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { settingsApi, type SettingsSummary } from '../../lib/settings';
import { SettingsPanelState } from './SettingsPanelState';

type Props = {
  summary: SettingsSummary;
};

export function AutomationSettings({ summary }: Props) {
  const queryClient = useQueryClient();
  const [isConfirming, setIsConfirming] = useState(false);
  const [hasCustomerApproval, setHasCustomerApproval] = useState(false);
  const mutation = useMutation({
    mutationFn: settingsApi.setAutoSend,
    onSuccess: ({ autoSend }) => {
      setIsConfirming(false);
      setHasCustomerApproval(false);
      queryClient.setQueryData<SettingsSummary>(['settings-summary'], (current) =>
        current ? { ...current, autoSend } : current,
      );
      void queryClient.invalidateQueries({ queryKey: ['config'] });
      void queryClient.invalidateQueries({ queryKey: ['settings-audit'] });
    },
  });

  const handleToggleRequest = () => {
    if (summary.autoSend) {
      if (window.confirm('Tắt Tự gửi ngay? Các đơn mới sẽ quay về chờ Sale duyệt.'))
        mutation.mutate(false);
      return;
    }
    setIsConfirming(true);
  };

  return (
    <div className="settings-section-stack">
      <header className="settings-section-heading">
        <div>
          <p className="settings-eyebrow">Cổng an toàn D4</p>
          <h2>Tự động hóa</h2>
          <p>
            Dùng cùng trạng thái AUTO_SEND của Trung tâm điều hành; không tạo một công tắc song
            song.
          </p>
        </div>
        <span className={`settings-safety-state ${summary.autoSend ? 'is-on' : 'is-off'}`}>
          <i aria-hidden="true" />
          {summary.autoSend ? 'Tự gửi đang BẬT' : 'Tự gửi đang TẮT'}
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
            {summary.autoSend
              ? 'Hệ thống có thể tự gửi đơn an toàn'
              : 'Mọi đơn đều chờ người duyệt'}
          </h3>
          <p>
            Chỉ đơn không có cảnh báo, không cần sửa và được vai Giám sát xác nhận mới đủ điều kiện
            tự gửi. Khởi động lại API sẽ quay về giá trị môi trường; mặc định là tắt.
          </p>
          <button
            type="button"
            className={`settings-button ${summary.autoSend ? 'settings-button--danger' : 'settings-button--primary'}`}
            role="switch"
            aria-checked={summary.autoSend}
            disabled={mutation.isPending}
            onClick={handleToggleRequest}
          >
            {mutation.isPending
              ? 'Đang cập nhật…'
              : summary.autoSend
                ? 'Tắt Tự gửi'
                : 'Bắt đầu quy trình bật'}
          </button>
        </div>
      </section>

      {isConfirming && !summary.autoSend && (
        <section
          className="settings-confirmation"
          role="dialog"
          aria-modal="false"
          aria-labelledby="auto-send-confirm-title"
        >
          <div className="settings-confirmation__step">Bước 2 / 2</div>
          <div>
            <p className="settings-eyebrow">Xác nhận có chủ ý</p>
            <h3 id="auto-send-confirm-title">Điều kiện trước khi bật Tự gửi</h3>
            <ul>
              <li>Đang dùng nhóm test hoặc phạm vi pilot đã được phê duyệt.</li>
              <li>Sale hiểu rằng chỉ đơn không rủi ro mới tự gửi.</li>
              <li>Có văn bản đồng ý của khách hàng theo quyết định D4.</li>
            </ul>
            <label className="settings-confirm-check">
              <input
                type="checkbox"
                checked={hasCustomerApproval}
                onChange={(event) => setHasCustomerApproval(event.target.checked)}
              />
              <span>Tôi xác nhận đã có văn bản đồng ý của khách hàng.</span>
            </label>
          </div>
          <div className="settings-confirmation__actions">
            <button
              type="button"
              className="settings-button settings-button--quiet"
              onClick={() => {
                setIsConfirming(false);
                setHasCustomerApproval(false);
              }}
            >
              Hủy
            </button>
            <button
              type="button"
              className="settings-button settings-button--primary"
              disabled={!hasCustomerApproval || mutation.isPending}
              onClick={() => mutation.mutate(true)}
            >
              Bật Tự gửi có kiểm soát
            </button>
          </div>
        </section>
      )}

      <div className="settings-guard-grid">
        <article>
          <span>01</span>
          <strong>Giám sát duyệt rủi ro</strong>
          <p>Có bất kỳ cờ rủi ro nào thì không tự gửi.</p>
        </article>
        <article>
          <span>02</span>
          <strong>Đúng kênh nguồn</strong>
          <p>Phản hồi đi qua Bot Platform hoặc zca đã nhận tin.</p>
        </article>
        <article>
          <span>03</span>
          <strong>Audit mọi thay đổi</strong>
          <p>Bật hoặc tắt đều được ghi vào lịch sử bất biến.</p>
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
