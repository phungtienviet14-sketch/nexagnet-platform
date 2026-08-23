'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useWorkforceClient } from '../services/client-context';
import type { AgentGroup, AgentGroupId, CapabilityStatus } from '../services/types';
import { StatusBadge } from './components/StatusBadge';

interface DirectoryViewProps {
  readonly initialAgentId?: AgentGroupId;
  readonly onSelectAgent: (id: AgentGroupId) => void;
  readonly onOpenAssistantWithPrompt?: (prompt: string) => void;
  readonly onOpenAlertsForAgent?: (agentId: AgentGroupId) => void;
}

export function DirectoryView({
  initialAgentId = 'executive',
  onSelectAgent,
  onOpenAssistantWithPrompt,
  onOpenAlertsForAgent,
}: DirectoryViewProps) {
  const workforceClient = useWorkforceClient();
  const [agents, setAgents] = useState<readonly AgentGroup[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<AgentGroupId>(initialAgentId);
  const [statusFilter, setStatusFilter] = useState<'ALL' | CapabilityStatus>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'capabilities' | 'activity' | 'tools'>('capabilities');

  useEffect(() => {
    let isMounted = true;
    workforceClient.getAgentGroups().then((res) => {
      if (isMounted) setAgents(res);
    });
    return () => {
      isMounted = false;
    };
  }, [workforceClient]);

  useEffect(() => {
    if (initialAgentId) {
      setSelectedAgentId(initialAgentId);
    }
  }, [initialAgentId]);

  const selectedAgent = useMemo(() => {
    return agents.find((a) => a.id === selectedAgentId) ?? agents[0];
  }, [agents, selectedAgentId]);

  const filteredCapabilities = useMemo(() => {
    if (!selectedAgent) return [];
    return selectedAgent.capabilities.filter((cap) => {
      const matchStatus = statusFilter === 'ALL' || cap.status === statusFilter;
      const matchSearch =
        searchQuery.trim() === '' ||
        cap.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        cap.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        cap.category.toLowerCase().includes(searchQuery.toLowerCase());
      return matchStatus && matchSearch;
    });
  }, [selectedAgent, statusFilter, searchQuery]);

  const totalCapabilitiesCount = agents.reduce((sum, a) => sum + a.capabilities.length, 0);
  const availableCaps = agents.flatMap((a) => a.capabilities).filter((c) => c.status === 'AVAILABLE').length;
  const demoCaps = agents.flatMap((a) => a.capabilities).filter((c) => c.status === 'DEMO').length;
  const plannedCaps = agents.flatMap((a) => a.capabilities).filter((c) => c.status === 'PLANNED').length;

  return (
    <div className="wf-view wf-directory">
      {/* Header Banner */}
      <section className="wf-directory-hero">
        <div>
          <span className="wf-hero-banner__eyebrow">DANH BẠ NĂNG LỰC</span>
          <h2 className="wf-directory-hero__title">AI Workforce Directory</h2>
          <p className="wf-directory-hero__desc">
            Quản trị 6 nhóm Agent với 34 năng lực chuyên biệt phân theo phòng ban và mức độ sẵn sàng.
          </p>
        </div>
        <div className="wf-cap-summary-pills">
          <div className="wf-summary-stat">
            <span className="wf-summary-stat__val">{totalCapabilitiesCount}</span>
            <span className="wf-summary-stat__lbl">Tổng số</span>
          </div>
          <div className="wf-summary-stat">
            <span className="wf-summary-stat__val wf-summary-stat__val--avail">{availableCaps}</span>
            <span className="wf-summary-stat__lbl">Sẵn sàng</span>
          </div>
          <div className="wf-summary-stat">
            <span className="wf-summary-stat__val wf-summary-stat__val--demo">{demoCaps}</span>
            <span className="wf-summary-stat__lbl">Đang cấu hình</span>
          </div>
          <div className="wf-summary-stat">
            <span className="wf-summary-stat__val wf-summary-stat__val--plan">{plannedCaps}</span>
            <span className="wf-summary-stat__lbl">Định hướng</span>
          </div>
        </div>
      </section>

      {/* Directory Layout: Agent Sidebar Selector + Detail Pane */}
      <div className="wf-directory-layout">
        {/* Left Side: Agent Selection List */}
        <aside className="wf-directory-sidebar" aria-label="Danh sách 6 nhóm Agent">
          <h3 className="wf-sidebar-heading">Chọn nhóm Agent</h3>
          <div className="wf-agent-select-list" role="tablist">
            {agents.map((agent) => {
              const isSelected = agent.id === selectedAgentId;
              return (
                <button
                  key={agent.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  className={`wf-agent-select-btn ${isSelected ? 'wf-agent-select-btn--active' : ''}`}
                  onClick={() => {
                    setSelectedAgentId(agent.id);
                    onSelectAgent(agent.id);
                  }}
                >
                  <span className={`wf-agent-avatar wf-agent-avatar--${agent.id}`}>
                    {agent.code}
                  </span>
                  <div className="wf-agent-select-text">
                    <div className="wf-agent-select-name">{agent.name}</div>
                    <div className="wf-agent-select-sub">
                      {agent.capabilities.length} năng lực · {agent.activeTasksToday} việc
                    </div>
                  </div>
                  <span className="wf-agent-select-status">
                    <StatusBadge status={agent.status} size="sm" />
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Right Side: Selected Agent Detail & Capabilities */}
        {selectedAgent && (
          <main className="wf-directory-detail" aria-labelledby="agent-detail-name">
            {/* Detail Hero */}
            <div className="wf-agent-detail-header">
              <div className="wf-agent-detail-identity">
                <span className={`wf-agent-avatar wf-agent-avatar--lg wf-agent-avatar--${selectedAgent.id}`}>
                  {selectedAgent.code}
                </span>
                <div>
                  <div className="wf-agent-detail-row">
                    <h3 id="agent-detail-name" className="wf-agent-detail-name">
                      {selectedAgent.name}
                    </h3>
                    <StatusBadge status={selectedAgent.status} size="md" />
                  </div>
                  <span className="wf-agent-detail-title">{selectedAgent.title}</span>
                  <p className="wf-agent-detail-desc">{selectedAgent.roleDescription}</p>
                </div>
              </div>

              <div className="wf-agent-detail-actions">
                {onOpenAssistantWithPrompt && (
                  <button
                    type="button"
                    className="wf-btn wf-btn--primary wf-btn--sm"
                    onClick={() =>
                      onOpenAssistantWithPrompt(`Tư vấn cho tôi về năng lực và dữ liệu của ${selectedAgent.name}`)
                    }
                  >
                    💬 Hội thoại với {selectedAgent.code}
                  </button>
                )}
                {onOpenAlertsForAgent && (
                  <button
                    type="button"
                    className="wf-btn wf-btn--secondary wf-btn--sm"
                    onClick={() => onOpenAlertsForAgent(selectedAgent.id)}
                  >
                    🔔 Cảnh báo ({selectedAgent.code})
                  </button>
                )}
              </div>
            </div>

            {/* Quick Metrics Bar */}
            <div className="wf-agent-detail-metrics">
              <div className="wf-detail-metric">
                <span className="wf-detail-metric__val">{selectedAgent.activeTasksToday}</span>
                <span className="wf-detail-metric__lbl">Tác vụ hôm nay</span>
              </div>
              <div className="wf-detail-metric">
                <span className="wf-detail-metric__val">{selectedAgent.latencyMs} ms</span>
                <span className="wf-detail-metric__lbl">Độ trễ TB</span>
              </div>
              <div className="wf-detail-metric">
                <span className="wf-detail-metric__val">{selectedAgent.capabilities.length}</span>
                <span className="wf-detail-metric__lbl">Năng lực</span>
              </div>
              <div className="wf-detail-metric">
                <span className="wf-detail-metric__val">{selectedAgent.tools.length}</span>
                <span className="wf-detail-metric__lbl">MCP Tools</span>
              </div>
            </div>

            {/* Tabs Bar */}
            <div className="wf-detail-tabs-bar">
              <div className="wf-detail-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'capabilities'}
                  className={`wf-detail-tab ${activeTab === 'capabilities' ? 'wf-detail-tab--active' : ''}`}
                  onClick={() => setActiveTab('capabilities')}
                >
                  Năng lực ({selectedAgent.capabilities.length})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'activity'}
                  className={`wf-detail-tab ${activeTab === 'activity' ? 'wf-detail-tab--active' : ''}`}
                  onClick={() => setActiveTab('activity')}
                >
                  Nhật ký hoạt động
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'tools'}
                  className={`wf-detail-tab ${activeTab === 'tools' ? 'wf-detail-tab--active' : ''}`}
                  onClick={() => setActiveTab('tools')}
                >
                  Công cụ & Nguồn dữ liệu
                </button>
              </div>

              {activeTab === 'capabilities' && (
                <div className="wf-capabilities-filter-bar">
                  <input
                    type="search"
                    className="wf-search-input"
                    placeholder="Tìm kiếm năng lực..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    aria-label="Tìm kiếm năng lực"
                  />
                  <div className="wf-filter-buttons" role="group" aria-label="Lọc trạng thái năng lực">
                    <button
                      type="button"
                      className={`wf-filter-chip ${statusFilter === 'ALL' ? 'wf-filter-chip--active' : ''}`}
                      onClick={() => setStatusFilter('ALL')}
                    >
                      Tất cả ({selectedAgent.capabilities.length})
                    </button>
                    <button
                      type="button"
                      className={`wf-filter-chip ${statusFilter === 'AVAILABLE' ? 'wf-filter-chip--active' : ''}`}
                      onClick={() => setStatusFilter('AVAILABLE')}
                    >
                      Sẵn sàng ({selectedAgent.capabilities.filter((c) => c.status === 'AVAILABLE').length})
                    </button>
                    <button
                      type="button"
                      className={`wf-filter-chip ${statusFilter === 'DEMO' ? 'wf-filter-chip--active' : ''}`}
                      onClick={() => setStatusFilter('DEMO')}
                    >
                      Đang cấu hình ({selectedAgent.capabilities.filter((c) => c.status === 'DEMO').length})
                    </button>
                    <button
                      type="button"
                      className={`wf-filter-chip ${statusFilter === 'PLANNED' ? 'wf-filter-chip--active' : ''}`}
                      onClick={() => setStatusFilter('PLANNED')}
                    >
                      Định hướng ({selectedAgent.capabilities.filter((c) => c.status === 'PLANNED').length})
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Tab 1: Capabilities Grid */}
            {activeTab === 'capabilities' && (
              <div className="wf-capabilities-grid">
                {filteredCapabilities.length > 0 ? (
                  filteredCapabilities.map((cap) => (
                    <div key={cap.id} className="wf-capability-card">
                      <div className="wf-capability-card__header">
                        <span className="wf-capability-card__category">{cap.category}</span>
                        <StatusBadge status={cap.status} size="sm" />
                      </div>
                      <h4 className="wf-capability-card__name">{cap.name}</h4>
                      <p className="wf-capability-card__desc">{cap.description}</p>
                      {cap.readinessNote && (
                        <div className="wf-capability-card__note">
                          <span className="wf-note-icon" aria-hidden="true">ℹ</span>
                          <span>{cap.readinessNote}</span>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="wf-empty-box">
                    Không tìm thấy năng lực phù hợp với bộ lọc.
                  </div>
                )}
              </div>
            )}

            {/* Tab 2: Activity Logs */}
            {activeTab === 'activity' && (
              <div className="wf-activity-log-pane">
                <h4 className="wf-sub-heading">Nhật ký tác vụ gần đây</h4>
                <div className="wf-log-list">
                  {selectedAgent.recentLogs.map((log, idx) => (
                    <div key={idx} className="wf-log-item">
                      <span className="wf-log-time">{log.time}</span>
                      <span className={`wf-log-dot wf-log-dot--${log.status}`} aria-hidden="true" />
                      <span className="wf-log-event">{log.event}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tab 3: Tools & Data Sources */}
            {activeTab === 'tools' && (
              <div className="wf-tools-pane">
                <div className="wf-tools-section">
                  <h4 className="wf-sub-heading">Công cụ MCP chuyên trách</h4>
                  <ul className="wf-tag-list">
                    {selectedAgent.tools.map((tool) => (
                      <li key={tool} className="wf-tag-item wf-tag-item--tool">
                        <span aria-hidden="true">🛠</span> {tool}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="wf-tools-section">
                  <h4 className="wf-sub-heading">Nguồn dữ liệu kết nối</h4>
                  <ul className="wf-tag-list">
                    {selectedAgent.dataSources.map((ds) => (
                      <li key={ds} className="wf-tag-item wf-tag-item--data">
                        <span aria-hidden="true">🗄</span> {ds}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </main>
        )}
      </div>
    </div>
  );
}
