import { describe, expect, it } from 'vitest';
import { OUTBOUND_AUTHORITY_SOURCES, type OrderStatus, type PricedOrder } from '@netviet/shared';
import {
  NO_AUTHORITY,
  ORDER_COMMITMENT_STATES,
  decideOutboundAuthority,
  grantsFromDealerPolicy,
  grantsFromPersistedOrder,
  grantsFromPricedOrder,
  grantsFromQuote,
  mergeAuthority,
  pinnedOutboundVerdict,
} from './outbound-authority.js';

/**
 * MA TRAN HOI QUY muc 7 hop dong nhiem vu, o muc HOP DONG (ham thuan).
 *
 * MOI SO TRONG TEP NAY LA SO BIA. Khong mot gia, mot chinh sach hay mot ma SKU nao o day den tu
 * mot khach that — muc 8 hop dong cam dieu do, va mot bo test mang bang gia that cua khach vao
 * mot repo public la mot su co ro ri chu khong phai mot bai test.
 */

const line = (unitPrice: number, quantity: number) => ({
  skuRaw: 'SKU-A',
  sku: 'SKU-A',
  productName: 'San pham A',
  quantity,
  unitPrice,
  lineTotal: unitPrice * quantity,
  matched: true,
});

function pricedFixture(overrides: Partial<PricedOrder> = {}): PricedOrder {
  const lines = overrides.lines ?? [line(990_000, 10)];
  const itemsSubtotal = lines.reduce((sum, row) => sum + row.lineTotal, 0);
  return {
    orderType: 'TH1',
    dealerName: 'Dai ly thu nghiem',
    branch: null,
    lines,
    itemsSubtotal,
    shippingFee: 0,
    policy: 'cong_no_30',
    codCollect: false,
    codFee: 0,
    vat: false,
    vatAmount: 0,
    grandTotal: itemsSubtotal,
    warnings: [],
    confirmationText: 'Xac nhan don',
    ...overrides,
  };
}

const llm = (text: string) => ({ text, provenance: 'llm_draft' as const });

describe('bat bien kien truc', () => {
  it('khong mot nguon cap tham quyen nao mang ten model/LLM', () => {
    for (const source of OUTBOUND_AUTHORITY_SOURCES) {
      expect(source).not.toMatch(/llm|model|advisor|agent|prompt/i);
    }
  });

  it('bao tham quyen rong khong cap duoc gi cho mot ban nhap co khang dinh', () => {
    const verdict = decideOutboundAuthority(llm('Don gia 990.000đ ạ.'), NO_AUTHORITY);
    expect(verdict.sendable).toBe(false);
  });
});

