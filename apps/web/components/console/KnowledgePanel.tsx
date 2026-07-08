'use client';

import { useQuery } from '@tanstack/react-query';
import type { DealerTier, OrderView } from '@ultty/shared';
import { api, formatVnd } from '../../lib/api';
import { POLICY_LABEL } from '../../lib/labels';
import { deriveKnowledgeUsage, type KnowledgeUsage } from '../../lib/knowledge-usage';

const TIER_LABEL: Record<DealerTier, string> = { dai_ly: 'Đại lý', ctv: 'CTV' };

/** Khoi "AI da dung gi" — dan tin dang chon voi kho tri thuc (agent lam gi voi no). */
function UsageBox({ usage }: { usage: KnowledgeUsage }) {
  const hasAny = usage.glossary.length > 0 || usage.skus.length > 0 || usage.group;
  if (!hasAny) return null;

  return (
    <div className="kb-usage">
      <p className="kb-usage-title">🔍 AI đã dùng cho tin này</p>

      {usage.glossary.length > 0 && (
        <div className="usage-group">
          <div className="usage-label">Giải mã viết tắt (Điều phối)</div>
          <div className="glossary">
            {usage.glossary.map((g) => (
              <span className="gl gl-used" key={g.term}>
                <b>{g.term}</b>
                <span className="arr">→</span>
                {g.meaning}
              </span>
            ))}
          </div>
        </div>
      )}

      {usage.skus.length > 0 && (
        <div className="usage-group">
          <div className="usage-label">Khớp sản phẩm &amp; giá (Bán hàng)</div>
          {usage.skus.map((s) => (
            <div className="usage-line" key={s.sku}>
              <span className="usage-raw">{s.skuRaw}</span>
              <span className="usage-arrow">→</span>
              <span>
                {s.name} · <b>{formatVnd(s.unitPrice)}</b>/SP × {s.quantity}
              </span>
            </div>
          ))}
        </div>
      )}

      {usage.group && (
        <div className="usage-group">
          <div className="usage-label">Nhóm → đại lý (Điều phối)</div>
          <div className="usage-line">
            <span className="usage-raw">{usage.group.groupName}</span>
            <span className="usage-arrow">→</span>
            <span>
              <b>{usage.group.tierLabel}</b>
              {usage.group.policy ? ` · ${POLICY_LABEL[usage.group.policy]}` : ''} → quyết cấp giá &amp;
              chính sách
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/** Kho tri thuc (nguon su that ve san pham) — bam theo tin dang chon: hien AI da dung gi. */
export function KnowledgePanel({ order }: { order?: OrderView }) {
  const kbQ = useQuery({ queryKey: ['knowledge'], queryFn: api.knowledge, staleTime: 60_000 });
  const kb = kbQ.data;

  if (!kb) return <div className="empty">Đang tải kho tri thức…</div>;

  const usage = deriveKnowledgeUsage(order, kb);

  return (
    <div>
      <UsageBox usage={usage} />

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
            {kb.products.map((p) => {
              const used = usage.usedSkus.has(p.sku);
              return (
                <tr key={p.sku} className={used ? 'kb-row-used' : ''}>
                  <td>
                    {used && <span className="kb-used-dot" aria-label="đã dùng" />}
                    {p.name}
                    <div className="sku">{p.sku}</div>
                  </td>
                  <td className="price">{formatVnd(p.priceDaiLy)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="kb-block">
        <p className="kb-title">Từ điển viết tắt ({kb.glossaryCount})</p>
        <div className="glossary">
          {kb.glossary.map((g) => {
            const used = usage.glossary.some((u) => u.term === g.term);
            return (
              <span className={`gl ${used ? 'gl-used' : ''}`} key={g.term}>
                <b>{g.term}</b>
                <span className="arr">→</span>
                {g.meaning}
              </span>
            );
          })}
        </div>
      </div>

      <div className="kb-block">
        <p className="kb-title">Map nhóm Zalo → đại lý ({kb.groupCount})</p>
        {kb.groups.map((g) => {
          const used = usage.group?.groupName === g.groupName;
          return (
            <div className={`map-row ${used ? 'map-row-used' : ''}`} key={g.chatId}>
              <div>
                <div className="g">{g.groupName}</div>
                <div className="d">
                  {g.dealerName ?? 'chưa map'}
                  {g.policy ? ` · ${POLICY_LABEL[g.policy]}` : ''}
                </div>
              </div>
              {g.dealerTier && <span className="tier">{TIER_LABEL[g.dealerTier]}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
