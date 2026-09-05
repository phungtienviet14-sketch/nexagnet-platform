import { describe, expect, it } from 'vitest';
import { KnowledgeService } from '../knowledge/knowledge.service.js';
import { runAdvisorTool, type AdvisorToolContext } from './advisor-tools.js';

/**
 * NEO NGUON KHONG DUOC LAY TU THAM SO MODEL TU GUI.
 *
 * ---------------------------------------------------------------------------------------------
 * VI SAO BO TEST NAY TON TAI, va no chan dung cai gi.
 *
 * Hop dong neo nguon (`outbound-narrative.ts`) cho phep mot con so o lai trong loi nhan khi con so
 * do co mat trong `sources` — tap chuoi HE THONG SO HUU cua luot. Suc manh cua G2 nam TRON VEN o
 * chuyen `sources` that su la cua he thong.
 *
 * Ma moi cong cu deu nhan tham so do MODEL sinh ra, va mot so ket qua ECHO tham so do lai:
 *
 *     tinh_don({ items: [{ sku: "990", so_luong: 1 }] })
 *       -> priceOrder() tra ve mot dong khong khop danh muc, `skuRaw = "990"`
 *
 * Neu `skuRaw` (hay `quantity`) di vao `sources` thi model vua TU TAO duoc bang chung neo nguon
 * cho chinh chuoi no sap viet — "Dạ giá 990 ạ" se qua G2. Ca duong tan cong do khong can mot lo
 * hong nao trong bo trich: no di vong qua bang cach lam ban chinh cai tap ma bo trich doi chieu.
 *
 * Day la mot BAT BIEN CUA CA TANG CONG CU, khong phai cua mot ham. Nen bo test nay chay tren MOI
 * cong cu, va them mot cong cu moi ma quen quy tac se lam no do.
 */

const knowledge = new KnowledgeService(undefined, new Date('2026-08-15T00:00:00.000Z'));

const ctx: AdvisorToolContext = {
  knowledge,
  resolved: { dealer: null, branch: null, groupName: null, senderType: 'dai_ly' },
  senderType: 'dai_ly',
  chatId: 'g1',
};

/** Chuoi model tu bia — khong ton tai o bat ky dau trong danh muc/bang gia/tai lieu. */
const POISON = '990';
const POISON_WORD = 'ZZZ-KHONG-CO-THAT';

describe('sources cua cong cu khong bao gio mang tham so model tu gui', () => {
  it('tinh_don voi SKU bia -> chuoi bia KHONG lot vao sources', async () => {
    const outcome = await runAdvisorTool(
      'tinh_don',
      { items: [{ sku: POISON, so_luong: 7 }] },
      ctx,
    );

    // `output` VAN duoc phep echo — LLM can doc lai de biet dong nao khong khop danh muc.
    expect(JSON.stringify(outcome.output)).toContain(POISON);
    // `sources` thi KHONG. Day la ranh gioi.
    expect((outcome.sources ?? []).join('\n')).not.toContain(POISON);
  });

  it('tinh_don: SO LUONG model tu chon cung khong duoc neo nguon', async () => {
    const outcome = await runAdvisorTool(
      'tinh_don',
      { items: [{ sku: POISON_WORD, so_luong: 4321 }] },
      ctx,
    );

    expect((outcome.sources ?? []).join('\n')).not.toContain('4321');
  });

  it('bao_gia voi SKU bia -> khong sources, khong grant, khong du kien', async () => {
    const outcome = await runAdvisorTool('bao_gia', { skus: [POISON, POISON_WORD] }, ctx);

    expect((outcome.sources ?? []).join('\n')).not.toContain(POISON);
    expect((outcome.sources ?? []).join('\n')).not.toContain(POISON_WORD);
    expect(outcome.grants).toEqual([]);
    expect(outcome.facts?.quote ?? null).toBeNull();
  });

  it('tra_cuu_san_pham: tu khoa model go khong tro thanh nguon', async () => {
    const outcome = await runAdvisorTool('tra_cuu_san_pham', { tu_khoa: POISON_WORD }, ctx);

    expect((outcome.sources ?? []).join('\n')).not.toContain(POISON_WORD);
  });

  it('tra_cuu_tai_lieu: sku va cau hoi model go khong tro thanh nguon', async () => {
    const outcome = await runAdvisorTool(
      'tra_cuu_tai_lieu',
      { sku: POISON_WORD, cau_hoi: `gia ${POISON} phai khong` },
      ctx,
    );

    const sources = (outcome.sources ?? []).join('\n');
    expect(sources).not.toContain(POISON_WORD);
    expect(sources).not.toContain(POISON);
  });

  it('soan_tra_loi: ke hoach KHONG cap tham quyen va KHONG neo nguon duoc gi', async () => {
    const outcome = await runAdvisorTool(
      'soan_tra_loi',
      { y_dinh: 'faq', khoi_nghiep_vu: ['bao_gia'], loi_nhan: `Dạ giá ${POISON} ạ.` },
      ctx,
    );

    expect(outcome.grants).toEqual([]);
    expect(outcome.sources ?? []).toEqual([]);
    expect(outcome.facts ?? null).toBeNull();
    // Ke hoach VAN duoc ghi nhan — no la de xuat, khong phai tham quyen.
    expect(outcome.plan).toMatchObject({ kind: 'faq', requestedBlocks: ['price_quote'] });
  });

  it('ten khoi LA trong ke hoach bi BO, khong lam hong ca ke hoach', async () => {
    const outcome = await runAdvisorTool(
      'soan_tra_loi',
      { y_dinh: 'khong-co-y-dinh-nay', khoi_nghiep_vu: ['bao_gia', 'khoi-la'], loi_nhan: 'Dạ ạ.' },
      ctx,
    );

    // Fail closed theo huong IT DAC QUYEN NHAT: y dinh la -> `faq`; khoi la -> bo dung khoi do.
    expect(outcome.plan).toEqual({
      kind: 'faq',
      requestedBlocks: ['price_quote'],
      narrative: 'Dạ ạ.',
    });
  });
});
