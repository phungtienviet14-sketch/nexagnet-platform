import type { ReactNode } from 'react';

type Props = {
  title: string;
  detail: string;
  tone?: 'neutral' | 'error';
  action?: ReactNode;
};

export function SettingsPanelState({ title, detail, tone = 'neutral', action }: Props) {
  return (
    <div
      className={`settings-state settings-state--${tone}`}
      role={tone === 'error' ? 'alert' : 'status'}
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
