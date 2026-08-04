'use client';

import {
  ROLE_LABELS,
  SENDER_LABELS,
  type AgentRole,
  type AgentSource,
  type OrderView,
} from '@ultty/shared';
import { formatVnd } from '../../lib/api';
import { POLICY_LABEL, ROLE_ICON, SOURCE_META } from '../../lib/labels';

/** 1 luat: vai nao (role) THAY gi (input) -> ra gi (output), nguon (src). */
type RuleRow = { role: AgentRole; name: string; input: string; output: string; src: AgentSource };

function deriveRules(order: OrderView): RuleRow[] {
  const rows: RuleRow[] = [];
  const tier = SENDER_LABELS[order.senderType ?? 'unknown'];
  const p = order.priced;
  const parsed = order.parsed;

  if (p) {
    const totalQty = p.lines.reduce((s, l) => s + l.quantity, 0);
    for (const l of p.lines) {
      if (!l.matched) {
        rows.push({
          role: 'sales',
          name: 'Khớp sản phẩm',
          input: `“${l.skuRaw}”`,
          output: 'KHÔNG khớp danh mục — Sale kiểm tra',
          src: 'knowledge',
        });
        continue;
      }
      rows.push({
        role: 'sales',
        name: 'Bóc & áp giá',
        input: `${l.quantity} × ${l.productName ?? l.skuRaw} (số lượng do AI trích)`,
        output: `giá ${tier} ${formatVnd(l.unitPrice)} → ${formatVnd(l.lineTotal)}`,
        src: 'rules',
      });
    }
    rows.push({
      role: 'policy_finance',
      name: 'Phí vận chuyển',
      input: `đơn ${totalQty} sản phẩm`,
      output: p.shippingFee === 0 ? 'miễn phí ship (đơn ≥ 2 SP)' : formatVnd(p.shippingFee),
      src: 'rules',
    });
    rows.push({
      role: 'policy_finance',
      name: 'VAT',
      // noVat thang wantVat: khach ghi "ko lay VAT" -> uu tien hieu la KHONG VAT.
      input: parsed?.noVat
        ? 'khách ghi “không VAT”'
        : parsed?.wantVat
          ? 'khách ghi “xuất VAT”'
          : 'khách không ghi VAT',
      output: p.vat
        ? `VAT 10% = ${formatVnd(p.vatAmount)}`
        : parsed?.noVat
          ? 'VAT OFF — khách yêu cầu không VAT'
          : 'VAT OFF — mặc định (chỉ cộng khi ghi “xuất VAT”)',
      src: 'rules',
    });
    if (p.codCollect) {
      rows.push({
        role: 'policy_finance',
        name: 'Thu hộ COD',
        input: 'giao thẳng khách (TH2)',
        output: `phí thu hộ ${formatVnd(p.codFee)}`,
        src: 'rules',
      });
    }
    rows.push({
      role: 'policy_finance',
      name: 'Chính sách',
      input: order.groupName ? `${order.groupName} = ${tier}` : 'nhóm chưa map đại lý',
      output: p.policy ? POLICY_LABEL[p.policy] : 'chưa xác định cấp đại lý',
      src: 'knowledge',
    });
    if (parsed?.totalRaw) {
      const match = Math.abs(parsed.totalRaw - p.grandTotal) < 1000;
      rows.push({
        role: 'sales',
        name: 'Đối chiếu tổng',
        input: `khách ghi ${formatVnd(parsed.totalRaw)}`,
        output: match
          ? `khớp tổng rules ${formatVnd(p.grandTotal)} ✓`
          : `LỆCH tổng rules ${formatVnd(p.grandTotal)} — kiểm tra`,
        src: 'rules',
      });
    }
  } else {
    const worker = order.trace?.steps.find(
      (st) => st.status !== 'skipped' && st.role !== 'router' && st.role !== 'supervisor',
    );
    if (worker) {
      rows.push({
        role: worker.role,
        name: 'Tra kho tri thức',
        input: `“${order.rawText.length > 42 ? `${order.rawText.slice(0, 42)}…` : order.rawText}”`,
        output: worker.notes[0] ?? worker.action,
        src: worker.source === 'none' ? 'knowledge' : worker.source,
      });
    }
  }

  const sup = order.trace?.supervisor;
  if (sup) {
    rows.push({
      role: 'supervisor',
      name: 'Giám sát rủi ro',
      input: p ? `tổng ${formatVnd(p.grandTotal)}, người gửi ${tier}` : `người gửi ${tier}`,
      output: sup.escalate
        ? `⚑ CHUYỂN NGƯỜI THẬT: ${sup.reasons.join('; ')}`
        : sup.riskLevel === 'watch'
          ? `⚠ THEO DÕI: ${sup.reasons.join('; ')}`
          : 'không rủi ro → duyệt được',
      src: 'rules',
    });
  }
  return rows;
}

export function AppliedRulesPanel({ order }: { order?: OrderView }) {
  if (!order) return <div className="empty">Chọn một tin để xem agent đã áp luật gì.</div>;
  const rules = deriveRules(order);

  return (
    <div>
      <p className="kb-title" style={{ marginBottom: '0.6rem' }}>
        Agent nào · thấy gì → ra gì
      </p>
      {rules.map((r, i) => {
        const src = SOURCE_META[r.src];
        return (
          <div className="rule-row" key={`${r.name}-${i}`}>
            <span className="rule-agent" title={ROLE_LABELS[r.role]} aria-hidden>
              {ROLE_ICON[r.role]}
            </span>
            <div className="rt">
              <div className="rule-name">
                {r.name} · {ROLE_LABELS[r.role]}
              </div>
              <div className="rule-io">
                <span className="rule-in">{r.input}</span>
                <span className="rule-arrow">→</span>
                <b className="rule-out">{r.output}</b>
              </div>
            </div>
            {src.label && <span className={`src ${src.cls} src-tag-inline`}>{src.label}</span>}
          </div>
        );
      })}
    </div>
  );
}
