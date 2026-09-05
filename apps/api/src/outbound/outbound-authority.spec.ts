import { describe, expect, it } from 'vitest';
import {
  OUTBOUND_AUTHORITY_SOURCES,
  type AgentTrace,
  type OutboundAuthority,
} from '@netviet/shared';
import {
  decideOutboundAuthority,
  grantsFromDealerPolicy,
  grantsFromPersistedOrder,
  grantsFromPricedOrder,
  grantsFromQuote,
  mergeAuthority,
  outboundFingerprint,
  pinnedOutboundVerdict,
} from './outbound-authority.js';
import { deterministicComposition } from './outbound-composer.js';
import {
  authorityFor,
  compose,
  facts,
  orderStateFactsFor,
  plan,
  policyFacts,
  pricedFacts,
  pricedOrder,
  quoteFacts,
} from './__tests__/composition.fixture.js';

/**
 * CONG THAM QUYEN — no xet BAN SOAN, khong xet doan van (Issue #189).
 *
 * Tep nay do ba thu, va chung la ba chang cua `decideOutboundAuthority`:
 *   1. ban soan rong / van ban tat dinh tron -> hai duong tat, hai ket cuc khac han nhau;
 *   2. TUNG KHANG DINH cua TUNG KHOI phai nam trong grant (ranh gioi dung sai);
 *   3. phong thu chieu sau: quet lai vat mang tren van ban CUOI (muc 7 hop dong).
 *
 * Cac tinh chat B2/B3 cua PR #187 (tien la GIA TRI chu khong phai chuoi chu so; chinh sach chinh
 * xac tung loai; cam ket don chinh xac tung muc) VAN duoc do o day — chung chi doi cho: gio
 * chung song trong phep doi chieu `ComposedBlockClaim.authorized` voi grant, chu khong con trong
 * mot phep doc van ban.
 */

const NO_GRANT: OutboundAuthority = { grants: [] };

describe('bat bien kien truc', () => {
  it('khong mot nguon cap tham quyen nao mang ten model/LLM', () => {
    for (const source of OUTBOUND_AUTHORITY_SOURCES) {
      expect(source).not.toMatch(/llm|model|advisor|agent/iu);
    }
  });

  it('bao tham quyen rong khong cap duoc gi cho mot ban soan co khoi', () => {
    // Khoi ton tai (du kien co that) nhung KHONG co grant nao -> tu choi. Hai thu nay tach roi co
    // y: du kien noi "render duoc gi", grant noi "duoc phep noi gi". Ca hai deu phai dat.
    const composition = compose(plan(['price_quote']), quoteFacts(), { authority: NO_GRANT });

    expect(decideOutboundAuthority(composition, NO_GRANT)).toMatchObject({
      sendable: false,
      reason: 'FINANCIAL_AUTHORITY_MISSING',
      missing: ['financial'],
    });
  });
});

describe('chang 1 — hai duong tat', () => {
  it('ban soan khong con gi de gui -> COMPOSITION_EMPTY, fail closed', () => {
    const composition = compose(plan([], ''), undefined, { systemSources: [] });

    expect(composition.mode).toBe('empty');
    expect(decideOutboundAuthority(composition, NO_GRANT)).toMatchObject({
      sendable: false,
      reason: 'COMPOSITION_EMPTY',
    });
  });

  it('van ban do tang tat dinh dung tron di thang — gia tri trong do CHINH LA ket qua co tham quyen', () => {
    const composition = deterministicComposition(
      'HN_30.9_Meta HN\n10 x Ghế Felix — 1.150.000đ\nTổng: 11.500.000đ',
    );

    expect(decideOutboundAuthority(composition, NO_GRANT)).toMatchObject({
      sendable: true,
      reason: 'DETERMINISTIC_AUTHORITY',
    });
  });
});

