import React from 'react';
import type { AgentGroup } from '../../services/types';
import { StatusBadge } from './StatusBadge';

interface AgentCardProps {
  readonly agent: AgentGroup;
  readonly onSelect: (id: AgentGroup['id']) => void;
}

export function AgentCard({ agent, onSelect }: AgentCardProps) {
  const availableCount = agent.capabilities.filter((c) => c.status === 'AVAILABLE').length;
  const demoCount = agent.capabilities.filter((c) => c.status === 'DEMO').length;
  const plannedCount = agent.capabilities.filter((c) => c.status === 'PLANNED').length;

  return (
    <article className="wf-agent-card" tabIndex={0} onClick={() => onSelect(agent.id)}>
      <div className="wf-agent-card__top">
        <div className="wf-agent-card__identity">
          <span className={`wf-agent-avatar wf-agent-avatar--${agent.id}`}>
            {agent.code}
          </span>
          <div>
            <h4 className="wf-agent-card__name">{agent.name}</h4>
            <span className="wf-agent-card__title">{agent.title}</span>
          </div>
        </div>
        <StatusBadge status={agent.status} />
      </div>

      <p className="wf-agent-card__desc">{agent.roleDescription}</p>

      <div className="wf-agent-card__metrics">
        <div className="wf-metric-pill">
          <span className="wf-metric-pill__val">{agent.activeTasksToday}</span>
          <span className="wf-metric-pill__lbl">Tác vụ hôm nay</span>
        </div>
        <div className="wf-metric-pill">
          <span className="wf-metric-pill__val">{agent.latencyMs}ms</span>
          <span className="wf-metric-pill__lbl">Độ trễ TB</span>
        </div>
        <div className="wf-metric-pill">
          <span className="wf-metric-pill__val">{agent.capabilities.length}</span>
          <span className="wf-metric-pill__lbl">Năng lực</span>
        </div>
      </div>

      <div className="wf-agent-card__caps">
        <span className="wf-cap-tag wf-cap-tag--avail">{availableCount} Sẵn sàng</span>
        <span className="wf-cap-tag wf-cap-tag--demo">{demoCount} Đang cấu hình</span>
        {plannedCount > 0 && (
          <span className="wf-cap-tag wf-cap-tag--plan">{plannedCount} Định hướng</span>
        )}
      </div>

      <div className="wf-agent-card__footer">
        <span className="wf-agent-card__cta">
          Xem chi tiết năng lực & hoạt động <span aria-hidden="true">→</span>
        </span>
      </div>
    </article>
  );
}
