import React from 'react';
import type { HourlyActivityPoint } from '../../fixtures/activities';
import type { AlertSeverity, SmartAlert } from '../../services/types';

interface OverviewChartsProps {
  readonly activities: readonly HourlyActivityPoint[];
  readonly alerts: readonly SmartAlert[];
}

interface AgentLoad {
  readonly label: string;
  readonly value: number;
  readonly tone: 'executive' | 'commercial' | 'legal-finance' | 'manufacturing' | 'strategic';
}

interface AttentionSummary {
  readonly severity: AlertSeverity;
  readonly label: string;
  readonly value: number;
}

const AGENT_LOADS = [
  { label: 'Điều hành', field: 'executive', tone: 'executive' },
  { label: 'Kinh doanh', field: 'commercial', tone: 'commercial' },
  { label: 'Pháp chế & KT', field: 'legalFinance', tone: 'legal-finance' },
  { label: 'Sản xuất', field: 'manufacturing', tone: 'manufacturing' },
  { label: 'Cố vấn', field: 'strategic', tone: 'strategic' },
] as const;

const ATTENTION_LABELS: Readonly<Record<AlertSeverity, string>> = {
  critical: 'Khẩn cấp',
  warning: 'Cảnh báo',
  info: 'Theo dõi',
};

function formatCoordinate(value: number): string {
  return String(Math.round(value * 10) / 10);
}

export function createTrendPoints(
  data: readonly HourlyActivityPoint[],
  width: number,
  height: number,
): string {
  const peak = Math.max(...data.map((point) => point.total), 1);
  const step = data.length > 1 ? width / (data.length - 1) : 0;

  return data
    .map((point, index) => {
      const x = formatCoordinate(index * step);
      const y = formatCoordinate(height - (point.total / peak) * height);
      return `${x},${y}`;
    })
    .join(' ');
}

export function summarizeAgentLoads(data: readonly HourlyActivityPoint[]): readonly AgentLoad[] {
  return AGENT_LOADS.map(({ label, field, tone }) => ({
    label,
    value: data.reduce((total, point) => total + point[field], 0),
    tone,
  }));
}

export function summarizeAttention(alerts: readonly SmartAlert[]): readonly AttentionSummary[] {
  const unresolved = alerts.filter((alert) => alert.status !== 'resolved');
  return (['critical', 'warning', 'info'] as const).map((severity) => ({
    severity,
    label: ATTENTION_LABELS[severity],
    value: unresolved.filter((alert) => alert.severity === severity).length,
  }));
}

export function OverviewCharts({ activities, alerts }: OverviewChartsProps) {
  const [firstActivity] = activities;
  if (!firstActivity) return null;

  const peak = activities.reduce((currentPeak, point) => (
    point.total > currentPeak.total ? point : currentPeak
  ), firstActivity);
  const trendPoints = createTrendPoints(activities, 520, 116);
  const trendCoordinates = trendPoints.split(' ');
  const loads = summarizeAgentLoads(activities);
  const maxLoad = Math.max(...loads.map((load) => load.value), 1);
  const attention = summarizeAttention(alerts);
  const attentionTotal = attention.reduce((total, item) => total + item.value, 0);

  return (
    <section className="wf-overview-charts" aria-labelledby="overview-charts-title">
      <div className="wf-overview-charts__heading">
        <div>
          <p className="wf-overview-charts__eyebrow">TÍN HIỆU VẬN HÀNH</p>
          <h3 id="overview-charts-title" className="wf-overview-charts__title">Phân tích nhanh trong ngày</h3>
        </div>
        <span className="wf-overview-charts__meta">Cập nhật theo luồng tác vụ hiện tại</span>
      </div>

      <div className="wf-overview-charts__grid">
        <figure className="wf-overview-card wf-overview-card--trend">
          <figcaption className="wf-overview-card__header">
            <div>
              <h4>Nhịp xử lý theo giờ</h4>
              <p>Đỉnh gần nhất: {peak.hour} · {peak.total} tác vụ</p>
            </div>
            <span className="wf-overview-card__metric">{activities.reduce((total, point) => total + point.total, 0)}</span>
          </figcaption>
          <svg className="wf-throughput-chart" viewBox="0 0 520 150" role="img" aria-label="Biểu đồ đường thông lượng tác vụ theo giờ">
            <line x1="0" x2="520" y1="32" y2="32" className="wf-throughput-chart__grid" />
            <line x1="0" x2="520" y1="74" y2="74" className="wf-throughput-chart__grid" />
            <line x1="0" x2="520" y1="116" y2="116" className="wf-throughput-chart__baseline" />
            <polyline points={`0,116 ${trendPoints} 520,116`} className="wf-throughput-chart__area" />
            <polyline points={trendPoints} className="wf-throughput-chart__line" />
            {activities.map((point, index) => {
              const [x, y] = (trendCoordinates[index] ?? '0,116').split(',');
              return <circle key={point.hour} cx={x} cy={y} r="3.5" className="wf-throughput-chart__point" />;
            })}
          </svg>
          <div className="wf-throughput-chart__axis" aria-hidden="true">
            {activities.map((point) => <span key={point.hour}>{point.hour.slice(0, 2)}h</span>)}
          </div>
        </figure>

        <figure className="wf-overview-card wf-overview-card--load">
          <figcaption className="wf-overview-card__header">
            <div>
              <h4>Tải theo nhóm Agent</h4>
              <p>Tỷ trọng tác vụ đã xử lý</p>
            </div>
          </figcaption>
          <div className="wf-agent-load-chart" role="list" aria-label="Phân bổ tải tác vụ theo nhóm Agent">
            {loads.map((load) => {
              const width = `${Math.round((load.value / maxLoad) * 100)}%`;
              return (
                <div key={load.tone} className="wf-agent-load-chart__row" role="listitem">
                  <div className="wf-agent-load-chart__label"><span className={`wf-agent-load-chart__dot wf-agent-load-chart__dot--${load.tone}`} />{load.label}</div>
                  <div className="wf-agent-load-chart__track"><span className={`wf-agent-load-chart__bar wf-agent-load-chart__bar--${load.tone}`} style={{ width }} /></div>
                  <strong>{load.value}</strong>
                </div>
              );
            })}
          </div>
        </figure>

        <figure className="wf-overview-card wf-overview-card--attention">
          <figcaption className="wf-overview-card__header">
            <div>
              <h4>Cơ cấu cần can thiệp</h4>
              <p>Phân loại các mục chưa đóng</p>
            </div>
            <span className="wf-overview-card__metric wf-overview-card__metric--attention">{attentionTotal}</span>
          </figcaption>
          <div className="wf-attention-chart__segments" aria-label={`${attentionTotal} cảnh báo chưa đóng`}>
            {attention.map((item) => (
              <span
                key={item.severity}
                className={`wf-attention-chart__segment wf-attention-chart__segment--${item.severity}`}
                style={{ width: attentionTotal === 0 ? '0%' : `${(item.value / attentionTotal) * 100}%` }}
              />
            ))}
          </div>
          <div className="wf-attention-chart__legend" role="list">
            {attention.map((item) => (
              <div key={item.severity} className="wf-attention-chart__item" role="listitem">
                <span className={`wf-attention-chart__marker wf-attention-chart__marker--${item.severity}`} />
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        </figure>
      </div>
    </section>
  );
}