describe('chang 2 — tung khang dinh cua tung khoi phai nam trong grant', () => {
  it('B2: tham quyen cho 1.150.000d KHONG phu cho mot don gia khac', () => {
    // Khoi render tu du kien 990.000d, nhung grant chi co 1.150.000d — vd mot ban soan dung du
    // kien cua luot truoc. Doi chieu la GIA TRI voi GIA TRI, nen no bi bat.
    const composition = compose(plan(['price_quote']), quoteFacts(990_000));

    expect(
      decideOutboundAuthority(composition, mergeAuthority(grantsFromQuote([1_150_000]))),
    ).toMatchObject({ sendable: false, reason: 'FINANCIAL_VALUE_NOT_AUTHORIZED' });
  });

  it('B3: dai ly "thanh toan ngay" KHONG phu cho mot khoi chinh sach "ky gui"', () => {
    const composition = compose(plan(['payment_policy']), policyFacts('ky_gui'));

    expect(
      decideOutboundAuthority(
        composition,
        mergeAuthority(grantsFromDealerPolicy('thanh_toan_ngay')),
      ),
    ).toMatchObject({ sendable: false, reason: 'POLICY_STATEMENT_NOT_AUTHORIZED' });
  });

  it('B3: ky han 45 ngay KHONG phu cho mot khoi chinh sach cong no 30 ngay', () => {
    const composition = compose(plan(['payment_policy']), policyFacts('cong_no_30'));

    expect(
      decideOutboundAuthority(composition, mergeAuthority(grantsFromDealerPolicy('cong_no_45'))),
    ).toMatchObject({ sendable: false, reason: 'POLICY_STATEMENT_NOT_AUTHORIZED' });
  });

  it('B3: khoi cam ket muc `confirmed` KHONG duoc phu boi mot don `needs_edit`', () => {
    const composition = compose(plan(['order_commitment']), orderStateFactsFor('approved'));

    expect(
      decideOutboundAuthority(
        composition,
        mergeAuthority(grantsFromPersistedOrder({ status: 'needs_edit', priced: null })),
      ),
    ).toMatchObject({ sendable: false, reason: 'ORDER_COMMITMENT_LEVEL_NOT_AUTHORIZED' });
  });

  it('khong co grant cua LOP do -> ma "thieu tham quyen", khac ma "gia tri khong duoc uy quyen"', () => {
    const composition = compose(plan(['order_commitment']), orderStateFactsFor('approved'));

    expect(decideOutboundAuthority(composition, NO_GRANT)).toMatchObject({
      sendable: false,
      reason: 'ORDER_COMMITMENT_NOT_AUTHORIZED',
    });
  });

  it('gom DU cac lop thieu, khong dung o lop dau tien', () => {
    const composition = compose(
      plan(['order_pricing', 'payment_policy', 'order_commitment']),
      facts(
        pricedFacts(pricedOrder({ policy: 'cong_no_30' })),
        policyFacts('cong_no_30'),
        orderStateFactsFor('approved'),
      ),
    );

    expect(decideOutboundAuthority(composition, NO_GRANT)).toMatchObject({
      sendable: false,
      missing: ['financial', 'policy', 'order_commitment'],
    });
  });

  it('don da tinh gia uy quyen dung don gia / thanh tien / tam tinh / tong cua chinh no', () => {
    const priced = pricedOrder();
    const composition = compose(plan(['order_pricing']), pricedFacts(priced));

    expect(
      decideOutboundAuthority(composition, mergeAuthority(grantsFromPricedOrder(priced))),
    ).toMatchObject({ sendable: true, reason: 'AUTHORITY_SATISFIED' });
  });

  it('don co gia nhung KHONG bat VAT/COD/cuoc -> khoi VAT/COD/cuoc bi bo, khong bi "cho qua"', () => {
    const composition = compose(plan(['vat_cod_shipping']), pricedFacts(pricedOrder()));

    expect(composition.omitted).toEqual([{ kind: 'vat_cod_shipping', reason: 'FACT_INCOMPLETE' }]);
    expect(composition.blocks).toHaveLength(0);
  });

  it('don CO bat VAT/COD -> khoi noi dung nhung thu don do bat, khong hon', () => {
    const priced = pricedOrder({
      vat: true,
      vatAmount: 1_150_000,
      codCollect: true,
      codFee: 50_000,
    });
    const composition = compose(plan(['vat_cod_shipping']), pricedFacts(priced));
    const block = composition.blocks[0];

    expect(block?.claims[0]?.authorized).toEqual(['vat', 'cod']);
    expect(block?.lines.join('\n')).not.toContain('cước vận chuyển');
    expect(
      decideOutboundAuthority(composition, mergeAuthority(grantsFromPricedOrder(priced))),
    ).toMatchObject({ sendable: true });
  });
});

