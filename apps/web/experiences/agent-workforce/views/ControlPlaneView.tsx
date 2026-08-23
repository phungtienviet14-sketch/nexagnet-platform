'use client';

import React, { useEffect, useState } from 'react';
import type { HourlyActivityPoint, WorkforceSummaryStats } from '../fixtures/activities';
import { useAlertClient, useWorkforceClient } from '../services/client-context';
import type { AgentGroup, AgentGroupId, SmartAlert } from '../services/types';
import { ActivityChart } from './components/ActivityChart';
import { AgentCard } from './components/AgentCard';
import { KpiCard } from './components/KpiCard';
import { StatusBadge } from './components/StatusBadge';

interface ControlPlaneViewProps {
  readonly onNavigateToDirectory: (agentId?: AgentGroupId) => void;
  readonly onNavigateToAlerts: (alertId?: string) => void;
  readonly onNavigateToAssistant: () => void;
  readonly onNavigateToOperations: () => void;
}

export function ControlPlaneView({
  onNavigateToDirectory,
  onNavigateToAlerts,
  onNavigateToAssistant,
  onNavigateToOperations,
}: ControlPlaneViewProps) {
  const workforceClient = useWorkforceClient();
  const alertClient = useAlertClient();

  const [agents, setAgents] = useState<readonly AgentGroup[]>([]);
  const [stats, setStats] = useState<WorkforceSummaryStats | null>(null);
  const [activities, setActivities] = useState<readonly HourlyActivityPoint[]>([]);
  const [alerts, setAlerts] = useState<readonly SmartAlert[]>([]);

  useEffect(() => {
    let isMounted = true;
    Promise.all([
      workforceClient.getAgentGroups(),
      workforceClient.getWorkforceSummary(),
      workforceClient.getHourlyActivities(),
      alertClient.getAlerts(),
    ]).then(([ag, st, act, al]) => {
      if (!isMounted) return;
      setAgents(ag);
      setStats(st);
      setActivities(act);
      setAlerts(al);
    });
    return () => {
      isMounted = false;
    };
  }, [workforceClient, alertClient]);

  const openAlerts = alerts.filter((a) => a.status !== 'resolved');

  return (
    <div className="wf-view wf-control-plane">
      {/* Hero Header */}
      <section className="wf-hero-banner">
        <div className="wf-hero-banner__text">
          <span className="wf-hero-banner__eyebrow">BÀN ĐIỀU KHIỂN TỔNG THỂ</span>
          <h2 className="wf-hero-banner__title">Control Plane Overview</h2>
          <p className="wf-hero-banner__desc">
            Giám sát 6 nhóm Agent, thông lượng tác vụ và các điểm nghẽn nghiệp vụ cần phê duyệt.
          </p>
        </div>
        <div className="wf-hero-banner__quick-actions">
          <button
            type="button"
            className="wf-btn wf-btn--primary"
            onClick={onNavigateToAssistant}
          >
            <span aria-hidden="true">💬</span> Trợ lý điều hành
          </button>
          <button
            type="button"
            className="wf-btn wf-btn--secondary"
            onClick={() => onNavigateToAlerts()}
          >
            <span aria-hidden="true">🔔</span> Hòm thư Cảnh báo ({openAlerts.length})
          </button>
        </div>
      </section>

      {/* Section A: Operational Summary KPIs */}
      <section className="wf-kpi-grid" aria-label="Các chỉ số vận hành chính">
        <KpiCard
          title="Agent hoạt động"
          value={`${stats?.activeAgentsCount ?? 6} / ${stats?.totalAgentsCount ?? 6}`}
          subtext="6 nhóm Agent trực tuyến"
          tone="success"
          onClick={() => onNavigateToDirectory()}
        />
        <KpiCard
          title="Tác vụ hôm nay"
          value={stats?.totalTasksToday ?? 1482}
          subtext="+24% so với trung bình tuần"
          tone="primary"
        />
        <KpiCard
          title="Cần con người xử lý"
          value={openAlerts.length}
          subtext={`${alerts.filter((a) => a.severity === 'critical' && a.status !== 'resolved').length} khẩn cấp · ${alerts.filter((a) => a.severity === 'warning' && a.status !== 'resolved').length} cảnh báo`}
          tone={openAlerts.length > 0 ? 'warning' : 'success'}
          onClick={() => onNavigateToAlerts()}
        />
        <KpiCard
          title="Nguồn dữ liệu"
          value={`${stats?.connectedDataSourcesCount ?? 5} / ${stats?.totalDataSourcesCount ?? 8}`}
          subtext="3 cổng roadmap ERP / CRM"
          tone="neutral"
          onClick={onNavigateToOperations}
        />
      </section>

      {/* Split Section: Activity Chart + Human Attention Queue */}
      <section className="wf-section-split">
        {/* Section B: Activity Chart */}
        <div className="wf-section-split__main">
          {activities.length > 0 ? (
            <ActivityChart data={activities} />
          ) : (
            <div className="wf-empty-box">Đang tải dữ liệu hoạt động...</div>
          )}
        </div>

        {/* Section D: Human Attention Queue */}
        <div className="wf-section-split__side">
          <div className="wf-attention-queue">
            <div className="wf-attention-queue__header">
              <div>
                <h3 className="wf-attention-queue__title">Cần bạn xử lý</h3>
                <span className="wf-activity-chart__subtitle">Cảnh báo & phê duyệt ưu tiên</span>
              </div>
              <span className="wf-count-badge">{openAlerts.length}</span>
            </div>

            <div className="wf-attention-queue__list">
              {openAlerts.slice(0, 4).map((alert) => (
                <div
                  key={alert.id}
                  className={`wf-attention-item wf-attention-item--${alert.severity}`}
                  tabIndex={0}
                  onClick={() => onNavigateToAlerts(alert.id)}
                  role="button"
                >
                  <div className="wf-attention-item__top">
                    <StatusBadge status={alert.severity} size="sm" />
                    <span className="wf-attention-item__agent">{alert.sourceAgent}</span>
                  </div>
                  <h4 className="wf-attention-item__title">{alert.title}</h4>
                  <p className="wf-attention-item__summary">{alert.summary}</p>
                  <div className="wf-attention-item__footer">
                    <span className="wf-attention-item__time">{alert.createdAt}</span>
                    <span className="wf-attention-item__action">
                      Xử lý ngay <span aria-hidden="true">→</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              className="wf-btn wf-btn--secondary wf-btn--sm"
              onClick={() => onNavigateToAlerts()}
            >
              Xem toàn bộ cảnh báo →
            </button>
          </div>
        </div>
      </section>

      {/* Section C: Workforce Status (6 Agent Groups) */}
      <section className="wf-workforce-section" aria-labelledby="workforce-title">
        <div className="wf-section-header">
          <div>
            <h3 id="workforce-title" className="wf-section-title">
              Đội ngũ 6 Agent chuyên trách
            </h3>
            <p className="wf-section-desc">
              Chuyên trách theo phòng ban, phối hợp tác vụ qua hệ thống điều phối chung.
            </p>
          </div>
          <button
            type="button"
            className="wf-btn wf-btn--secondary wf-btn--sm"
            onClick={() => onNavigateToDirectory()}
          >
            Khám phá 34 năng lực →
          </button>
        </div>

        <div className="wf-agents-grid">
          {agents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              onSelect={(id) => onNavigateToDirectory(id)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
