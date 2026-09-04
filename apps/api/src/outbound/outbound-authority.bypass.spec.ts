import { describe, expect, it } from 'vitest';
import type { OrderStatus, PricedOrder } from '@netviet/shared';
import {
  NO_AUTHORITY,
  decideOutboundAuthority,
  grantsFromDealerPolicy,
  grantsFromPersistedOrder,
  grantsFromQuote,
  mergeAuthority,
  outboundFingerprint,
  pinnedOutboundVerdict,
} from './outbound-authority.js';

/**
 * CAC DUONG DI VONG DO REVIEW DOC LAP CHI RA (ChatGPT, 04/09/2026) — B1, B2, B3.
 *
 * ---------------------------------------------------------------------------------------------
 * VI SAO BO TEST NAY TON TAI RIENG. Ban dau, cong tham quyen tra `NO_CONSEQUENTIAL_CLAIM` voi
 * `sendable: true` MOI KHI ba bo trich (tien / chinh sach / cam ket don) khong nhan ra gi. Tuc la
 * bo trich van ban da nam TRONG ranh gioi CHO PHEP: bo sot mot cach dien dat = cho di.
 *
 * Muc 4 hop dong nhiem vu cam dung dieu do: quet van ban chi duoc la phong thu chieu sau.
 *
 * Moi ca o day deu la TIENG VIET THUONG, khong phai chuoi doi khang. Va quan trong hon: khong ca
 * nao duoc phep xanh len chi vi ai do THEM MOT CUM TU vao tu dien. Neu ban vua sua tep nay bang
 * cach them mot chuoi vao mot bang tu vung, ban dang va chu khong sua.
 * ---------------------------------------------------------------------------------------------
 */

const draft = (text: string) => ({ text, provenance: 'llm_draft' as const });

function priced(patch: Partial<PricedOrder> = {}): PricedOrder {
  return {
    orderType: 'TH1',
    dealerName: null,
    branch: null,
    lines: [],
    itemsSubtotal: 0,
    shippingFee: 0,
    policy: null,
    codCollect: false,
    codFee: 0,
    vat: false,
    vatAmount: 0,
    grandTotal: 0,
    warnings: [],
    confirmationText: '',
    ...patch,
  };
}

const persisted = (status: OrderStatus, order: PricedOrder | null = null) =>
  mergeAuthority(grantsFromPersistedOrder({ status, priced: order }));

/* ============================================================================================ *
 * B1 — MOT CACH NOI NGOAI TU DIEN VAN KHONG DUOC PHEP LOT
 *
 * Ba ca duoi day deu tung ra `NO_CONSEQUENTIAL_CLAIM` + `sendable: true`. Chung phai bi chan BOI
 * HINH DANG cua van ban (co chu so do lon / co danh tu don kem the hoan thanh), khong boi viec ai
 * do da kip liet ke dung cum tu do.
 * ============================================================================================ */

describe('B1 — be mat khong nam trong tu dien van khong duoc lot', () => {
  it('B1.1 so tien KHONG HAU TO ("Tổng đơn là 1.150.000.") ma khong co dinh gia -> chan', () => {
    const verdict = decideOutboundAuthority(draft('Tổng đơn là 1.150.000.'), NO_AUTHORITY);

    expect(verdict.sendable).toBe(false);
    expect(verdict.reason).toBe('FINANCIAL_AUTHORITY_MISSING');
  });

  it('B1.2 "thanh toán sau 30 ngày" — cum ngoai tu dien chinh sach -> van chan', () => {
    const verdict = decideOutboundAuthority(
      draft('Anh được thanh toán sau 30 ngày.'),
      NO_AUTHORITY,
    );

    expect(verdict).toMatchObject({
      sendable: false,
      missing: expect.arrayContaining(['policy']),
    });
  });

  it('B1.3 "Đơn của anh đã vào hệ thống rồi." — dong tu ngoai tu dien -> van chan', () => {
    const verdict = decideOutboundAuthority(
      draft('Đơn của anh đã vào hệ thống rồi.'),
      NO_AUTHORITY,
    );

    expect(verdict).toMatchObject({
      sendable: false,
      missing: expect.arrayContaining(['order_commitment']),
    });
  });

  it('B1.4 mot ban nhap KHONG mang chu so lon va KHONG cam ket don van gui duoc', () => {
    // Doi trong cua ba ca tren: cong nay khong duoc bien thanh "cam het". Mot cau tu van thuong
    // — khong con so co do lon tien te, khong the hoan thanh + danh tu don — phai di thang.
    const verdict = decideOutboundAuthority(
      draft('Dạ máy này dùng điện 220V, bảo hành 12 tháng ạ.'),
      NO_AUTHORITY,
    );

    expect(verdict).toMatchObject({ sendable: true, reason: 'NO_CONSEQUENTIAL_CLAIM' });
  });
});