describe('chang 3 — phong thu chieu sau tren van ban CUOI', () => {
  it('van ban cuoi mang mot con so khong nam trong bang chung neo nguon -> tu choi', () => {
    const quote = quoteFacts();
    const composition = compose(plan(['price_quote']), quote);
    // Gia dinh mot loi lap trinh tuong lai: mot buoc hau xu ly noi them mot con so vao van ban ma
    // khong cap nhat bang chung neo nguon. Lop nay bat duoc, va no doc lap voi lan xet luc soan.
    const tampered = { ...composition, text: `${composition.text}\nGiá gốc 990.000đ.` };

    expect(decideOutboundAuthority(tampered, authorityFor(quote))).toMatchObject({
      sendable: false,
      reason: 'NARRATIVE_CARRIER_NOT_GROUNDED',
      missing: ['financial'],
    });
  });

  /*
   * "HOP LE" TU #200 CO NGHIA LA MOT TRICH DAN TRON VEN. Fixture cua bai nay da doi cho phu hop
   * (them "lên tới" va "đầu tiên"), va bai ngay duoi chung minh ban CAT DUOI khong con qua duoc.
   * Thu bai nay do van la thu no vua do: ba con so ky thuat (9700, 3, 1, 7) lam bo trich vat mang
   * bao dong, va neo nguon phai hap thu duoc chung — neu khong thi chang 3 se bo ca tin.
   */
  it('van ban cuoi hop le KHONG bi lop nay bao dong gia — ke ca khi day so lieu ky thuat', () => {
    const composition = compose(
      plan(
        [],
        'Dạ lưu lượng gió lên tới 9700 lít/phút. Bảo hành 3 năm, 1 đổi 1 trong 7 ngày đầu tiên ạ.',
      ),
      undefined,
      {
        systemSources: [
          'Lưu lượng gió lên tới 9700 lít/phút. Bảo hành 3 năm, 1 đổi 1 trong 7 ngày đầu tiên.',
        ],
      },
    );

    expect(composition.narrative).toMatchObject({ admitted: true });
    expect(decideOutboundAuthority(composition, NO_GRANT)).toMatchObject({ sendable: true });
  });

  /*
   * DOI TRONG, VA NO LA CHO #200 THAY DOI HANH VI CUA CHINH BAI TREN.
   *
   * Ban truoc cua bai tren viet "bảo hành 3 năm, 1 đổi 1 trong 7 ngày" — cat mat "đầu tiên" cua
   * tai lieu. Doc len thi vo hai, nhung do dung la phep CAT DUOI ma G6 phai chan: mot menh de
   * bao hanh bi cat duoi la mot dieu kien bao hanh khac.
   */
  it('#200: cat duoi mot menh de bao hanh — du chi mot chu — khong con di qua duoc', () => {
    const composition = compose(plan([], 'Dạ bảo hành 3 năm, 1 đổi 1 trong 7 ngày ạ.'), undefined, {
      systemSources: [
        'Lưu lượng gió lên tới 9700 lít/phút. Bảo hành 3 năm, 1 đổi 1 trong 7 ngày đầu tiên.',
      ],
    });

    expect(composition.narrative).toMatchObject({ reason: 'NARRATIVE_NOT_SOURCE_BOUND' });
  });
});

