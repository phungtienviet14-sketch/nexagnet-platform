'use client';

import React, { useEffect, useState } from 'react';
import { useOperationsClient } from '../services/client-context';
import type {
  DataConnector,
  McpToolInfo,
  ModelProviderInfo,
  PlatformTelemetry,
  RbacRole,
} from '../services/types';
import { StatusBadge } from './components/StatusBadge';

export function OperationsView() {
  const operationsClient = useOperationsClient();
  const [connectors, setConnectors] = useState<readonly DataConnector[]>([]);
  const [models, setModels] = useState<readonly ModelProviderInfo[]>([]);
  const [tools, setTools] = useState<readonly McpToolInfo[]>([]);
  const [roles, setRoles] = useState<readonly RbacRole[]>([]);
  const [telemetry, setTelemetry] = useState<PlatformTelemetry | null>(null);
  const [activeSection, setActiveSection] = useState<'connectors' | 'models' | 'tools' | 'rbac'>('connectors');

  useEffect(() => {
    let isMounted = true;
    Promise.all([
      operationsClient.getDataConnectors(),
      operationsClient.getModelProviders(),
      operationsClient.getMcpTools(),
      operationsClient.getRbacRoles(),
      operationsClient.getTelemetry(),
    ]).then(([c, m, t, r, tel]) => {
      if (!isMounted) return;
      setConnectors(c);
      setModels(m);
      setTools(t);
      setRoles(r);
      setTelemetry(tel);
    });
    return () => {
      isMounted = false;
    };
  }, [operationsClient]);

  return (
    <div className="wf-view wf-operations-view">
      {/* Header Banner */}
      <section className="wf-operations-hero">
        <div>
          <span className="wf-hero-banner__eyebrow">QUẢN TRỊ HẠ TẦNG & BẢO MẬT</span>
          <h2 className="wf-operations-hero__title">Data & Agent Operations</h2>
          <p className="wf-operations-hero__desc">
            Quản trị kết nối dữ liệu, mô hình AI, công cụ MCP, phân quyền RBAC và đo kiểm chỉ số vận hành.
          </p>
        </div>
      </section>

      {/* Telemetry Summary Bar */}
      {telemetry && (
        <section className="wf-telemetry-strip" aria-label="Chỉ số hiệu năng hạ tầng">
          <div className="wf-telemetry-item">
            <span className="wf-telemetry-val">{telemetry.uptime}</span>
            <span className="wf-telemetry-lbl">Khả dụng (Uptime)</span>
          </div>
          <div className="wf-telemetry-item">
            <span className="wf-telemetry-val">{telemetry.p95Latency}</span>
            <span className="wf-telemetry-lbl">Độ trễ p95</span>
          </div>
          <div className="wf-telemetry-item">
            <span className="wf-telemetry-val wf-telemetry-val--ok">{telemetry.errorRate}</span>
            <span className="wf-telemetry-lbl">Tỷ lệ lỗi</span>
          </div>
          <div className="wf-telemetry-item">
            <span className="wf-telemetry-val">{telemetry.activeRuns}</span>
            <span className="wf-telemetry-lbl">Pipeline hoạt động</span>
          </div>
          <div className="wf-telemetry-item">
            <span className="wf-telemetry-val">{telemetry.bufferHealth}</span>
            <span className="wf-telemetry-lbl">Ingest Buffer</span>
          </div>
        </section>
      )}

      {/* Section Navigation Tabs */}
      <div className="wf-ops-tabs-nav" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeSection === 'connectors'}
          className={`wf-ops-tab-btn ${activeSection === 'connectors' ? 'wf-ops-tab-btn--active' : ''}`}
          onClick={() => setActiveSection('connectors')}
        >
          🗄 Nguồn dữ liệu ({connectors.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeSection === 'models'}
          className={`wf-ops-tab-btn ${activeSection === 'models' ? 'wf-ops-tab-btn--active' : ''}`}
          onClick={() => setActiveSection('models')}
        >
          🧠 Mô hình AI ({models.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeSection === 'tools'}
          className={`wf-ops-tab-btn ${activeSection === 'tools' ? 'wf-ops-tab-btn--active' : ''}`}
          onClick={() => setActiveSection('tools')}
        >
          🛠 MCP Tools ({tools.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeSection === 'rbac'}
          className={`wf-ops-tab-btn ${activeSection === 'rbac' ? 'wf-ops-tab-btn--active' : ''}`}
          onClick={() => setActiveSection('rbac')}
        >
          🔒 Phân quyền & RBAC
        </button>
      </div>

      {/* Section 1: Connectors */}
      {activeSection === 'connectors' && (
        <section className="wf-ops-section" aria-labelledby="connectors-heading">
          <div className="wf-section-info">
            <h3 id="connectors-heading">Cổng kết nối dữ liệu</h3>
            <p>
              Theo dõi nguồn dữ liệu đang hoạt động và các cổng sẵn sàng theo lộ trình.
            </p>
          </div>

          <div className="wf-connectors-grid">
            {connectors.map((conn) => (
              <div key={conn.id} className="wf-connector-card">
                <div className="wf-connector-card__top">
                  <span className="wf-connector-type">{conn.type}</span>
                  <StatusBadge status={conn.status} />
                </div>
                <h4 className="wf-connector-card__name">{conn.name}</h4>
                <p className="wf-connector-card__note">{conn.note}</p>
                <div className="wf-connector-card__metrics">
                  {conn.latency && (
                    <span className="wf-conn-stat">Độ trễ: <strong>{conn.latency}</strong></span>
                  )}
                  {conn.recordsCount && (
                    <span className="wf-conn-stat">Dung lượng: <strong>{conn.recordsCount}</strong></span>
                  )}
                  {conn.lastSync && (
                    <span className="wf-conn-stat">Đồng bộ: <strong>{conn.lastSync}</strong></span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Section 2: Model Providers */}
      {activeSection === 'models' && (
        <section className="wf-ops-section" aria-labelledby="models-heading">
          <div className="wf-section-info">
            <h3 id="models-heading">Mô hình AI & Providers</h3>
            <p>
              Chiến lược đa mô hình chuyên biệt: Codex/Claude cho suy luận, DeepSeek cho tốc độ, Local Embeddings cho tri thức nội bộ.
            </p>
          </div>

          <div className="wf-models-grid">
            {models.map((mod) => (
              <div key={mod.id} className="wf-model-card">
                <div className="wf-model-card__top">
                  <span className="wf-model-provider">{mod.provider}</span>
                  <StatusBadge status={mod.status === 'active' ? 'AVAILABLE' : mod.status === 'configured' ? 'DEMO' : 'PLANNED'} />
                </div>
                <h4 className="wf-model-card__name">{mod.name}</h4>
                <p className="wf-model-card__role"><strong>Vai trò:</strong> {mod.role}</p>
                <div className="wf-model-card__footer">
                  <span>Context window: <strong>{mod.contextWindow}</strong></span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Section 3: MCP Tools */}
      {activeSection === 'tools' && (
        <section className="wf-ops-section" aria-labelledby="tools-heading">
          <div className="wf-section-info">
            <h3 id="tools-heading">Công cụ Model Context Protocol (MCP)</h3>
            <p>
              Bộ công cụ MCP chuẩn hóa cho phép Agent tương tác an toàn với tri thức và dữ liệu tác vụ.
            </p>
          </div>

          <div className="wf-tools-grid">
            {tools.map((tool) => (
              <div key={tool.id} className="wf-mcp-tool-card">
                <div className="wf-mcp-tool-card__top">
                  <code className="wf-tool-name">{tool.name}</code>
                  <StatusBadge status={tool.status === 'active' ? 'AVAILABLE' : tool.status === 'demo' ? 'DEMO' : 'PLANNED'} />
                </div>
                <span className="wf-tool-group">Nhóm: {tool.group}</span>
                <p className="wf-tool-desc">{tool.description}</p>
                <div className="wf-tool-perm">
                  <span aria-hidden="true">🔑</span> Quyền: <strong>{tool.permissions}</strong>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Section 4: RBAC & Governance */}
      {activeSection === 'rbac' && (
        <section className="wf-ops-section" aria-labelledby="rbac-heading">
          <div className="wf-section-info">
            <h3 id="rbac-heading">Phân quyền & Quản trị Bảo mật</h3>
            <p>
              Tuân thủ <strong>Luật Bảo vệ Dữ liệu Cá nhân (Luật số 91/2025/QH15)</strong> và NĐ 356/2025/NĐ-CP. Ghi vết đầy đủ qua Audit Trail.
            </p>
          </div>

          <div className="wf-rbac-grid">
            {roles.map((role) => (
              <div key={role.role} className="wf-rbac-card">
                <div className="wf-rbac-card__top">
                  <h4 className="wf-rbac-role-name">{role.role}</h4>
                  <span className="wf-rbac-user-count">{role.userCount} tài khoản</span>
                </div>
                <p className="wf-rbac-desc">{role.description}</p>
                <div className="wf-rbac-perms">
                  <span className="wf-perms-title">Quyền cấp phát:</span>
                  <div className="wf-perms-tags">
                    {role.permissions.map((perm) => (
                      <code key={perm} className="wf-perm-tag">
                        {perm}
                      </code>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="wf-compliance-callout">
            <div className="wf-compliance-callout__icon" aria-hidden="true">
              🛡
            </div>
            <div>
              <h4>Bảo mật Dữ liệu & Cô lập Tenant</h4>
              <p>
                Dữ liệu khách hàng được lưu trữ trong cơ sở dữ liệu và secret namespace riêng biệt (Silo isolation), không chia sẻ dữ liệu liên tenant.
              </p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
