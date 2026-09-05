import { describe, expect, it } from 'vitest';
import { OUTBOUND_BLOCK_KINDS } from '@netviet/shared';
import { decideOutboundAuthority } from './outbound-authority.js';
import { NO_BUSINESS_FACTS } from './outbound-facts.js';
import {
  APPROVED_DOC,
  authorityFor,
  blockText,
  compose,
  facts,
  line,
  orderStateFactsFor,
  plan,
  policyFacts,
  pricedFacts,
  pricedOrder,
  quoteFacts,
  tellableAll,
} from './__tests__/composition.fixture.js';

/**
 * MA TRAN HOI QUY CUA MUC 8 HOP DONG #189 — phan CAU TRUC.
 *
 * ---------------------------------------------------------------------------------------------
 * DIEU BO TEST NAY CHUNG MINH, va no khac han bo test cua #187.
 *
 * Bo cu hoi: "bo trich co nhan ra khang dinh trong doan van khong?". Cau hoi do luon co mot cau
 * tra loi sai o dau do, vi ngon ngu vo han con tu dien thi huu han.
 *
 * Bo nay hoi: "co duong nao render ra mot khoi nghiep vu ma khong co du kien tat dinh khong?".
 * Cau hoi do tra loi duoc DUT KHOAT, vi so duong render la huu han va chung deu nam trong
 * `outbound-composer.ts`.
 *
 * Vi the moi bai duoi day khang dinh tren `composition.blocks` / `blockText()` — tuc tren THU
 * THUC SU DUOC DUNG — chu khong tren mot co `sendable`.
 */