/* ============================================================================================ *
 * B2 — MOT CACH VIET TIEN ANH XA DUNG MOT GIA TRI VND
 *
 * Truoc day mot so tien duoc uy quyen bang TAP CHUOI ("1150000" va ca "1150" cho tien rut gon).
 * Hai con so khac han nhau vi the dung chung mot the: uy quyen 1.150.000d lam "1150d" lot.
 * ============================================================================================ */

describe('B2 — tien la GIA TRI VND, khong phai mot tap chuoi chu so', () => {
  it('B2.1 uy quyen 1.150.000đ KHONG lam cho ban nhap noi "1150đ" hop le', () => {
    const authority = mergeAuthority(grantsFromQuote([1_150_000]));

    const verdict = decideOutboundAuthority(draft('Dạ giá chỉ 1150đ thôi ạ.'), authority);

    expect(verdict.sendable).toBe(false);
    expect(verdict.reason).toBe('FINANCIAL_VALUE_NOT_AUTHORIZED');
  });

  it('B2.2 "2tr5" la 2.500.000, khong phai 2.000.000', () => {
    const twoMillion = mergeAuthority(grantsFromQuote([2_000_000]));
    const twoPointFive = mergeAuthority(grantsFromQuote([2_500_000]));

    expect(decideOutboundAuthority(draft('Dạ 2tr5 ạ.'), twoMillion).sendable).toBe(false);
    expect(decideOutboundAuthority(draft('Dạ 2tr5 ạ.'), twoPointFive).sendable).toBe(true);
  });

  it('B2.3 cach viet rut gon cua CHINH con so da uy quyen van gui duoc', () => {
    const authority = mergeAuthority(grantsFromQuote([1_150_000]));

    // Chan mot CON SO bia, khong chan mot CACH VIET: 1.150k va 1,15tr deu la 1.150.000.
    expect(decideOutboundAuthority(draft('Dạ 1.150k ạ.'), authority).sendable).toBe(true);
    expect(decideOutboundAuthority(draft('Dạ 1,15tr ạ.'), authority).sendable).toBe(true);
    expect(decideOutboundAuthority(draft('Dạ 1.150.000đ ạ.'), authority).sendable).toBe(true);
  });
});

/* ============================================================================================ *
 * B3 — GRANT PHAI MANG GIA TRI VA MUC, KHONG CHI MANG LOP
 * ============================================================================================ */

describe('B3 — chinh sach chinh xac tung loai, cam ket don chinh xac tung muc', () => {
  it('B3.1 dai ly "thanh toán ngay" KHONG phu cho ban nhap noi "ký gửi"', () => {
    const authority = mergeAuthority(grantsFromDealerPolicy('thanh_toan_ngay'));

    const verdict = decideOutboundAuthority(
      draft('Dạ bên em cho anh nhận hàng ký gửi ạ.'),
      authority,
    );

    expect(verdict.sendable).toBe(false);
    expect(verdict.reason).toBe('POLICY_STATEMENT_NOT_AUTHORIZED');
  });

  it('B3.2 dai ly "ký gửi" KHONG phu cho ban nhap noi "thanh toán ngay"', () => {
    const authority = mergeAuthority(grantsFromDealerPolicy('ky_gui'));

    expect(
      decideOutboundAuthority(draft('Dạ đơn này thanh toán ngay ạ.'), authority).sendable,
    ).toBe(false);
  });

  it('B3.3 dai ly ky han 45 ngay KHONG phu cho cau "công nợ 30 ngày"', () => {
    const authority = mergeAuthority(grantsFromDealerPolicy('cong_no_45'));

    expect(
      decideOutboundAuthority(draft('Dạ bên em cho công nợ 30 ngày ạ.'), authority).sendable,
    ).toBe(false);
    expect(
      decideOutboundAuthority(draft('Dạ bên em cho công nợ 45 ngày ạ.'), authority).sendable,
    ).toBe(true);
  });

  it('B3.4 don `needs_edit` KHONG cho phep noi "đã chốt đơn"', () => {
    const verdict = decideOutboundAuthority(
      draft('Dạ em đã chốt đơn cho anh rồi ạ.'),
      persisted('needs_edit'),
    );

    expect(verdict.sendable).toBe(false);
    expect(verdict.reason).toBe('ORDER_COMMITMENT_LEVEL_NOT_AUTHORIZED');
  });

  it('B3.5 don `needs_edit` VAN cho phep noi "đã ghi nhận đơn" (dung muc)', () => {
    const verdict = decideOutboundAuthority(
      draft('Dạ em đã ghi nhận đơn của anh ạ.'),
      persisted('needs_edit'),
    );

    expect(verdict).toMatchObject({ sendable: true });
  });

  it('B3.6 don `approved` cho phep noi "đã chốt đơn"', () => {
    const verdict = decideOutboundAuthority(
      draft('Dạ em đã chốt đơn cho anh rồi ạ.'),
      persisted('approved'),
    );

    expect(verdict).toMatchObject({ sendable: true });
  });

  it('B3.7 don `draft` khong cap mot muc cam ket nao', () => {
    const verdict = decideOutboundAuthority(
      draft('Dạ em đã ghi nhận đơn của anh ạ.'),
      persisted('draft'),
    );

    expect(verdict.sendable).toBe(false);
    expect(verdict.reason).toBe('ORDER_COMMITMENT_NOT_AUTHORIZED');
  });
});

