import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHANNEL_DECISIONS } from '../channels/channel-decisions.js';
import { SALES_ORDER_DECISIONS } from '../orders/sales-order-decisions.js';
import { TURN_DECISIONS } from '../turns/turn-decisions.js';
import { decisionReasonLabel, defineDecisionVocabulary } from './decision-vocabulary.js';

const srcDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * NEN TANG KHONG DUOC BIET NGHIEP VU CUA AI.
 *
 * Truoc 24/08/2026, `observability/decision-reasons.ts` chua ca `SALES_HANDOFF_REASONS` lan
 * `PRICING_REASONS`: tang quan sat — thu MOI khach deu dung — biet the nao la mot don va mot
 * lan ban giao ERP. Hau qua khong phai ly thuyet: mot capability ke toan tuong lai se phai them
 * ma cua no vao dung cai enum do, va moi khach deu nhin thay.
 */
describe('tu vung quyet dinh: nen tang giu KHUON, capability giu TU NGU', () => {
  it('tep co che cua nen tang khong chua mot thuat ngu nghiep vu nao', () => {
    const mechanism = readFileSync(resolve(srcDir, 'observability/decision-vocabulary.ts'), 'utf8');

    // Danh sach nay CO Y ngan: no khong phai bo loc chinh ta, no la mot to khai — nen tang
    // khong duoc nhac den don, gia, dai ly hay ERP.
    for (const businessTerm of ['order.', 'HANDOFF', 'PRICING', 'DEALER', 'ERP', 'sales-order']) {
      expect(mechanism, `nen tang khong duoc nhac "${businessTerm}"`).not.toContain(businessTerm);
    }
  });

  it('moi bo tu vung tu khai ai so huu no', () => {
    expect(TURN_DECISIONS.owner).toBe('turn-processing');
    expect(SALES_ORDER_DECISIONS.owner).toBe('sales-order');
    expect(CHANNEL_DECISIONS.owner).toBe('messaging');
  });

  it('diem quyet dinh cua ban hang nam trong bo cua ban hang, khong o bo cua luot', () => {
    expect(SALES_ORDER_DECISIONS.points).toContain('order.auto_confirm');
    expect(SALES_ORDER_DECISIONS.points).toContain('rules.price');
    expect(TURN_DECISIONS.points).not.toContain('order.auto_confirm');
    expect(TURN_DECISIONS.points).not.toContain('rules.price');

    // …va nguoc lai: duong xu ly luot khong duoc de mot diem cua no roi sang ban hang.
    expect(TURN_DECISIONS.points).toContain('message.intake');
    expect(SALES_ORDER_DECISIONS.points).not.toContain('message.intake');
  });

  it('mot capability MOI dat duoc tu vung rieng ma khong dung toi bo nao dang co', () => {
    // Day chinh la kich ban "ke toan trong tuong lai" viet ra duoi dang code chay duoc.
    const ACCOUNTING = defineDecisionVocabulary({
      owner: 'accounting',
      points: ['invoice.issue'],
      labels: {
        VAT_POLICY_UNAPPROVED: 'Chính sách VAT chưa được duyệt',
        ISSUED: 'Đã xuất hoá đơn',
      },
    });

    expect(ACCOUNTING.points).toEqual(['invoice.issue']);
    // Nhan cua no tra cuu duoc ngay, khong phai sua mot tep nao cua nen tang hay cua ban hang.
    expect(decisionReasonLabel('VAT_POLICY_UNAPPROVED')).toBe('Chính sách VAT chưa được duyệt');
    // Va khong mot ma nao cua no lot vao bo tu vung cua ban hang.
    expect(Object.keys(SALES_ORDER_DECISIONS.labels)).not.toContain('VAT_POLICY_UNAPPROVED');
  });

  it('ma la khong biet -> tra chinh no, khong nem (fail-open cua tang quan sat)', () => {
    expect(decisionReasonLabel('MOT_MA_CHUA_AI_KHAI')).toBe('MOT_MA_CHUA_AI_KHAI');
  });
});
