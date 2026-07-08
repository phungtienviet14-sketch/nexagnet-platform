'use client';

import { useQuery } from '@tanstack/react-query';
import type { DealerTier } from '@ultty/shared';
import { api, formatVnd } from '../../lib/api';
import { POLICY_LABEL } from '../../lib/labels';

const TIER_LABEL: Record<DealerTier, string> = { dai_ly: 'Đại lý', ctv: 'CTV' };

/** Kho tri thuc (nguon su that ve san pham) — chung minh AI rang buoc trong tu dien dong. */
export function KnowledgePanel() {
  const kbQ = useQuery({ queryKey: ['knowledge'], queryFn: api.knowledge, staleTime: 60_000 });
  const kb = kbQ.data;

  if (!kb) return <div className="empty">Đang tải kho tri thức…</div>;

  return (
    <div>
      <div className="kb-block">
        <p className="kb-title">Danh mục · giá cấp Đại lý ({kb.productCount} SKU)</p>
        <table className="kb-table">
          <thead>
            <tr>
              <th>Sản phẩm</th>
              <th style={{ textAlign: 'right' }}>Đơn giá</th>
            </tr>
          </thead>
          <tbody>
            {kb.products.map((p) => (
              <tr key={p.sku}>
                <td>
                  {p.name}
                  <div className="sku">{p.sku}</div>
                </td>
                <td className="price">{formatVnd(p.priceDaiLy)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="kb-block">
        <p className="kb-title">Từ điển viết tắt ({kb.glossaryCount})</p>
        <div className="glossary">
          {kb.glossary.map((g) => (
            <span className="gl" key={g.term}>
              <b>{g.term}</b>
              <span className="arr">→</span>
              {g.meaning}
            </span>
          ))}
        </div>
      </div>

      <div className="kb-block">
        <p className="kb-title">Map nhóm Zalo → đại lý ({kb.groupCount})</p>
        {kb.groups.map((g) => (
          <div className="map-row" key={g.chatId}>
            <div>
              <div className="g">{g.groupName}</div>
              <div className="d">
                {g.dealerName ?? 'chưa map'}
                {g.policy ? ` · ${POLICY_LABEL[g.policy]}` : ''}
              </div>
            </div>
            {g.dealerTier && <span className="tier">{TIER_LABEL[g.dealerTier]}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