describe('am tinh — fail closed', () => {
  // Ca 1: intent != dat_don, priced = null, ban nhap co don gia + tong tien.
  it('1. khong co ket qua dinh gia -> tien khong gui duoc', () => {
    const verdict = decideOutboundAuthority(
      llm('Da anh, don gia 990.000đ, tong don 9.900.000đ ạ.'),
      NO_AUTHORITY,
    );
    expect(verdict).toEqual({
      sendable: false,
      reason: 'FINANCIAL_AUTHORITY_MISSING',
      missing: ['financial'],
    });
  });

  // Ca 2: dinh gia bi bo qua / khong giai duoc -> khong con so nao ra toi khach.
  it('2. bao gia khong giai duoc SKU nao -> khong co grant tien', () => {
    const authority = mergeAuthority(grantsFromQuote([]));
    expect(authority.grants).toHaveLength(0);
    const verdict = decideOutboundAuthority(llm('Cai nay 990.000đ anh nhe.'), authority);
    expect(verdict).toMatchObject({ sendable: false, reason: 'FINANCIAL_AUTHORITY_MISSING' });
  });

  it('2b. co grant tien nhung con so viet ra la con so khac -> tu choi', () => {
    const authority = mergeAuthority(grantsFromQuote([990_000]));
    const verdict = decideOutboundAuthority(llm('Cai nay 1.250.000đ anh nhe.'), authority);
    expect(verdict).toMatchObject({
      sendable: false,
      reason: 'FINANCIAL_VALUE_NOT_AUTHORIZED',
      missing: ['financial'],
    });
  });

  // Ca 3: policy_finance skipped, ban nhap noi "cong no 30 ngay".
  it('3. khong co ket qua chinh sach -> khang dinh cong no khong gui duoc', () => {
    const authority = mergeAuthority(grantsFromDealerPolicy(null));
    const verdict = decideOutboundAuthority(
      llm('Ben minh cho cong no 30 ngay anh nhe.'),
      authority,
    );
    expect(verdict).toMatchObject({
      sendable: false,
      reason: 'POLICY_AUTHORITY_MISSING',
      missing: ['policy'],
    });
  });

  // Ca 4: khong co trang thai don ben vung, ban nhap noi "da ghi nhan don".
  it('4. khong co trang thai don -> cam ket don khong gui duoc', () => {
    const verdict = decideOutboundAuthority(llm('Da em da ghi nhan don cua anh ạ.'), NO_AUTHORITY);
    expect(verdict).toMatchObject({
      sendable: false,
      reason: 'ORDER_COMMITMENT_NOT_AUTHORIZED',
      missing: ['order_commitment'],
    });
  });

  it('4b. don o trang thai khong uy quyen (draft/rejected) khong cap cam ket', () => {
    for (const status of ['draft', 'rejected'] as OrderStatus[]) {
      const authority = mergeAuthority(grantsFromPersistedOrder({ status, priced: null }));
      expect(authority.grants).toHaveLength(0);
      expect(
        decideOutboundAuthority(llm('Em da chot don cho anh roi ạ.'), authority),
      ).toMatchObject({ sendable: false, reason: 'ORDER_COMMITMENT_NOT_AUTHORIZED' });
    }
  });

  // Ca 5: VAT/COD/cuoc/khuyen mai khong co nguon tat dinh -> LLM khong duoc bia ra.
  it('5. don co gia nhung khong bat VAT/COD/cuoc -> khong noi duoc ve chung', () => {
    const priced = pricedFixture();
    const authority = mergeAuthority(grantsFromPricedOrder(priced));
    for (const invented of [
      'Don nay xuat hoa don VAT day du ạ.',
      'Ship COD thu ho tan noi anh nhe.',
      'Ben em mien phi van chuyen don nay ạ.',
      'Don nay duoc chiet khau them ạ.',
    ]) {
      expect(decideOutboundAuthority(llm(invented), authority)).toMatchObject({
        sendable: false,
        reason: 'POLICY_STATEMENT_NOT_AUTHORIZED',
        missing: ['policy'],
      });
    }
  });

  it('gom DU cac lop thieu, khong dung o lop dau tien', () => {
    const verdict = decideOutboundAuthority(
      llm('Don gia 990.000đ, cong no 30 ngay, em da ghi nhan don cua anh ạ.'),
      NO_AUTHORITY,
    );
    expect(verdict).toEqual({
      sendable: false,
      reason: 'FINANCIAL_AUTHORITY_MISSING',
      missing: ['financial', 'policy', 'order_commitment'],
    });
  });

  // Ca 6: quyet dinh cau truc khong doi theo do tin cay cua model.
  it('6. quyet dinh chi phu thuoc (van ban, tham quyen) — khong co truc do tin cay', () => {
    const text = 'Don gia 990.000đ ạ.';
    const first = decideOutboundAuthority(llm(text), NO_AUTHORITY);
    const second = decideOutboundAuthority(llm(text), NO_AUTHORITY);
    expect(second).toEqual(first);
    // Hop dong o muc kieu: `decideOutboundAuthority` nhan dung HAI tham so, va khong tham so nao
    // mang do tin cay/rui ro. Mot lan them truc do vao day se lam bai nay do.
    expect(decideOutboundAuthority.length).toBe(2);
  });
});

