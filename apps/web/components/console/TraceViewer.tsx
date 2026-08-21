'use client';

import { useState } from 'react';
import type { TraceNode, TraceNodeKind, TraceView } from '@netviet/shared';

/**
 * CAY NGHIEP VU cua mot luot xu ly.
 *
 * NGUYEN TAC HIEN THI (theo yeu cau): mac dinh CHI hien thu doc len la hieu ngay —
 * buoc nghiep vu, quyet dinh + ly do, chuyen trang thai, lan goi AI/cong cu.
 * Manh moi KY THUAT (buoc luu tru, span ID, do tre may mili-giay) nam sau mot cong tac.
 *
 * Component nay CO Y "cam": moi phep dung cay da lam o tang API (`trace-view.builder.ts`), nen
 * o day khong co logic nao ve spanId/parentSpanId. Hai noi cung dung mot cay thi khong the troi
 * khoi nhau.
 */

const KIND_MARK: Record<TraceNodeKind, string> = {
  step: '▸',
  decision: '◆',
  state: '⇄',
  data: 'Δ',
  ai: '✦',
};

const KIND_LABEL: Record<TraceNodeKind, string> = {
  step: 'Bước',
  decision: 'Quyết định',
  state: 'Trạng thái',
  data: 'Dữ liệu',
  ai: 'AI',
};

function outcomeClass(node: TraceNode): string {
  switch (node.outcome) {
    case 'denied':
    case 'error':
      return 'tv-denied';
    case 'degraded':
      return 'tv-degraded';
    case 'allowed':
    case 'ok':
      return 'tv-ok';
    default:
      return '';
  }
}

function NodeRow({ node }: { node: TraceNode }) {
  return (
    <li
      className={`tv-node ${outcomeClass(node)}`}
      style={{ paddingLeft: `${node.depth * 18}px` }}
    >
      <span className="tv-mark" aria-hidden="true">
        {KIND_MARK[node.kind]}
      </span>
      <span className="tv-body">
        <span className="tv-line">
          <span className="tv-kind">{KIND_LABEL[node.kind]}</span>
          <b className="tv-label">{node.label}</b>
          {node.durationMs !== undefined && <span className="tv-ms">{node.durationMs}ms</span>}
        </span>
        {node.reasonLabel && (
          <span className="tv-reason">
            {/* Ma de MAY loc, nhan de NGUOI doc — hien ca hai, vi nguoi debug can ca hai. */}
            {node.reasonLabel}
            <code className="tv-code">{node.reason}</code>
          </span>
        )}
        {node.detail && <span className="tv-detail">{node.detail}</span>}
      </span>
    </li>
  );
}

export function TraceViewer({ trace, onClose }: { trace: TraceView; onClose: () => void }) {
  const [showTechnical, setShowTechnical] = useState(false);
  const technicalCount = trace.nodes.filter((node) => node.technical).length;
  const visible = showTechnical ? trace.nodes : trace.nodes.filter((node) => !node.technical);

  const copyTraceId = () => void navigator.clipboard?.writeText(trace.traceId);

  return (
    <div className="tv" role="region" aria-label="Luồng xử lý">
      <div className="tv-head">
        <div>
          <b>Luồng xử lý</b>
          <span className="tv-meta">
            {trace.tenant}/{trace.environment}
            {trace.release ? ` · bản ${trace.release}` : ''}
            {trace.totalMs ? ` · ${trace.totalMs}ms` : ''}
          </span>
        </div>
        <div className="tv-head-actions">
          <button type="button" className="reply-copy" onClick={copyTraceId} title={trace.traceId}>
            Copy trace ID
          </button>
          <button type="button" className="reply-copy" onClick={onClose}>
            Đóng
          </button>
        </div>
      </div>

      <ol className="tv-list">
        {visible.map((node, index) => (
          <NodeRow key={`${node.kind}-${node.label}-${index}`} node={node} />
        ))}
      </ol>

      {technicalCount > 0 && (
        <button
          type="button"
          className="tv-toggle"
          onClick={() => setShowTechnical((value) => !value)}
        >
          {showTechnical
            ? 'Ẩn chi tiết kỹ thuật'
            : `Hiện chi tiết kỹ thuật (${technicalCount} bước)`}
        </button>
      )}
    </div>
  );
}
