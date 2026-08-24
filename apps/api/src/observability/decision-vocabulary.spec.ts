import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
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

/**
 * TU VUNG PHAI MO TA SU THAT DANG XAY RA.
 *
 * `order.amend_window` ton tai trong bo tu vung tu 24/08/2026 ma KHONG co diem phat nao trong
 * source. Mot diem quyet dinh khong ai phat la te hon la khong khai bao no: no hua voi nguoi doc
 * trace rang co mot cho de nhin, va cho do trong rong. Nguoi debug se ket luan "nhanh nay khong
 * chay" trong khi that ra no chay va da tu choi khach.
 *
 * Bai nay quet MA NGUON that chu khong doc mot danh sach nao: mot diem chi duoc coi la co nguoi
 * phat khi ten cua no xuat hien trong mot tep khong phai spec va khong phai chinh tep tu vung.
 */
describe('moi diem quyet dinh deu co nguoi phat that', () => {
  const sourceFiles = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const full = resolve(dir, entry);
      if (statSync(full).isDirectory()) return entry === 'node_modules' ? [] : sourceFiles(full);
      if (!entry.endsWith('.ts')) return [];
      // Bo spec (chung gia lap loi goi) va bo chinh cac tep khai bao tu vung.
      if (entry.endsWith('.spec.ts') || entry.endsWith('-decisions.ts')) return [];
      return [full];
    });

  const corpus = sourceFiles(srcDir)
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n');

  const ALL_POINTS = [
    ...TURN_DECISIONS.points.map((point) => [TURN_DECISIONS.owner, point] as const),
    ...SALES_ORDER_DECISIONS.points.map((point) => [SALES_ORDER_DECISIONS.owner, point] as const),
    ...CHANNEL_DECISIONS.points.map((point) => [CHANNEL_DECISIONS.owner, point] as const),
  ];

  it.each(ALL_POINTS)('%s / %s co it nhat mot diem phat trong source', (_owner, point) => {
    expect(
      corpus,
      `'${point}' co trong bo tu vung nhung khong tep nao phat no — hoac noi vao diem nghiep vu that, hoac bo khoi tu vung`,
    ).toContain(`'${point}'`);
  });
});
