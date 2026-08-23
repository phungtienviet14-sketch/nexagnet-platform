import React, { type ReactNode } from 'react';

interface KpiCardProps {
  readonly title: string;
  readonly value: string | number;
  readonly subtext?: string;
  readonly icon?: ReactNode;
  readonly badge?: ReactNode;
  readonly tone?: 'primary' | 'warning' | 'success' | 'neutral';
  readonly onClick?: () => void;
}

export function KpiCard({
  title,
  value,
  subtext,
  icon,
  badge,
  tone = 'neutral',
  onClick,
}: KpiCardProps) {
  const cardClass = `wf-kpi-card wf-kpi-card--${tone} ${onClick ? 'wf-kpi-card--clickable' : ''}`;

  return (
    <div
      className={cardClass}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className="wf-kpi-card__header">
        <span className="wf-kpi-card__title">{title}</span>
        {icon && <span className="wf-kpi-card__icon">{icon}</span>}
      </div>
      <div className="wf-kpi-card__body">
        <div className="wf-kpi-card__value">{value}</div>
        {badge && <div className="wf-kpi-card__badge">{badge}</div>}
      </div>
      {subtext && <div className="wf-kpi-card__subtext">{subtext}</div>}
    </div>
  );
}