describe('#189 muc 8 — am tinh cau truc: khong co du kien thi khong co khoi', () => {
  it('1. xin khoi bao gia ma khong co tham quyen dinh gia -> khong mot con so nao duoc render', () => {
    const composition = compose(plan(['price_quote'], 'Dạ em gửi giá cho mình ạ.'));

    expect(composition.blocks).toHaveLength(0);
    expect(composition.omitted).toEqual([{ kind: 'price_quote', reason: 'FACT_MISSING' }]);
    expect(composition.text).not.toMatch(/\d/u);
    /*
     * "gửi giá" cung khong ra duoc not (G5): nguon duy nhat cua luot ta cai ghe, khong nguon nao
     * noi ve viec gui gia. Truoc ban 05/09/2026 cau nay di duoc toi khach nhu mot loi hua se bao
     * gia — mot cau CO HE QUA ma luot khong co gi de dua no ra.
     *
     * Ket cuc `empty` la dung theo muc 5 hop dong: "omit it and produce an explicit safe handoff",
     * chu khong phai de model viet mot cau cam chung lap cho trong. Duong that se chuyen Sale.
     */
    expect(composition.mode).toBe('empty');
    expect(decideOutboundAuthority(composition, { grants: [] })).toMatchObject({
      sendable: false,
      reason: 'COMPOSITION_EMPTY',
    });
  });

  it('2. xin khoi chinh sach thanh toan ma khong co tham quyen chinh sach -> khong cau nao duoc render', () => {
    const composition = compose(plan(['payment_policy'], 'Dạ em kiểm tra giúp mình ạ.'));

    expect(composition.blocks).toHaveLength(0);
    expect(composition.omitted).toEqual([{ kind: 'payment_policy', reason: 'FACT_MISSING' }]);
    expect(blockText(composition)).toBe('');
  });

  it('3. xin khoi xac nhan don ma khong co trang thai don ben vung -> khong cam ket nao duoc render', () => {
    const composition = compose(plan(['order_commitment'], 'Dạ em xem lại giúp mình ạ.'));

    expect(composition.blocks).toHaveLength(0);
    expect(composition.omitted).toEqual([{ kind: 'order_commitment', reason: 'FACT_MISSING' }]);
    expect(blockText(composition)).toBe('');
  });

  /*
   * CA 4 — day la lop bo sot ma chinh bao cao #187 goi ten: "bare numeral below 1000 with implied
   * k". `990` khong co don vi tien va nho hon nguong, nen bo trich vat mang KHONG coi no la tien.
   *
   * Ket qua van la chan, va bang HAI lop doc lap:
   *   · CAU TRUC — khong co `facts.quote` thi khong co khoi bao gia; khong co duong nao render gia.
   *   · NEO NGUON (G2) — `990` khong co trong nguon he thong, trong grant, hay trong tin khach.
   *
   * Bai nay khang dinh CA HAI, va thu tu do la co y: lop cau truc la lop khong the bo sot.
   */
  it('4. model nhet "giá 990" vao truong van xuoi -> khong ra duoc mot khang dinh gia co tham quyen', () => {
    const composition = compose(plan([], 'Dạ ghế Felix giá 990 thôi ạ, mình lấy nhé.'));

    expect(composition.blocks).toHaveLength(0);
    expect(composition.narrative).toEqual({ admitted: false, reason: 'NUMERAL_NOT_GROUNDED' });
    expect(composition.text).toBe('');
    expect(composition.mode).toBe('empty');
    expect(decideOutboundAuthority(composition, { grants: [] })).toMatchObject({
      sendable: false,
      reason: 'COMPOSITION_EMPTY',
    });
  });

  /*
   * CA 5 — BAI NAY LA CHINH BLOCKER CUA REVIEW DOC LAP 05/09/2026, VA NO DA TUNG KHANG DINH
   * NGUOC LAI.
   *
   * Ban truoc bai nay chung minh "khong co KHOI chinh sach nao" roi dung lai o do — va khang dinh
   * tiep rang cau van van `sendable: true`. Review chi thang ra rang do la doc sai hop dong: muc 2
   * noi ve VAN BAN KHACH NHIN THAY, khong ve `blocks[]`. Khach doc "bên em cho mình khất tiền
   * hàng tới khi bán xong" thi da nhan mot loi hua cong no, bat ke ben trong he thong goi no la
   * gi. Mot bai test chung minh cau do di duoc toi khach la mot bai test chung minh mot lo hong.
   *
   * Cai chan no BAY GIO khong phai cau truc khoi, ma la G5: cac chu "khất", "tiền", "hàng",
   * "bán", "xong" khong co trong nguon he thong nao cua luot (`APPROVED_DOC` ta cai ghe). Va G5
   * chan duoc no MA KHONG CAN nhan ra day la mot cau chinh sach — do la ca diem cua no.
   *
   * `POLICY_SURFACES` KHONG duoc dong den. Neu mot ngay nao do ai do vá bai nay bang cach them
   * "khat tien hang" vao do, hay doc lai #187: danh sach cam dai them mot muc thi lop bo sot chi
   * dich di mot cho, con danh sach cho thi khong co lop bo sot de dich.
   */
  it('5. cum chinh sach LA, khong chu so, ngoai POLICY_SURFACES -> KHONG den duoc tay khach', () => {
    const composition = compose(plan([], 'Dạ bên em cho mình khất tiền hàng tới khi bán xong ạ.'));

    expect(composition.blocks).toHaveLength(0);
    expect(composition.narrative).toEqual({
      admitted: false,
      reason: 'NARRATIVE_NOT_SOURCE_BACKED',
    });
    // Khang dinh QUAN TRONG NHAT cua ca tep: cau do khong con mot ky tu nao trong van ban gui ra.
    expect(composition.text).toBe('');
    expect(composition.text).not.toContain('khất');
    expect(composition.mode).toBe('empty');
    expect(decideOutboundAuthority(composition, { grants: [] })).toMatchObject({
      sendable: false,
      reason: 'COMPOSITION_EMPTY',
    });
  });

  it('6. cach viet cam ket KHONG DAU chua tung gap -> khong vuot qua duoc tham quyen trang thai', () => {
    // `draft` khong uy quyen muc cam ket nao; du model xin khoi, khoi van bien mat.
    const composition = compose(
      plan(['order_commitment'], 'Da don cua minh he thong nhan roi nhe anh oi.'),
      orderStateFactsFor('draft'),
    );

    expect(composition.blocks).toHaveLength(0);
    expect(composition.omitted).toEqual([
      { kind: 'order_commitment', reason: 'COMMITMENT_LEVEL_UNAVAILABLE' },
    ]);
    expect(blockText(composition)).toBe('');
  });

  /*
   * CA 7 — muc 3 hop dong: "a type tag chosen by the same model is not business authority".
   *
   * Model o day lam DUNG mot dieu: gan cho mot cau he qua cai nhan it bi soi nhat (`faq`, khong
   * xin khoi nao). Neu `mode` duoc suy tu nhan do thi day la mot duong di vong hoan chinh. `mode`
   * duoc suy tu SO KHOI DUNG DUOC, nen cai nhan khong mua duoc gi.
   */
  it('7. model gan nhan `faq` cho mot cau he qua -> nhan khong cap tham quyen', () => {
    const composition = compose(
      plan([], 'Dạ đơn của mình đã được chốt, tổng 11.500.000đ, công nợ 30 ngày ạ.', 'faq'),
      pricedFacts(),
    );

    expect(composition.planKind).toBe('faq');
    expect(composition.blocks).toHaveLength(0);
    /*
     * Loi nhan mang BA vat mang: 11.500.000d (co tham quyen -> G4), "30 ngày" (khong co o dau ->
     * G2) va "đã được chốt" (khong co trang thai don -> G3). Ma bao ve phai la cai NANG NHAT:
     * mot con so hoan toan bia. Bao G4 o day se doc len nhu mot loi dinh tuyen va lam nguoi truc
     * bo qua chuyen model vua tu nghi ra mot ky han cong no.
     */
    expect(composition.narrative).toEqual({ admitted: false, reason: 'NUMERAL_NOT_GROUNDED' });
    expect(composition.text).toBe('');
  });
});

