import React, { useState } from 'react';
import type { HourlyActivityPoint } from '../../fixtures/activities';

interface ActivityChartProps {
  readonly data: readonly HourlyActivityPoint[];
}

export function ActivityChart({ data }: ActivityChartProps) {
  const [activeHour, setActiveHour] = useState<string | null>(null);

  const maxTotal = Math.max(...data.map((d) => d.total), 40);
  const activePoint = data.find((d) => d.hour === activeHour) ?? data[data.length - 2] ?? data[0];

  return (
    <div className="wf-activity-chart">
      <div className="wf-activity-chart__header">
        <div>
          <h3 className="wf-activity-chart__title">Khối lượng tác vụ xử lý theo giờ</h3>
          <p className="wf-activity-chart__subtitle">Phân bổ thông lượng xử lý của 6 nhóm Agent trong ngày</p>
        </div>
        {activePoint && (
          <div className="wf-activity-chart__legend">
            <span className="wf-legend-tag wf-legend-tag--exec">Điều hành: {activePoint.executive}</span>
            <span className="wf-legend-tag wf-legend-tag--sales">Kinh doanh: {activePoint.commercial}</span>
            <span className="wf-legend-tag wf-legend-tag--fin">Pháp chế & KT: {activePoint.legalFinance}</span>
            <span className="wf-legend-tag wf-legend-tag--mfg">Sản xuất: {activePoint.manufacturing}</span>
            <span className="wf-legend-tag wf-legend-tag--strat">Cố vấn: {activePoint.strategic}</span>
          </div>
        )}
      </div>

      <div className="wf-activity-chart__bars" role="region" aria-label="Biểu đồ cột khối lượng tác vụ">
        {data.map((point) => {
          const heightPercent = Math.round((point.total / maxTotal) * 100);
          const isSelected = activeHour === point.hour;

          return (
            <div
              key={point.hour}
              className={`wf-chart-col ${isSelected ? 'wf-chart-col--active' : ''}`}
              onMouseEnter={() => setActiveHour(point.hour)}
              onClick={() => setActiveHour(point.hour)}
              tabIndex={0}
              role="button"
              aria-label={`${point.hour}: ${point.total} tác vụ`}
            >
              <div className="wf-chart-bar-container">
                <div
                  className="wf-chart-bar-stack"
                  style={{ height: `${heightPercent}%` }}
                >
                  <div
                    className="wf-bar-segment wf-bar-segment--strat"
                    style={{ flex: point.strategic }}
                    title={`Cố vấn: ${point.strategic}`}
                  />
                  <div
                    className="wf-bar-segment wf-bar-segment--mfg"
                    style={{ flex: point.manufacturing }}
                    title={`Sản xuất: ${point.manufacturing}`}
                  />
                  <div
                    className="wf-bar-segment wf-bar-segment--fin"
                    style={{ flex: point.legalFinance }}
                    title={`Pháp chế & KT: ${point.legalFinance}`}
                  />
                  <div
                    className="wf-bar-segment wf-bar-segment--sales"
                    style={{ flex: point.commercial }}
                    title={`Kinh doanh: ${point.commercial}`}
                  />
                  <div
                    className="wf-bar-segment wf-bar-segment--exec"
                    style={{ flex: point.executive }}
                    title={`Điều hành: ${point.executive}`}
                  />
                </div>
              </div>
              <span className="wf-chart-label">{point.hour}</span>
              <span className="wf-chart-val">{point.total}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
