'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { settingsApi, type SettingsSummary } from '../../lib/settings';
import {
  SettingsActionRow,
  SettingsAdvanced,
  SettingsFocusModal,
  SettingsStatusBar,
  SettingsWorkCard,
  useFocusIntent,
  useFocusOnKey,
} from './SettingsFocus';
import { SettingsPanelState } from './SettingsPanelState';

type Props = {
  summary: SettingsSummary;
};

/**
 * Cong tac Tu gui — mot trang thai, mot hanh dong, mot buoc xac nhan (#146 §8).
 *
 * KHONG doi chinh sach an toan: van la cung mot `AUTO_SEND` cua Trung tam dieu hanh, van fail-closed
 * khi tenant khong co policy, va khoi dong lai API van quay ve gia tri moi truong. Cai thay doi la
 * nguoi van hanh phai doc HAU QUA truoc khi doi trang thai, va hop xac nhan giu tieu diem.
 */
export function AutomationSettings({ summary }: Props) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const workHeading = useRef<HTMLHeadingElement>(null);
  // Nut mo hop thoai. Hop thoai tu tra tieu diem ve day khi dong (#154), nen o day khong con mot
  // co trang thai rong hon vong doi hop nao phai giu dung bo nua.
  const toggleTrigger = useRef<HTMLButtonElement>(null);
  const intent = useFocusIntent();

  const mutation = useMutation({
    mutationFn: settingsApi.setAutoSend,
    onSuccess: ({ autoSend }) => {
      queryClient.setQueryData<SettingsSummary>(['settings-summary'], (current) =>
        current ? { ...current, autoSend } : current,
      );
      void queryClient.invalidateQueries({ queryKey: ['config'] });
      void queryClient.invalidateQueries({ queryKey: ['settings-audit'] });
      setConfirming(false);
    },
  });

  const policy = summary.orderAutomation;
  const live = summary.autoSend && Boolean(policy?.enabled);
  // Khoa tieu diem doi theo TRANG THAI, khong theo tung lan nap lai: sau khi doi cong tac thanh
  // cong thi su chu y quay ve dung khoi trang thai vua doi.
  useFocusOnKey(workHeading, `automation:${summary.autoSend ? 'on' : 'off'}`, intent);

  const statusTitle = live
    ? 'Hệ thống đang được phép tự gửi xác nhận'
    : summary.autoSend
      ? 'Công tắc đang bật nhưng chính sách của khách đang tắt'
      : 'Mọi đơn đều chuyển Sale trước khi gửi';

  return (
    <div className="settings-section-stack">
      <header className="settings-section-heading">
        <div>
          <p className="settings-eyebrow">Công tắc an toàn</p>
          <h2>Tự động hóa</h2>
          <p>Khi nào hệ thống tự trả lời khách, khi nào chuyển việc cho người.</p>
        </div>
      </header>

      <SettingsStatusBar
        tone={live ? 'attention' : 'ok'}
        title={statusTitle}
        detail={
          policy
            ? `Chỉ đơn đủ dữ liệu và có tổng số lượng ≤ ${policy.maxAutoConfirmQuantity} sản phẩm mới tự gửi.`
            : 'Khách chưa có chính sách hợp lệ nên hệ thống không tự gửi bất kỳ đơn nào.'
        }
        facts={[
          { label: 'Tự gửi', value: summary.autoSend ? 'BẬT' : 'TẮT' },
          {
            label: 'Chính sách của khách',
            value: policy ? (policy.enabled ? 'Bật' : 'Tắt') : 'Chưa cấu hình',
          },
        ]}
      />

      <SettingsWorkCard
        eyebrow="Việc có thể làm ở đây"
        title={summary.autoSend ? 'Tắt tự gửi xác nhận' : 'Bật tự gửi xác nhận'}
        problem={
          summary.autoSend
            ? 'Tắt xong, mọi đơn — kể cả đơn nhỏ và đủ dữ liệu — đều chờ Sale duyệt trước khi gửi. Đơn đã gửi trước đó không bị thu hồi.'
            : 'Bật xong, đơn đủ dữ liệu và trong ngưỡng của khách sẽ được gửi ngay mà không chờ Sale. Đơn vượt ngưỡng vẫn chuyển Sale.'
        }
        tone={summary.autoSend ? 'attention' : 'ok'}
        headingId="settings-automation-work"
        headingRef={workHeading}
        actions={
          <SettingsActionRow
            primary={
              <button
                type="button"
                ref={toggleTrigger}
                className={`settings-button ${
                  summary.autoSend ? 'settings-button--danger' : 'settings-button--primary'
                }`}
                disabled={mutation.isPending}
                onClick={() => setConfirming(true)}
              >
                {summary.autoSend ? 'Tắt tự gửi' : 'Bật tự gửi'}
              </button>
            }
            blockedReason={
              policy
                ? undefined
                : 'Khách chưa có chính sách tự xác nhận hợp lệ, nên bật công tắc cũng không có đơn nào được tự gửi.'
            }
          />
        }
      >
        <p className="settings-muted">
          Khởi động lại hệ thống sẽ quay về giá trị của môi trường; mặc định là tắt. Sau mỗi lần
          gửi, đơn vẫn nằm trong hàng việc cho tới khi Sale nhập vào phần mềm bán hàng.
        </p>
      </SettingsWorkCard>

      <SettingsAdvanced title="Ba điều kiện hệ thống luôn kiểm trước khi tự gửi" hint="3 điều kiện">
        <div className="settings-guard-grid">
          <article>
            <span>01</span>
            <strong>Chính sách của khách</strong>
            <p>
              {policy
                ? `Đang cấu hình ${policy.enabled ? 'bật' : 'tắt'}, ngưỡng ≤ ${policy.maxAutoConfirmQuantity} sản phẩm.`
                : 'Chưa cấu hình; hệ thống không tự gửi.'}
            </p>
          </article>
          <article>
            <span>02</span>
            <strong>Đúng kênh nguồn</strong>
            <p>Phản hồi luôn đi ra đúng kênh Zalo đã nhận được tin.</p>
          </article>
          <article>
            <span>03</span>
            <strong>Việc còn lại của Sale</strong>
            <p>Đơn đã gửi vẫn nằm trong hàng việc đến khi Sale nhập vào phần mềm bán hàng.</p>
          </article>
        </div>
      </SettingsAdvanced>

      {mutation.error && (
        <SettingsPanelState
          tone="error"
          title="Chưa cập nhật được Tự gửi"
          detail={`${mutation.error.message}. Trạng thái an toàn hiện vẫn là ${summary.autoSend ? 'bật' : 'tắt'}.`}
        />
      )}

      {confirming && (
        <SettingsFocusModal
          title={summary.autoSend ? 'Tắt tự gửi xác nhận?' : 'Bật tự gửi xác nhận?'}
          description={
            summary.autoSend
              ? 'Từ ngay sau khi tắt, mọi đơn đều chờ Sale duyệt. Đây là trạng thái an toàn nhất.'
              : 'Từ ngay sau khi bật, đơn đủ dữ liệu và trong ngưỡng sẽ được gửi cho khách mà không chờ người duyệt.'
          }
          confirmLabel={summary.autoSend ? 'Tắt tự gửi' : 'Bật tự gửi'}
          tone={summary.autoSend ? 'danger' : 'primary'}
          pending={mutation.isPending}
          returnFocus={() => toggleTrigger.current}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            // Doi cong tac la mot lan CHUYEN VIEC do nguoi van hanh gay ra: xong thi su chu y phai
            // ve dung khoi trang thai vua doi. Mo hop thoai thi khong — mo hop khong doi viec gi.
            intent.requestFocus();
            mutation.mutate(!summary.autoSend);
          }}
        >
          <ul className="settings-confirmation">
            <li>
              Ảnh hưởng từ: <strong>đơn tiếp theo</strong>. Đơn đã gửi không thay đổi.
            </li>
            <li>
              Hoàn tác: bấm lại công tắc này bất cứ lúc nào; hệ thống ghi lại vào lịch sử thay đổi.
            </li>
          </ul>
        </SettingsFocusModal>
      )}
    </div>
  );
}
