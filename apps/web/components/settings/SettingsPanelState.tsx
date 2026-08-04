import type { ReactNode } from 'react';

type Props = {
  title: string;
  detail: string;
  // `success` bo sung 04/08/2026: truoc do chi co neutral/error nen MOI thao tac ghi thanh cong
  // deu im lang — nguoi van hanh khong biet he thong da ghi nhan cau hinh hay chua.
  tone?: 'neutral' | 'error' | 'success';
  action?: ReactNode;
};

export function SettingsPanelState({ title, detail, tone = 'neutral', action }: Props) {
  return (
    <div
      className={`settings-state settings-state--${tone}`}
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={tone === 'error' ? undefined : 'polite'}
    >
      <span className="settings-state__mark" aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
      {action && <div className="settings-state__action">{action}</div>}
    </div>
  );
}