describe('#189 muc 8 — duong duong: du kien co that thi render DUNG con so tat dinh', () => {
  it('11. bao gia co tham quyen -> render dung don gia cua bang gia', () => {
    const quote = quoteFacts();
    const composition = compose(plan(['price_quote'], 'Dạ em gửi giá ạ.'), quote);

    expect(composition.mode).toBe('deterministic_business');
    expect(blockText(composition)).toContain('1.150.000đ');
    expect(blockText(composition)).toContain('Ghế Felix');
    expect(blockText(composition)).toContain('kỳ 2026-09');
    expect(decideOutboundAuthority(composition, authorityFor(quote))).toMatchObject({
      sendable: true,
      reason: 'AUTHORITY_SATISFIED',
      claims: ['financial'],
    });
  });

  it('12. don da tinh gia -> render dung don gia / thanh tien / tam tinh / tong', () => {
    const priced = pricedOrder({
      lines: [line({ quantity: 10 })],
      shippingFee: 200_000,
      codCollect: true,
      codFee: 50_000,
      vat: true,
      vatAmount: 1_150_000,
    });
    const turn = pricedFacts(priced);
    const composition = compose(plan(['order_pricing'], 'Dạ em chốt đơn giúp mình ạ.'), turn);
    const text = blockText(composition);

    expect(text).toContain('10 x 1.150.000đ = 11.500.000đ');
    expect(text).toContain('Tạm tính: 11.500.000đ');
    expect(text).toContain('Cước vận chuyển: 200.000đ');
    expect(text).toContain('Thu hộ (COD): 50.000đ');
    expect(text).toContain('VAT: 1.150.000đ');
    expect(text).toContain('Tổng đơn: 12.900.000đ');
    expect(decideOutboundAuthority(composition, authorityFor(turn))).toMatchObject({
      sendable: true,
      reason: 'AUTHORITY_SATISFIED',
    });
  });

  it('13. chinh sach thanh toan co tham quyen -> render dung loai va ky han cua chinh dai ly do', () => {
    const turn = policyFacts('cong_no_45');
    const composition = compose(plan(['payment_policy']), turn);

    expect(blockText(composition)).toContain('Công nợ 45 ngày');
    expect(blockText(composition)).toContain('Meta HN');
    expect(blockText(composition)).not.toContain('30 ngày');
    expect(decideOutboundAuthority(composition, authorityFor(turn))).toMatchObject({
      sendable: true,
      reason: 'AUTHORITY_SATISFIED',
      claims: ['policy'],
    });
  });

  it('14. `needs_edit` cho phep "da ghi nhan" nhung KHONG cho phep "da chot"', () => {
    const composition = compose(plan(['order_commitment']), orderStateFactsFor('needs_edit'));

    expect(blockText(composition)).toContain('đã được ghi nhận');
    expect(blockText(composition)).not.toContain('đã được chốt');
  });

  it('15. `approved` cho phep "da chot"; `sent`/`synced` len den muc da gui xac nhan', () => {
    expect(
      blockText(compose(plan(['order_commitment']), orderStateFactsFor('approved'))),
    ).toContain('đã được chốt');
    expect(blockText(compose(plan(['order_commitment']), orderStateFactsFor('sent')))).toContain(
      'đã gửi xác nhận',
    );
    expect(blockText(compose(plan(['order_commitment']), orderStateFactsFor('synced')))).toContain(
      'đã gửi xác nhận',
    );
  });

  it('16. cau FAQ thuong khong mang he qua van di duoc toi khach', () => {
    const composition = compose(
      plan([], 'Dạ ghế Felix có tựa lưng lưới. Khung thép sơn tĩnh điện ạ.'),
    );

    expect(composition.mode).toBe('narrative_only');
    expect(composition.text).toContain('tựa lưng lưới');
    expect(decideOutboundAuthority(composition, { grants: [] })).toMatchObject({
      sendable: true,
      reason: 'NARRATIVE_ONLY_COMPOSITION',
    });
  });
});

