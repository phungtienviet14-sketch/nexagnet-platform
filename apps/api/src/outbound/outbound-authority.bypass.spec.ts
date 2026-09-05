import { describe, expect, it } from 'vitest';
import { OUTBOUND_BLOCK_KINDS, type OutboundBlockKind } from '@netviet/shared';
import { decideOutboundAuthority } from './outbound-authority.js';
import { NO_BUSINESS_FACTS } from './outbound-facts.js';
import {
  APPROVED_DOC,
  authorityFor,
  blockText,
  compose,
  facts,
  plan,
  policyFacts,
  pricedFacts,
  pricedOrder,
  quoteFacts,
} from './__tests__/composition.fixture.js';

/**
 * BO TEST DOT BIEN — muc 8 hop dong #189, phan "Adversarial/property testing".
 *
 * ---------------------------------------------------------------------------------------------
 * MUC TIEU CHUNG MINH KHONG PHAI "bo trich nhan ra moi cach dien dat".
 *
 * Hop dong noi thang: "The proof target is: no mutation can cause an unauthorized structured
 * business block/value/state to be rendered/sent." Do la mot khang dinh ve CAU TRUC, va no kiem
 * duoc: sinh ra hang tram bien the cua mot cau, nem vao truong van xuoi, roi khang dinh rang
 * TAP KHOI DA RENDER khong doi — vi khoi khong den tu van ban.
 *
 * Vi sao khang dinh nay manh hon "khong bai nao lot": no dung ke ca voi mot cau ma bo trich khong
 * he nhan ra. Bo trich co lot hay khong cung khong lam xuat hien them mot khoi nao.
 *
 * ---------------------------------------------------------------------------------------------
 * BA CAU B1 cua review doc lap (#187) van nam trong corpus duoi day, cung voi cac lop bo sot ma
 * chinh bao cao #187 tu liet ke: so tran duoi 1000 co `k` ngam, tieng Viet khong dau mat the hoan
 * thanh, va cau chinh sach khong chu so ngoai `POLICY_SURFACES`.
 */

/** Bo cau goc: moi cau deu la mot khang dinh CO HE QUA ma luot KHONG duoc phep noi. */
const CONSEQUENTIAL_SEEDS: readonly string[] = [
  'Tổng đơn là 1.150.000.',
  'Anh được thanh toán sau 30 ngày.',
  'Đơn của anh đã vào hệ thống rồi.',
  'Dạ giá 990 thôi ạ.',
  'Bên mình cho khất tiền hàng tới khi bán xong.',
  'Đơn của mình chốt xong rồi nhé.',
  'Giá gốc 1150k, mình lấy được luôn.',
  'Em duyệt đơn này cho anh rồi ạ.',
  'Bên em tặng kèm bộ lọc cho đơn này.',
  'Hàng của mình được miễn cước vận chuyển.',
];

const stripAccents = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/gu, 'd')
    .replace(/Đ/gu, 'D');

/**
 * MOT CAU -> NHIEU BIEN THE. Cac truc dot bien lay dung theo muc 8 hop dong: dau cau, dau tieng
 * Viet, dong tu la, cach dien dat chinh sach la, va dinh dang so.
 */
function mutations(seed: string): string[] {
  const withoutPunctuation = seed.replace(/[.,!?]/gu, '');
  const spaced = seed.replace(/\s+/gu, '  ');
  const numberForms = [
    seed.replace(/1\.150\.000/gu, '1150k'),
    seed.replace(/1\.150\.000/gu, '1,15tr'),
    seed.replace(/1\.150\.000/gu, '1.150.000đ'),
    seed.replace(/30 ngày/gu, 'ba mươi ngày'),
    seed.replace(/990/gu, '990k'),
  ];
  const unseenVerbs = [
    seed.replace(/đã vào hệ thống/gu, 'đã nằm trong hệ thống'),
    seed.replace(/chốt xong/gu, 'khoá sổ xong'),
    seed.replace(/duyệt/gu, 'phê chuẩn'),
  ];
  const unseenPolicy = [
    seed.replace(/thanh toán sau/gu, 'trả tiền sau'),
    seed.replace(/khất tiền hàng/gu, 'gối đầu tiền hàng'),
    seed.replace(/miễn cước vận chuyển/gu, 'không mất phí ship'),
  ];
  return [
    seed,
    withoutPunctuation,
    spaced,
    stripAccents(seed),
    stripAccents(withoutPunctuation),
    seed.toUpperCase(),
    seed.toLowerCase(),
    ...numberForms,
    ...unseenVerbs,
    ...unseenPolicy,
    ...numberForms.map(stripAccents),
    ...unseenVerbs.map(stripAccents),
    ...unseenPolicy.map(stripAccents),
  ];
}

const ALL_MUTATIONS: readonly string[] = [...new Set(CONSEQUENTIAL_SEEDS.flatMap(mutations))];

