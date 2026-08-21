'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useAlertClient } from '../services/client-context';
import type { AgentGroupId, AlertSeverity, AlertStatus, SmartAlert } from '../services/types';
import { StatusBadge } from './components/StatusBadge';

interface AlertsViewProps {
  readonly initialAlertId?: string;
  readonly onSelectAlert: (id: string) => void;
  readonly onNavigateToDoc?: (docId: string) => void;
  readonly onNavigateToAgent?: (agentId: AgentGroupId) => void;
}

export function AlertsView({
  initialAlertId,
  onSelectAlert,
  onNavigateToDoc,
  onNavigateToAgent,
}: AlertsViewProps) {
  const alertClient = useAlertClient();
  const [alerts, setAlerts] = useState<readonly SmartAlert[]>([]);
  const [selectedAlertId, setSelectedAlertId] = useState<string | undefined>(initialAlertId);
  const [severityFilter, setSeverityFilter] = useState<'ALL' | AlertSeverity>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | AlertStatus>('ALL');
  const [assigneeInput, setAssigneeInput] = useState('');
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  const fetchAlerts = () => {
    alertClient.getAlerts().then((res) => {
      setAlerts(res);
      if (!selectedAlertId && res.length > 0 && res[0]) {
        setSelectedAlertId(res[0].id);
      }
    });
  };

  useEffect(() => {
    fetchAlerts();
  }, [alertClient]);

  useEffect(() => {
    if (initialAlertId) {
      setSelectedAlertId(initialAlertId);
    }
  }, [initialAlertId]);

  const filteredAlerts = useMemo(() => {
    return alerts.filter((a) => {
      const matchSeverity = severityFilter === 'ALL' || a.severity === severityFilter;
      const matchStatus = statusFilter === 'ALL' || a.status === statusFilter;
      return matchSeverity && matchStatus;
    });
  }, [alerts, severityFilter, statusFilter]);

  const selectedAlert = useMemo(() => {
    return alerts.find((a) => a.id === selectedAlertId) ?? filteredAlerts[0] ?? alerts[0];
  }, [alerts, selectedAlertId, filteredAlerts]);

  const handleAcknowledge = async () => {
    if (!selectedAlert) return;
    try {
      await alertClient.acknowledgeAlert(selectedAlert.id);
      setActionSuccessMsg(`Đã tiếp nhận xử lý: "${selectedAlert.title}"`);
      fetchAlerts();
    } catch (err) {
      console.error(err);
    }
  };

  const handleAssign = async () => {
    if (!selectedAlert || !assigneeInput.trim()) return;
    try {
      await alertClient.assignAlert(selectedAlert.id, assigneeInput.trim());
      setActionSuccessMsg(`Đã phân công ${assigneeInput} xử lý.`);
      setShowAssignModal(false);
      setAssigneeInput('');
      fetchAlerts();
    } catch (err) {
      console.error(err);
    }
  };

  const handleResolve = async () => {
    if (!selectedAlert) return;
    try {
      await alertClient.resolveAlert(selectedAlert.id);
      setActionSuccessMsg(`Đã giải quyết xong: "${selectedAlert.title}"`);
      fetchAlerts();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="wf-view wf-alerts-view">
      {/* Header Banner */}
      <section className="wf-alerts-hero">
        <div>
          <span className="wf-hero-banner__eyebrow">QUẢN LÝ SỰ VỤ & PHÊ DUYỆT</span>
          <h2 className="wf-alerts-hero__title">Công việc & Smart Alerts</h2>
          <p className="wf-alerts-hero__desc">
            Hàng đợi cảnh báo và sự vụ vận hành do AI phát hiện và đối chiếu quy chế.
          </p>
        </div>
      </section>

      {/* Filter Toolbar */}
      <div className="wf-alerts-toolbar">
        <div className="wf-alerts-filter-group">
          <span className="wf-filter-label">Mức độ:</span>
          <button
            type="button"
            className={`wf-filter-chip ${severityFilter === 'ALL' ? 'wf-filter-chip--active' : ''}`}
            onClick={() => setSeverityFilter('ALL')}
          >
            Tất cả ({alerts.length})
          </button>
          <button
            type="button"
            className={`wf-filter-chip ${severityFilter === 'critical' ? 'wf-filter-chip--active' : ''}`}
            onClick={() => setSeverityFilter('critical')}
          >
            Khẩn cấp ({alerts.filter((a) => a.severity === 'critical').length})
          </button>
          <button
            type="button"
            className={`wf-filter-chip ${severityFilter === 'warning' ? 'wf-filter-chip--active' : ''}`}
            onClick={() => setSeverityFilter('warning')}
          >
            Cảnh báo ({alerts.filter((a) => a.severity === 'warning').length})
          </button>
        </div>

        <div className="wf-alerts-filter-group">
          <span className="wf-filter-label">Trạng thái:</span>
          <button
            type="button"
            className={`wf-filter-chip ${statusFilter === 'ALL' ? 'wf-filter-chip--active' : ''}`}
            onClick={() => setStatusFilter('ALL')}
          >
            Tất cả
          </button>
          <button
            type="button"
            className={`wf-filter-chip ${statusFilter === 'open' ? 'wf-filter-chip--active' : ''}`}
            onClick={() => setStatusFilter('open')}
          >
            Đang chờ ({alerts.filter((a) => a.status === 'open').length})
          </button>
          <button
            type="button"
            className={`wf-filter-chip ${statusFilter === 'in_progress' ? 'wf-filter-chip--active' : ''}`}
            onClick={() => setStatusFilter('in_progress')}
          >
            Đang xử lý ({alerts.filter((a) => a.status === 'in_progress').length})
          </button>
          <button
            type="button"
            className={`wf-filter-chip ${statusFilter === 'resolved' ? 'wf-filter-chip--active' : ''}`}
            onClick={() => setStatusFilter('resolved')}
          >
            Đã xử lý ({alerts.filter((a) => a.status === 'resolved').length})
          </button>
        </div>
      </div>

      {actionSuccessMsg && (
        <div className="wf-notice-banner wf-notice-banner--success" role="status">
          <span>✓ {actionSuccessMsg}</span>
          <button
            type="button"
            className="wf-notice-close"
            onClick={() => setActionSuccessMsg(null)}
            aria-label="Đóng thông báo"
          >
            ✕
          </button>
        </div>
      )}

      {/* Split View: Alert List & Detail Pane */}
      <div className="wf-alerts-layout">
        {/* Left: Alerts Inbox List */}
        <aside className="wf-alerts-inbox" aria-label="Danh sách cảnh báo">
          {filteredAlerts.length > 0 ? (
            filteredAlerts.map((alert) => {
              const isSelected = alert.id === selectedAlert?.id;
              return (
                <article
                  key={alert.id}
                  className={`wf-alert-inbox-item wf-alert-inbox-item--${alert.severity} ${isSelected ? 'wf-alert-inbox-item--active' : ''}`}
                  tabIndex={0}
                  onClick={() => {
                    setSelectedAlertId(alert.id);
                    onSelectAlert(alert.id);
                  }}
                >
                  <div className="wf-alert-inbox-item__top">
                    <StatusBadge status={alert.severity} size="sm" />
                    <StatusBadge status={alert.status} size="sm" />
                    <span className="wf-alert-inbox-item__time">{alert.createdAt}</span>
                  </div>
                  <h4 className="wf-alert-inbox-item__title">{alert.title}</h4>
                  <p className="wf-alert-inbox-item__summary">{alert.summary}</p>
                  <div className="wf-alert-inbox-item__footer">
                    <span className="wf-alert-inbox-item__agent">
                      <span aria-hidden="true">🤖</span> {alert.sourceAgent}
                    </span>
                    {alert.assignee && (
                      <span className="wf-alert-inbox-item__assignee">
                        <span aria-hidden="true">👤</span> {alert.assignee}
                      </span>
                    )}
                  </div>
                </article>
              );
            })
          ) : (
            <div className="wf-empty-box">Không có cảnh báo nào trong bộ lọc này.</div>
          )}
        </aside>

        {/* Right: Selected Alert Detail & Actions */}
        {selectedAlert ? (
          <main className="wf-alert-detail-pane" aria-labelledby="alert-detail-title">
            <div className="wf-alert-detail-header">
              <div className="wf-alert-detail-status-row">
                <div className="wf-status-group">
                  <StatusBadge status={selectedAlert.severity} size="md" />
                  <StatusBadge status={selectedAlert.status} size="md" />
                </div>
                <span className="wf-alert-detail-time">{selectedAlert.createdAt}</span>
              </div>
              <h3 id="alert-detail-title" className="wf-alert-detail-title">
                {selectedAlert.title}
              </h3>
              <div className="wf-alert-meta-bar">
                <span>
                  <strong>Nguồn:</strong> {selectedAlert.sourceAgent}
                </span>
                <span>
                  <strong>Phụ trách:</strong> {selectedAlert.assignee ?? 'Chưa phân công'}
                </span>
              </div>
            </div>

            {/* Action Bar */}
            <div className="wf-alert-action-bar">
              {selectedAlert.status === 'open' && (
                <button
                  type="button"
                  className="wf-btn wf-btn--primary wf-btn--sm"
                  onClick={handleAcknowledge}
                >
                  <span aria-hidden="true">✓</span> Tiếp nhận xử lý
                </button>
              )}
              {selectedAlert.status !== 'resolved' && (
                <>
                  <button
                    type="button"
                    className="wf-btn wf-btn--secondary wf-btn--sm"
                    onClick={() => setShowAssignModal(true)}
                  >
                    <span aria-hidden="true">👤</span> Giao việc phòng ban
                  </button>
                  <button
                    type="button"
                    className="wf-btn wf-btn--success wf-btn--sm"
                    onClick={handleResolve}
                  >
                    <span aria-hidden="true">✓</span> Đánh dấu Đã xử lý
                  </button>
                </>
              )}
              {selectedAlert.status === 'resolved' && (
                <div className="wf-resolved-tag">
                  <span>✓ Cảnh báo đã được giải quyết và lưu Audit Log</span>
                </div>
              )}
            </div>

            {/* Content Sections */}
            <div className="wf-alert-sections">
              <section className="wf-alert-section">
                <h4 className="wf-alert-section__title">Hiện trạng sự vụ</h4>
                <p className="wf-alert-section__text">{selectedAlert.summary}</p>
              </section>

              {selectedAlert.rootCause && (
                <section className="wf-alert-section wf-alert-section--rootcause">
                  <h4 className="wf-alert-section__title">Nguyên nhân gốc rễ</h4>
                  <p className="wf-alert-section__text">{selectedAlert.rootCause}</p>
                </section>
              )}

              <section className="wf-alert-section wf-alert-section--recommendation">
                <h4 className="wf-alert-section__title">
                  <span aria-hidden="true">💡</span> Đề xuất xử lý từ AI
                </h4>
                <p className="wf-alert-section__text">{selectedAlert.recommendedAction}</p>
              </section>

              {selectedAlert.policyRuleApplied && (
                <section className="wf-alert-section">
                  <h4 className="wf-alert-section__title">Quy chế đối chiếu</h4>
                  <div className="wf-policy-callout">
                    <span className="wf-policy-icon" aria-hidden="true">📜</span>
                    <span>{selectedAlert.policyRuleApplied}</span>
                  </div>
                </section>
              )}

              {/* Related Entity Link */}
              {selectedAlert.relatedEntity && (
                <section className="wf-alert-section">
                  <h4 className="wf-alert-section__title">Hồ sơ liên quan</h4>
                  <div className="wf-related-entity-card">
                    <div>
                      <span className="wf-related-type">
                        [{selectedAlert.relatedEntity.type.toUpperCase()}]
                      </span>
                      <strong>{selectedAlert.relatedEntity.name}</strong>
                    </div>
                    {selectedAlert.relatedEntity.type === 'contract' && onNavigateToDoc && (
                      <button
                        type="button"
                        className="wf-btn wf-btn--secondary wf-btn--sm"
                        onClick={() => onNavigateToDoc(selectedAlert.relatedEntity!.id)}
                      >
                        Mở rà soát →
                      </button>
                    )}
                    {selectedAlert.relatedEntity.type === 'invoice' && onNavigateToDoc && (
                      <button
                        type="button"
                        className="wf-btn wf-btn--secondary wf-btn--sm"
                        onClick={() => onNavigateToDoc(selectedAlert.relatedEntity!.id)}
                      >
                        Xem hóa đơn →
                      </button>
                    )}
                    {selectedAlert.relatedEntity.type === 'production_order' && onNavigateToAgent && (
                      <button
                        type="button"
                        className="wf-btn wf-btn--secondary wf-btn--sm"
                        onClick={() => onNavigateToAgent(selectedAlert.sourceAgentId)}
                      >
                        Xem AI Sản xuất →
                      </button>
                    )}
                  </div>
                </section>
              )}
            </div>
          </main>
        ) : (
          <div className="wf-empty-box">Chọn một cảnh báo từ danh sách để xem chi tiết.</div>
        )}
      </div>

      {/* Assignment Modal */}
      {showAssignModal && (
        <div className="wf-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="assign-modal-title">
          <div className="wf-modal-card">
            <h3 id="assign-modal-title" className="wf-modal-title">
              Giao việc xử lý cảnh báo
            </h3>
            <p className="wf-modal-desc">
              Chỉ định người phụ trách: <strong>{selectedAlert?.title}</strong>
            </p>
            <input
              type="text"
              className="wf-modal-input"
              placeholder="VD: Trưởng phòng Kế hoạch / Luật sư Trưởng / Kỹ sư bảo trì..."
              value={assigneeInput}
              onChange={(e) => setAssigneeInput(e.target.value)}
              autoFocus
            />
            <div className="wf-modal-actions">
              <button
                type="button"
                className="wf-btn wf-btn--ghost wf-btn--sm"
                onClick={() => setShowAssignModal(false)}
              >
                Hủy
              </button>
              <button
                type="button"
                className="wf-btn wf-btn--primary wf-btn--sm"
                onClick={handleAssign}
                disabled={!assigneeInput.trim()}
              >
                Xác nhận
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
