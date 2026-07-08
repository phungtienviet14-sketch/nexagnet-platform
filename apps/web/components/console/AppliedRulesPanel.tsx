'use client';

import { SENDER_LABELS, type AgentSource, type OrderView } from '@ultty/shared';
import { formatVnd } from '../../lib/api';
import { POLICY_LABEL, SOURCE_META } from '../../lib/labels';

type Rule = { t: string; s: string; src: AgentSource };

function deriveRules(order: OrderView): Rule[] {
  const rules: Rule[] = [];
  const tier = SENDER_LABELS[order.senderType ?? 'unknown'];
  const p = order.priced;

  if (p) {
    for (const l of p.lines) {
      if (!l.matched) {
        rules.push({ t: l.skuRaw, s: 'Không khớp danh mục — Sale kiểm tra', src: 'knowledge' });
        continue;
      }
      rules.push({
        t: l.productName ?? l.skuRaw,
        s: `Giá cấp ${tier}: ${formatVnd(l.unitPrice)} × ${l.quantity}`,
        src: 'rules',
      });
    }
    rules.push({
      t: 'Phí vận chuyển',
      s: p.shippingFee === 0 ? 'Miễn phí (đơn ≥ 2 SP)' : formatVnd(p.shippingFee),
      src: 'rules',
    });
    rules.push({
      t: 'VAT',
      s: p.vat ? `Có · ${formatVnd(p.vatAmount)}` : 'Không (mặc định; chỉ cộng khi ghi “xuất VAT”)',
      src: 'rules',
    });
    rules.push({
      t: 'Chính sách',
      s: p.policy ? POLICY_LABEL[p.policy] : 'Chưa xác định cấp đại lý',
      src: 'rules',
    });
  } else {
    // Tin khong phai don: nguon tra loi = vai worker tham gia (khong phai router/supervisor).
    const worker = order.trace?.steps.find(
      (st) => st.status !== 'skipped' && st.role !== 'router' && st.role !== 'supervisor',
    );
    if (worker) rules.push({ t: 'Nguồn trả lời', s: worker.action, src: worker.source });
  }

  const sup = order.trace?.supervisor;
  if (sup) {
    rules.push({
      t: 'Giám sát',
      s: sup.escalate
        ? `Leo thang: ${sup.reasons.join('; ')}`
        : sup.riskLevel === 'watch'
          ? `Theo dõi: ${sup.reasons.join('; ')}`
          : 'Không phát hiện rủi ro',
      src: 'rules',
    });
  }
  return rules;
}

export function AppliedRulesPanel({ order }: { order?: OrderView }) {
  if (!order) return <div className="empty">Chọn một đơn để xem luật đã áp.</div>;
  const rules = deriveRules(order);

  return (
    <div>
      <p className="kb-title" style={{ marginBottom: '0.6rem' }}>
        Luật đã áp cho tin đang chọn
      </p>
      {rules.map((r, i) => {
        const src = SOURCE_META[r.src];
        return (
          <div className="rule-row" key={`${r.t}-${i}`}>
            <span className="rk">✓</span>
            <div className="rt">
              <b>{r.t}</b>
              <span>{r.s}</span>
            </div>
            {src.label && <span className={`src ${src.cls} src-tag-inline`}>{src.label}</span>}
          </div>
        );
      })}
    </div>
  );
}