describe('#189 muc 8 — dot bien: khong bien the nao lam xuat hien mot khoi khong duoc uy quyen', () => {
  it('corpus du lon de co nghia', () => {
    expect(ALL_MUTATIONS.length).toBeGreaterThan(80);
  });

  /*
   * TINH CHAT 1 — LUOT KHONG CO DU KIEN NAO.
   *
   * Model duoc quyen xin MOI loai khoi VA nhet bien the vao truong van xuoi cung luc. Khang dinh:
   * khong mot bien the nao dung duoc mot khoi. Do la ket qua cua CAU TRUC, khong cua bo trich —
   * nen no dung ca voi nhung cau ma bo trich hoan toan khong nhan ra.
   */
  it('luot khong tham quyen: moi bien the -> KHONG khoi nao, khong ky tu nghiep vu nao', () => {
    for (const text of ALL_MUTATIONS) {
      const composition = compose(plan(OUTBOUND_BLOCK_KINDS, text), NO_BUSINESS_FACTS);

      expect(composition.blocks, text).toHaveLength(0);
      expect(blockText(composition), text).toBe('');
      expect(composition.mode, text).not.toBe('deterministic_business');
    }
  });

  /*
   * TINH CHAT 2 — LUOT CO DAY DU DU KIEN.
   *
   * Day la truong hop kho hon va quan trong hon: luot NAY duoc phep noi ve tien va chinh sach. Cau
   * hoi la mot bien the trong truong van xuoi co lam DOI dieu duoc noi ra khong. Khang dinh: tap
   * khoi va van ban cua khoi khong phu thuoc vao van xuoi — mot ky tu.
   */
  it('luot co tham quyen: van xuoi khong lam doi mot ky tu nao cua phan khoi', () => {
    const turn = facts(
      pricedFacts(pricedOrder({ policy: 'cong_no_30' })),
      policyFacts('cong_no_30'),
    );
    const requested: readonly OutboundBlockKind[] = ['order_pricing', 'payment_policy'];
    const baseline = blockText(compose(plan(requested, ''), turn));

    expect(baseline).not.toBe('');
    for (const text of ALL_MUTATIONS) {
      expect(blockText(compose(plan(requested, text), turn)), text).toBe(baseline);
    }
  });

  /*
   * TINH CHAT 3 — VAN BAN GUI DUOC khong bao gio mang mot cau dot bien nao.
   *
   * Ba cau tren la ve KHOI. Cau nay ve VAN BAN CUOI: neu phan quyet cho gui, thi cau dot bien do
   * hoac da bi hop dong neo nguon bo, hoac (khi no vo tinh truy nguyen duoc) khong con la mot
   * khang dinh co tham quyen vi khong khoi nao mang no.
   */
  it('van ban gui duoc khong bao gio chua mot cau dot bien chua truy nguyen duoc', () => {
    const quote = quoteFacts();
    for (const text of ALL_MUTATIONS) {
      const composition = compose(plan(['price_quote'], text), quote);
      const verdict = decideOutboundAuthority(composition, authorityFor(quote));
      if (!verdict.sendable) continue;
      expect(composition.narrative.admitted || !composition.text.includes(text), text).toBe(true);
    }
  });

  /*
   * TINH CHAT 4 — NHAN CUA MODEL KHONG MUA DUOC GI.
   *
   * Chay lai tinh chat 1 tren MOI `planKind`. Neu mot ngay nao do ai do suy `mode` tu `plan.kind`
   * thi bai nay do — do dung la duong di vong ma muc 3 hop dong goi ten.
   */
  it('moi nhan y dinh cua model deu cho cung mot ket qua khi khong co du kien', () => {
    for (const kind of ['faq', 'product_advice', 'order_status', 'handoff'] as const) {
      for (const text of CONSEQUENTIAL_SEEDS) {
        const composition = compose(plan(OUTBOUND_BLOCK_KINDS, text, kind), NO_BUSINESS_FACTS);

        expect(composition.blocks, `${kind}: ${text}`).toHaveLength(0);
      }
    }
  });
});

describe('#189 — dot bien tren mot luot FAQ that: cau vo hai KHONG bi chan oan', () => {
  /*
   * Doi trong cua bo tren. Neo nguon phai HAP THU duoc bao dong gia cua bo trich (do luong
   * 04/09/2026: ~26% tai lieu da duyet lam no bao dong), neu khong thi muc 8 ca 16 hop dong
   * ("ordinary non-consequential FAQ remains usable") khong dat.
   */
  const APPROVED = [
    'Lưu lượng gió lên tới 9700 lít/phút, 9 cấp độ gió.',
    'Bảo hành 3 năm, 1 đổi 1 trong 7 ngày đầu tiên nếu có lỗi từ nhà sản xuất.',
    'Máy lọc dùng màng lọc HEPA, khử mùi bằng than hoạt tính.',
    APPROVED_DOC,
  ];

  const FAQ_ANSWERS = [
    'Dạ lưu lượng gió lên tới 9700 lít/phút với 9 cấp độ ạ.',
    'Dạ bảo hành 3 năm, 1 đổi 1 trong 7 ngày đầu ạ.',
    'Dạ máy dùng màng lọc HEPA và than hoạt tính ạ.',
  ];

  it('cau tra loi lay tu tai lieu da duyet van den duoc khach', () => {
    for (const answer of [...FAQ_ANSWERS, ...FAQ_ANSWERS.map(stripAccents)]) {
      const composition = compose(plan([], answer), NO_BUSINESS_FACTS, {
        systemSources: APPROVED,
      });

      expect(composition.narrative, answer).toMatchObject({ admitted: true });
      expect(decideOutboundAuthority(composition, { grants: [] }), answer).toMatchObject({
        sendable: true,
        reason: 'NARRATIVE_ONLY_COMPOSITION',
      });
    }
  });

  it('doi MOT con so trong cau tra loi -> khong con truy nguyen duoc -> bi bo', () => {
    const composition = compose(
      plan([], 'Dạ lưu lượng gió lên tới 9800 lít/phút ạ.'),
      NO_BUSINESS_FACTS,
      { systemSources: APPROVED },
    );

    expect(composition.narrative).toEqual({ admitted: false, reason: 'NUMERAL_NOT_GROUNDED' });
  });
});