describe('cuong che o diem nghen gui', () => {
  const BASE: AgentTrace = {
    steps: [],
    primaryRole: 'router',
    senderType: 'dai_ly',
    llmCalls: 1,
    brainMode: 'stub',
    supervisor: { riskLevel: 'none', escalate: false, reasons: [] },
  };

  it('khong co quyet dinh nao ghim tren trace -> KHONG gui', () => {
    expect(pinnedOutboundVerdict(BASE, 'Dạ vâng ạ.')).toMatchObject({
      sendable: false,
      reason: 'AUTHORITY_DECISION_ABSENT',
    });
  });

  it('co phan quyet nhung KHONG co ban soan co kieu -> COMPOSITION_ABSENT', () => {
    const text = 'Dạ vâng ạ.';
    const trace: AgentTrace = {
      ...BASE,
      outbound: { text },
      outboundAuthority: {
        sendable: true,
        reason: 'NARRATIVE_ONLY_COMPOSITION',
        claims: [],
        fingerprint: outboundFingerprint(text),
      },
    };

    expect(pinnedOutboundVerdict(trace, text)).toMatchObject({
      sendable: false,
      reason: 'COMPOSITION_ABSENT',
    });
  });

  it('phan quyet + ban soan khop dau -> tra lai nguyen ven', () => {
    const composition = compose(plan([], 'Dạ ghế Felix có tựa lưng lưới ạ.'));
    const verdict = decideOutboundAuthority(composition, NO_GRANT);
    const trace: AgentTrace = {
      ...BASE,
      outbound: { text: composition.text },
      outboundAuthority: verdict,
      outboundComposition: composition,
    };

    expect(pinnedOutboundVerdict(trace, composition.text)).toEqual(verdict);
  });

  it('van ban doi sau khi duoc cap phan quyet -> AUTHORITY_PAYLOAD_MISMATCH', () => {
    const composition = compose(plan([], 'Dạ ghế Felix có tựa lưng lưới ạ.'));
    const trace: AgentTrace = {
      ...BASE,
      outbound: { text: composition.text },
      outboundAuthority: decideOutboundAuthority(composition, NO_GRANT),
      outboundComposition: composition,
    };

    expect(pinnedOutboundVerdict(trace, 'Dạ ghế Felix giá 990.000đ ạ.')).toMatchObject({
      sendable: false,
      reason: 'AUTHORITY_PAYLOAD_MISMATCH',
    });
  });

  it('phan quyet cua luot nay ghep voi ban soan cua luot khac -> van bi chan', () => {
    const mine = compose(plan([], 'Dạ ghế Felix có tựa lưng lưới ạ.'));
    const other = compose(plan([], 'Dạ khung thép sơn tĩnh điện ạ.'));
    const trace: AgentTrace = {
      ...BASE,
      outbound: { text: mine.text },
      outboundAuthority: decideOutboundAuthority(mine, NO_GRANT),
      outboundComposition: other,
    };

    expect(pinnedOutboundVerdict(trace, mine.text)).toMatchObject({
      sendable: false,
      reason: 'AUTHORITY_PAYLOAD_MISMATCH',
    });
  });

  it('dau van ban khong doi khi chi khac khoang trang thua', () => {
    const composition = compose(plan([], 'Dạ ghế Felix có tựa lưng lưới ạ.'));
    const trace: AgentTrace = {
      ...BASE,
      outbound: { text: composition.text },
      outboundAuthority: decideOutboundAuthority(composition, NO_GRANT),
      outboundComposition: composition,
    };

    expect(pinnedOutboundVerdict(trace, `  ${composition.text}  `)).toMatchObject({
      sendable: true,
    });
  });
});