/* ============================================================================================ *
 * PHAN QUYET GAN CHAT VOI DUNG DOAN VAN DA XET
 *
 * Khuyen nghi cua review: mot verdict PASS khong duoc phep song sot neu van ban bi thay sau luc
 * soan. Neu khong, "sua ban nhap roi bam gui" la mot duong di vong hoan chinh.
 * ============================================================================================ */

describe('verdict di kem dau van ban da xet', () => {
  it('phan quyet cho MOT doan van khong dung duoc cho doan van khac', () => {
    const authority = mergeAuthority(grantsFromQuote([990_000]));
    const original = 'Dạ đơn giá 990.000đ ạ.';
    const verdict = decideOutboundAuthority(draft(original), authority);
    expect(verdict.sendable).toBe(true);

    const trace = { outboundAuthority: verdict } as never;

    expect(pinnedOutboundVerdict(trace, original).sendable).toBe(true);
    expect(pinnedOutboundVerdict(trace, 'Dạ đơn giá 1.990.000đ ạ.')).toMatchObject({
      sendable: false,
      reason: 'AUTHORITY_PAYLOAD_MISMATCH',
    });
  });

  it('dau van ban khong doi khi chi khac khoang trang thua', () => {
    // Duong gui co thoi them nhan tu dong / gop dong. Dau phai on dinh truoc nhung thay doi
    // KHONG mang noi dung, neu khong cong se bao dong gia lien tuc va bi tat.
    expect(outboundFingerprint('Dạ  em chào anh ạ.\n')).toBe(
      outboundFingerprint('Dạ em chào anh ạ.'),
    );
  });

  it('vang mat phan quyet van la KHONG GUI', () => {
    expect(pinnedOutboundVerdict(undefined, 'bat ky')).toMatchObject({
      sendable: false,
      reason: 'AUTHORITY_DECISION_ABSENT',
    });
  });
});

/* ============================================================================================ *
 * DUONG HOP LE KHONG BI CONG NAY LAM HONG (muc 11/12 hop dong)
 * ============================================================================================ */

describe('duong hop le van chay', () => {
  it('van ban do tang tat dinh dung van di thang', () => {
    const verdict = decideOutboundAuthority(
      { text: 'Tổng: 11.500.000đ', provenance: 'deterministic' },
      NO_AUTHORITY,
    );

    expect(verdict).toMatchObject({ sendable: true, reason: 'DETERMINISTIC_AUTHORITY' });
  });

  it('don da tinh gia cho phep nhac lai dung cac con so cua chinh no', () => {
    const authority = mergeAuthority(
      grantsFromPersistedOrder({
        status: 'approved',
        priced: priced({ itemsSubtotal: 11_500_000, grandTotal: 11_500_000 }),
      }),
    );

    const verdict = decideOutboundAuthority(
      draft('Dạ em đã chốt đơn, tổng 11.500.000đ ạ.'),
      authority,
    );

    expect(verdict).toMatchObject({ sendable: true });
  });
});