describe('duong duong — khong giai bai toan bang cach cam sach', () => {
  // Ca 8: don co tham quyen -> con so hien thi khop CHINH XAC ket qua tat dinh.
  it('8. don da tinh gia uy quyen dung don gia / thanh tien / tong', () => {
    const priced = pricedFixture({ lines: [line(990_000, 10)] });
    const authority = mergeAuthority(grantsFromPricedOrder(priced));
    expect(
      decideOutboundAuthority(llm('Don gia 990.000đ, tong don 9.900.000đ ạ.'), authority),
    ).toEqual({ sendable: true, reason: 'AUTHORITY_SATISFIED', claims: ['financial'] });
  });

  it('8b. van ban tat dinh do chinh rules engine dung thi di thang', () => {
    const priced = pricedFixture();
    expect(
      decideOutboundAuthority(
        { text: priced.confirmationText, provenance: 'deterministic' },
        NO_AUTHORITY,
      ),
    ).toMatchObject({ sendable: true, reason: 'DETERMINISTIC_AUTHORITY' });
  });

  it('8c. cach VIET khac cua dung con so do van duoc — chan con so bia, khong chan cach viet', () => {
    const authority = mergeAuthority(grantsFromQuote([990_000]));
    expect(decideOutboundAuthority(llm('Gia 990k anh nhe.'), authority)).toMatchObject({
      sendable: true,
      reason: 'AUTHORITY_SATISFIED',
    });
  });

  // Ca 9: chinh sach co tham quyen -> duoc noi DUNG chinh sach do, khong phai mot bien the.
  it('9. cap dai ly da map uy quyen dung dieu khoan thanh toan cua ho', () => {
    const authority = mergeAuthority(grantsFromDealerPolicy('cong_no_30'));
    expect(
      decideOutboundAuthority(llm('Ben minh ap cong no 30 ngay cho anh ạ.'), authority),
    ).toMatchObject({ sendable: true, reason: 'AUTHORITY_SATISFIED', claims: ['policy'] });
  });

  it('9b. co tham quyen thanh toan van khong duoc noi sang VAT', () => {
    const authority = mergeAuthority(grantsFromDealerPolicy('cong_no_30'));
    expect(
      decideOutboundAuthority(llm('Cong no 30 ngay va co xuat hoa don VAT ạ.'), authority),
    ).toMatchObject({ sendable: false, reason: 'POLICY_STATEMENT_NOT_AUTHORIZED' });
  });

  it('9c. chinh sach COD cua dai ly uy quyen ca thanh toan lan COD', () => {
    const authority = mergeAuthority(grantsFromDealerPolicy('cod'));
    expect(decideOutboundAuthority(llm('Don nay ship COD thu ho ạ.'), authority)).toMatchObject({
      sendable: true,
      reason: 'AUTHORITY_SATISFIED',
    });
  });

  // Ca 10: trang thai don da uy quyen -> duoc noi da ghi nhan.
  it('10. don da ben vung o trang thai duoc uy quyen -> noi duoc "da ghi nhan don"', () => {
    for (const status of ORDER_COMMITMENT_STATES) {
      const authority = mergeAuthority(grantsFromPersistedOrder({ status, priced: null }));
      expect(
        decideOutboundAuthority(llm('Da em da ghi nhan don cua anh ạ.'), authority),
      ).toMatchObject({ sendable: true, reason: 'AUTHORITY_SATISFIED' });
    }
  });

  it('10b. don da ben vung uy quyen luon cac con so cua chinh no', () => {
    const authority = mergeAuthority(
      grantsFromPersistedOrder({ status: 'sent', priced: pricedFixture() }),
    );
    expect(
      decideOutboundAuthority(llm('Don cua anh da ghi nhan, tong 9.900.000đ ạ.'), authority),
    ).toMatchObject({ sendable: true, reason: 'AUTHORITY_SATISFIED' });
  });

  // Ca 11: tu van/FAQ thuong khong mang khang dinh he qua -> van dung duoc.
  it('11. cau tra loi tu van thuong khong bi cong nay dong lai', () => {
    expect(
      decideOutboundAuthority(
        llm('Da may nay dung dien 220V, co che do ngu im va bao hanh chinh hang ạ.'),
        NO_AUTHORITY,
      ),
    ).toEqual({ sendable: true, reason: 'NO_CONSEQUENTIAL_CLAIM', claims: [] });
  });

  it('11b. so luong / thong so khong bi nham la so tien', () => {
    expect(
      decideOutboundAuthority(llm('Loc duoc 45 m2, con 12 thang bao hanh ạ.'), NO_AUTHORITY),
    ).toMatchObject({ sendable: true, reason: 'NO_CONSEQUENTIAL_CLAIM' });
  });

  it('11c. mot cau ghi nhan y kien khong phai cam ket don', () => {
    expect(
      decideOutboundAuthority(llm('Da em da ghi nhan gop y cua anh ạ.'), NO_AUTHORITY),
    ).toMatchObject({ sendable: true, reason: 'NO_CONSEQUENTIAL_CLAIM' });
  });
});

describe('cuong che o diem nghen gui', () => {
  it('khong co quyet dinh nao ghim tren trace -> KHONG gui', () => {
    expect(pinnedOutboundVerdict(undefined)).toEqual({
      sendable: false,
      reason: 'AUTHORITY_DECISION_ABSENT',
      missing: [],
    });
  });

  it('ban ghi cu co outbound nhung khong co verdict -> KHONG gui', () => {
    const legacyTrace = {
      steps: [],
      primaryRole: 'router',
      senderType: 'unknown',
      llmCalls: 1,
      brainMode: 'mock',
      supervisor: { riskLevel: 'none', escalate: false, reasons: [] },
      outbound: { text: 'Don gia 990.000đ ạ.' },
    } as const;
    expect(pinnedOutboundVerdict(legacyTrace as never)).toMatchObject({
      sendable: false,
      reason: 'AUTHORITY_DECISION_ABSENT',
    });
  });

  it('verdict da ghim duoc tra lai nguyen ven', () => {
    const verdict = {
      sendable: true,
      reason: 'AUTHORITY_SATISFIED',
      claims: ['financial'],
    } as const;
    expect(pinnedOutboundVerdict({ outboundAuthority: verdict } as never)).toEqual(verdict);
  });
});
