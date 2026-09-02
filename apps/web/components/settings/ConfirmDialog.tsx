'use client';

import { useEffect, useRef } from 'react';
import type { HighImpactConfirmation } from '../../lib/price-period-view';

/**
 * Hop xac nhan cho thao tac co hau qua that.
 *
 * `window.confirm` cua trinh duyet chi nhet duoc mot chuoi, nen ban cu phai gop ca bon dieu can
 * noi vao mot cau dai — va thuc te nguoi ta bam OK ma khong doc. O day bon cau tra loi bat buoc
 * cua #117 §5 la bon dong rieng: doi gi, tu khi nao, anh huong don nao, hoan tac the nao.
 *
 * Tieu diem vao nut HUY khi mo (khong phai nut xac nhan): mot phim Enter lo tay khong duoc bien
 * thanh mot lan luu tru bang gia.
 */

type Props = {
  confirmation: HighImpactConfirmation;
  pending?: boolean;
  tone?: 'danger' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  confirmation,
  pending = false,
  tone = 'danger',
  onConfirm,
  onCancel,
}: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pending) {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== 'Tab') return;
      // Giu tieu diem trong hop: Tab tu nut cuoi quay ve nut dau, khong roi ra trang phia sau.
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled)');
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancel, pending]);

  return (
    <div className="settings-dialog-backdrop">
      <div
        ref={dialogRef}
        className="settings-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
        aria-describedby="settings-dialog-body"
      >
        <h3 id="settings-dialog-title">{confirmation.title}</h3>
        <dl id="settings-dialog-body" className="settings-dialog__facts">
          <dt>Bạn đang thay đổi gì?</dt>
          <dd>{confirmation.whatChanges}</dd>
          <dt>Có hiệu lực từ khi nào?</dt>
          <dd>{confirmation.effectiveFrom}</dd>
          <dt>Ảnh hưởng đến đơn hàng nào?</dt>
          <dd>{confirmation.affectedOrders}</dd>
          <dt>Có thể hoàn tác thế nào?</dt>
          <dd>{confirmation.howToUndo}</dd>
        </dl>
        <div className="settings-dialog__actions">
          <button
            ref={cancelRef}
            type="button"
            className="settings-button settings-button--quiet"
            disabled={pending}
            onClick={onCancel}
          >
            Để sau
          </button>
          <button
            type="button"
            className={`settings-button settings-button--${tone}`}
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? 'Đang thực hiện…' : confirmation.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