describe('#189 — khoi khong co nguon tat dinh trong repo', () => {
  /*
   * KHUYEN MAI va PHE DUYET khong co bo phan nao trong repo cap quyen cho chung (muc 10 hop dong
   * loai tru promotion engine). Bai nay chung minh dieu do la mot TINH CHAT, khong phai mot thieu
   * sot dang cho ai do vo tinh vá: du xin bao nhieu lan, du luot co day du tham quyen tien va
   * chinh sach, hai khoi nay van khong render ra mot ky tu nao.
   */
  it('xin khuyen mai / phe duyet -> luon bi bo voi NO_AUTHORITY_SOURCE', () => {
    const turn = pricedFacts(pricedOrder({ policy: 'cong_no_30' }));
    const composition = compose(plan(['promotion', 'approval', 'order_pricing']), turn);

    expect(composition.omitted).toEqual([
      { kind: 'promotion', reason: 'NO_AUTHORITY_SOURCE' },
      { kind: 'approval', reason: 'NO_AUTHORITY_SOURCE' },
    ]);
    expect(composition.blocks.map((block) => block.kind)).toEqual(['order_pricing']);
  });

  it('MOI loai khoi deu duoc bo soan xu ly — them mot loai moi ma quen render se lo ra o day', () => {
    // Khong co du kien nao: moi khoi phai ra mot ly do bo CO MA, khong duoc im lang bien mat.
    const composition = compose(plan(OUTBOUND_BLOCK_KINDS), NO_BUSINESS_FACTS);

    expect(composition.omitted.map((entry) => entry.kind).sort()).toEqual(
      [...OUTBOUND_BLOCK_KINDS].sort(),
    );
    expect(composition.blocks).toHaveLength(0);
  });
});

describe('#189 — bo soan la ham thuan, va thu tu khoi khong theo thu tu model liet ke', () => {
  it('cung dau vao ra cung van ban va cung dau', () => {
    const turn = quoteFacts();
    const first = compose(plan(['price_quote'], 'Dạ em gửi giá ạ.'), turn);
    const second = compose(plan(['price_quote'], 'Dạ em gửi giá ạ.'), turn);

    expect(second.text).toBe(first.text);
    expect(second.fingerprint).toBe(first.fingerprint);
  });

  it('xin trung lap / dao thu tu van ra dung mot van ban', () => {
    const turn = facts(
      pricedFacts(pricedOrder({ policy: 'cong_no_30' })),
      policyFacts('cong_no_30'),
    );
    const a = compose(plan(['payment_policy', 'order_pricing', 'order_pricing']), turn);
    const b = compose(plan(['order_pricing', 'payment_policy']), turn);

    expect(a.text).toBe(b.text);
    expect(a.blocks.map((block) => block.kind)).toEqual(['order_pricing', 'payment_policy']);
  });
});

describe('#189 — hop dong neo nguon cho loi nhan', () => {
  it('G1: luot khong tra cuu duoc nguon he thong nao -> khong co van xuoi nao ra khach', () => {
    const composition = compose(plan([], 'Dạ máy này dùng tốt lắm ạ.'), NO_BUSINESS_FACTS, {
      evidence: tellableAll([]),
    });

    expect(composition.narrative).toEqual({ admitted: false, reason: 'NO_SYSTEM_SOURCE' });
    expect(composition.text).toBe('');
  });

  /*
   * TEN BAI DA DOI TU #200. Ban truoc goi la "do luong cho thay 26% tai lieu bi bo trich bao dong
   * gia" va dung mot nguon KHAC voi loi nhan ("Đưa ra lưu lượng gió..." vs "lưu lượng gió...").
   * Sau G6 thi menh de phai trung tron ven, nen bai nay khong con do duoc phep HAP THU bao dong
   * gia cua G3 nua — cai no do la: mot con so cua tai lieu di ra duoc, va di ra duoi dang KY TU
   * CUA TAI LIEU. Phep hap thu bao dong gia van con, va van do o `outbound-authority.spec.ts`.
   */
  it('G2: con so CO trong tai lieu da duyet thi noi duoc, va no ra duoi dang ky tu cua tai lieu', () => {
    const composition = compose(
      plan([], 'Dạ lưu lượng gió lên tới 9700 lít/phút ạ.'),
      NO_BUSINESS_FACTS,
      { evidence: tellableAll(['Lưu lượng gió lên tới 9700 lít/phút.']) },
    );

    // Van ban den tay khach la KY TU CUA NGUON (G6, #200) — chu hoa đầu menh de la cua tai lieu.
    expect(composition.narrative).toEqual({
      admitted: true,
      text: 'Dạ Lưu lượng gió lên tới 9700 lít/phút ạ.',
    });
  });

  /*
   * CAU XAC NHAN SO LUONG DOI CHU TU #200, VA DAY LA MOT DANH DOI DA CHON, KHONG PHAI MOT LOI.
   *
   * Truoc #200 bai nay chung minh cau "Dạ Ghế Felix 20 cái ạ." noi duoc: `20` neo vao TIN KHACH
   * (G2), "Ghế Felix"/"cái" neo vao DANH MUC (G5). Ca hai lop do van nguyen ven — nhung ca cau
   * ay khong la MENH DE cua nguon nao ca, no la mot cau model tu ghep tu hai manh, nen G6 bo no.
   *
   * Danh doi: mot cau xac nhan so luong khong con di duoc qua duong van xuoi. No van den tay
   * khach — qua KHOI `order_pricing`, noi so luong do `priceOrder()` cap va bo soan render. Bai
   * ngay duoi khoa lai dieu do, nen day khong phai mot nang luc bi mat, ma la mot nang luc bi
   * chuyen sang dung duong.
   */
  it('#200: cau xac nhan so luong tu ghep tu hai manh nguon KHONG con qua duong van xuoi', () => {
    const composition = compose(plan([], 'Dạ Ghế Felix 20 cái ạ.'), NO_BUSINESS_FACTS, {
      customerText: 'lay 20 cai ghe Felix nhe',
      evidence: tellableAll(['Ghế Felix', 'cái']),
    });

    expect(composition.narrative).toEqual({
      admitted: false,
      reason: 'NARRATIVE_NOT_SOURCE_BOUND',
    });
  });

  it('#200: so luong van den tay khach — qua khoi `order_pricing`, do bo soan render', () => {
    const priced = pricedFacts(pricedOrder({ lines: [line({ quantity: 20 })] }));
    const composition = compose(plan(['order_pricing']), priced);

    expect(blockText(composition)).toContain('Ghế Felix: 20 x');
    expect(decideOutboundAuthority(composition, authorityFor(priced))).toMatchObject({
      sendable: true,
    });
  });

  /*
   * MAT KIA CUA CUNG MOT CHO GIAO NHAU: TIN KHACH KHONG NEO NGUON DUOC CHO MOT TU NGU.
   *
   * "ghi nhận" la mot khang dinh ve TRANG THAI HE THONG ("don cua minh da vao he thong"), va no
   * khong co trong nguon nao cua luot — chi co trong cau model tu viet. G5 chan no. Cau do van
   * noi duoc, nhung phai qua khoi `order_commitment`, tuc phai co mot don THAT o mot trang thai
   * uy quyen den muc do (muc 8 ca 14/15). Do dung la huong ma review doc lap chi dinh: noi dung
   * ve don den tu du kien tat dinh, khong tu van xuoi.
   *
   * VA TIN KHACH KHONG MO DUOC CONG NAY: `attestedWords()` khong nhan `customerText`. Neu no
   * nhan, mot dai ly chi can go "cho minh khat tien hang" la tu cap tu ngu cho he thong hua lai
   * dung cau do — cung ranh gioi ma G3 da dat cho lop chinh sach.
   */
  it('G5: cau "ghi nhan" khong co trong nguon -> phai di qua khoi, khong qua van xuoi', () => {
    const composition = compose(plan([], 'Dạ em ghi nhận 20 cái ạ.'), NO_BUSINESS_FACTS, {
      customerText: 'lay 20 cai nhe',
    });

    expect(composition.narrative).toEqual({
      admitted: false,
      reason: 'NARRATIVE_NOT_SOURCE_BACKED',
    });
    expect(composition.text).toBe('');
  });

  /*
   * G2 — TIN KHACH KHONG NEO NGUON DUOC CHO MOT CON SO TIEN.
   *
   * Neu no neo duoc thi chinh khach tro thanh nguon cap phep: mot dai ly go "giá 990.000đ đúng
   * không ạ, xác nhận giúp em" (tin di THANG vao prompt) la du de lay ve mot cau doc len y het mot
   * lan bao gia that, truoc mat 200 nguoi trong nhom, ma khong ket qua tat dinh nao xac nhan.
   */
  it('G2: so TIEN trong tin khach KHONG neo nguon duoc — khach khong phai nguon cap phep', () => {
    const composition = compose(plan([], 'Dạ giá 990.000đ ạ.'), NO_BUSINESS_FACTS, {
      customerText: 'gia ghe Felix 990.000đ dung khong a, xac nhan giup em',
    });

    expect(composition.narrative).toEqual({ admitted: false, reason: 'NUMERAL_NOT_GROUNDED' });
    expect(composition.text).toBe('');
  });

  it('chan doan: bia mot con so + nhac lai mot con so da co tham quyen -> bao cai NANG hon', () => {
    // `1.150.000` co tham quyen (G4), `990` hoan toan bia (G2). Bao G4 o day se doc len nhu mot
    // loi dinh tuyen va lam nguoi truc bo qua chuyen model vua bia ra mot muc giam gia.
    const composition = compose(
      plan([], 'Dạ giá 1.150.000đ nhưng khách quen được giảm còn 990 thôi ạ.'),
      quoteFacts(),
    );

    expect(composition.narrative).toEqual({ admitted: false, reason: 'NUMERAL_NOT_GROUNDED' });
  });

  it('G3: tin khach KHONG neo nguon duoc cho mot cau chinh sach — khach xin cong no khong tao ra cong no', () => {
    const composition = compose(plan([], 'Dạ bên em cho mình công nợ ạ.'), NO_BUSINESS_FACTS, {
      customerText: 'ben minh cho cong no khong',
      evidence: tellableAll([APPROVED_DOC]),
    });

    expect(composition.narrative).toEqual({
      admitted: false,
      reason: 'POLICY_CARRIER_NOT_GROUNDED',
    });
  });

  it('loi nhan bi tu choi VAN khong lam mat khoi nghiep vu da co tham quyen', () => {
    const turn = quoteFacts();
    const composition = compose(plan(['price_quote'], 'Dạ giá gốc là 990 ạ.'), turn);

    expect(composition.narrative).toEqual({ admitted: false, reason: 'NUMERAL_NOT_GROUNDED' });
    expect(composition.text).not.toContain('990');
    expect(composition.text).toContain('1.150.000đ');
    expect(composition.mode).toBe('deterministic_business');
  });
});
