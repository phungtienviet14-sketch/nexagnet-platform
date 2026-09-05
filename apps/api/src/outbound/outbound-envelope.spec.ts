import { describe, expect, it } from 'vitest';
import { decideOutboundAuthority } from './outbound-authority.js';
import { claimedCommitmentLevel, monetaryLiterals, policyClaimTokens } from './outbound-claims.js';
import { attestedWords, ENVELOPE_WORDS, unattestedWords } from './outbound-envelope.js';
import { NO_BUSINESS_FACTS } from './outbound-facts.js';
import { compose, plan, quoteFacts } from './__tests__/composition.fixture.js';

/**
 * G5 — LOI NHAN PHAI CO NGUON, VA VO HOI THOAI KHONG DUOC TRO THANH CONG SAU.
 *
 * ---------------------------------------------------------------------------------------------
 * BO TEST NAY CANH MOT RUI RO CU THE, KHONG PHAI MOT KHAI NIEM.
 *
 * `CONVERSATIONAL_ENVELOPE` la mot danh sach CHO — tuc no la thu duy nhat trong ca duong di co
 * the bien G5 tro lai thanh mot cong hong mo. Them mot muc "chi de cau van muot hon" ma muc do
 * tinh co mang nghia thuong mai (`nợ`, `giá`, `tặng`, `duyệt`, ...) la mo lai dung cai cong ma
 * #189 dong lai, VA lam no kho thay hon truoc — vi luc do lo hong nam trong mot danh sach tu
 * chuc nang trong vo hai.
 *
 * Nen bo test duoi day khong doi chieu hai DANH SACH voi nhau (hai danh sach lech nhau am tham).
 * No cho tung tu di qua CHINH BA BO NHAN DANG that cua he thong, va doi ca ba deu im lang.
 */

describe('#189 G5 — vo hoi thoai khong duoc mang mot nghia nghiep vu nao', () => {
  /*
   * BAT BIEN QUAN TRONG NHAT CUA CA TEP.
   *
   * Neu ai do them `no` (de viet "nó") thi bai nay do ngay o `policyClaimTokens`, va do la dung
   * cai da tung xay ra trong luc do luong: bo dau thi `nợ` (mon no) va `nó` (dai tu) khong phan
   * biet duoc nua.
   */
  it('khong tu chuc nang nao la vat mang tien / chinh sach / cam ket don', () => {
    for (const word of ENVELOPE_WORDS) {
      expect(policyClaimTokens(word), word).toEqual([]);
      expect(monetaryLiterals(word), word).toEqual([]);
      expect(claimedCommitmentLevel(word), word).toBeNull();
    }
  });

  /*
   * Ghep TOAN BO danh sach lai thanh mot chuoi roi hoi ba bo nhan dang mot lan nua.
   *
   * Bai tren xet tung tu roi rac; bai nay bat cac cap tu chi thanh khang dinh KHI DUNG CANH NHAU
   * (vd `don` + mot the hoan thanh). Mot muc moi vo hai mot minh nhung tao ra cum voi muc san co
   * se do o day chu khong do o bai tren.
   */
  it('ghep ca danh sach lai van khong thanh mot khang dinh nao', () => {
    const everything = ENVELOPE_WORDS.join(' ');

    expect(policyClaimTokens(everything)).toEqual([]);
    expect(monetaryLiterals(everything)).toEqual([]);
    expect(claimedCommitmentLevel(everything)).toBeNull();
  });

  it('khong tu chuc nang nao chua chu so — chu so thuoc G2/G4', () => {
    for (const word of ENVELOPE_WORDS) expect(word, word).not.toMatch(/\d/u);
  });

  it('danh sach khong co muc trung — trung la dau hieu hai nguoi sua hai lan', () => {
    expect(new Set(ENVELOPE_WORDS).size).toBe(ENVELOPE_WORDS.length);
  });
});

describe('#189 G5 — tu ngu noi dung phai co mat trong nguon he thong cua luot', () => {
  const APPROVED = [
    'Ghế Felix có tựa lưng lưới, khung thép sơn tĩnh điện.',
    'Lưu lượng gió lên tới 9700 lít/phút, 9 cấp độ gió.',
  ];

  /*
   * CORPUS TAN CONG — moi cau la mot KHANG DINH CO HE QUA that su, va KHONG cau nao trung
   * `POLICY_SURFACES` theo cach ma #187 da liet ke.
   *
   * Do la ca diem: G5 chan chung ma khong nhan ra chung la gi. Khong mot muc nao duoi day duoc
   * phep xuat hien trong `outbound-claims.ts` — neu ai do "sua" bai nay bang cach them cum tu vao
   * tu dien thi ho da quay lai #187, va review doc lap da tu choi dung dieu do hai lan.
   */
  const CONSEQUENTIAL: readonly string[] = [
    'Dạ bên em cho mình khất tiền hàng tới khi bán xong ạ.',
    'Dạ mình cứ lấy hàng đi, bán không hết bên em nhận lại hết ạ.',
    'Dạ anh cứ nhận hàng trước, tiền gửi sau cũng được ạ.',
    'Dạ sản phẩm này bên em bảo hành trọn đời cho mình luôn ạ.',
    'Dạ khách quen bên em bớt cho mình một chút ạ.',
    'Dạ bên em giữ nguyên giá này cho mình tới cuối năm ạ.',
    'Dạ dùng thử thoải mái, không ưng bên em đổi trả vô tư ạ.',
    'Dạ bên em tặng kèm quà cho mình ạ.',
    'Dạ đơn này bên em không tính cước ạ.',
    'Dạ đây là giá tốt nhất bên em có thể làm cho mình ạ.',
    'Dạ bên em cho mình nợ ạ.',
  ];

  it('khong cau he qua nao di duoc toi khach, va khong cau nao con ky tu trong van ban', () => {
    for (const text of CONSEQUENTIAL) {
      const composition = compose(plan([], text), NO_BUSINESS_FACTS, { systemSources: APPROVED });

      expect(composition.narrative, text).toMatchObject({ admitted: false });
      expect(composition.text, text).toBe('');
      expect(decideOutboundAuthority(composition, { grants: [] }), text).toMatchObject({
        sendable: false,
      });
    }
  });

  /*
   * DOI TRONG BAT BUOC — muc 8 ca 16 hop dong ("ordinary non-consequential FAQ remains usable").
   *
   * Mot cong chan het thi khong chung minh duoc gi. Bai nay va bai tren phai cung xanh.
   */
  it('cau tra loi lay tu chinh tai lieu da duyet van di duoc toi khach', () => {
    const composition = compose(
      plan([], 'Dạ ghế Felix có tựa lưng lưới, khung thép sơn tĩnh điện ạ.'),
      NO_BUSINESS_FACTS,
      { systemSources: APPROVED },
    );

    expect(composition.narrative).toMatchObject({ admitted: true });
    expect(composition.text).toContain('tựa lưng lưới');
  });

  /*
   * TIN KHACH KHONG PHAI NGUON CAP TU NGU.
   *
   * Neu no la, thi mot dai ly biet chuyen nay chi can go dung cau minh muon nghe la tu cap tu ngu
   * cho he thong hua lai — tin khach di THANG vao prompt. Do la cung ranh gioi ma G3 da dat cho
   * lop chinh sach ("khach xin cong no khong lam cho he thong co quyen hua cong no"), va no phai
   * dung ca o lop tu ngu.
   */
  it('khach go dung cau do KHONG mo duoc cong — tin khach khong neo nguon cho tu ngu', () => {
    const composition = compose(
      plan([], 'Dạ bên em cho mình khất tiền hàng tới khi bán xong ạ.'),
      NO_BUSINESS_FACTS,
      {
        systemSources: APPROVED,
        customerText: 'ben em cho minh khat tien hang toi khi ban xong duoc khong',
      },
    );

    expect(composition.narrative).toEqual({
      admitted: false,
      reason: 'NARRATIVE_NOT_SOURCE_BACKED',
    });
  });

  /*
   * KHOI VUA RENDER KHONG BAO LANH CHO VAN XUOI.
   *
   * Cung ly do voi `widen()` o lop so: neu khoi bao gia vua render "Ghế Felix" ma lai cap tu ngu
   * cho loi nhan, thi bo soan tu neo cho chinh minh — mot vong lap kin. Tap tu ngu duoc phep phai
   * la thu he thong DA CO TRUOC khi soan.
   */
  it('khoi da render khong cap tu ngu cho loi nhan — bo soan khong tu neo cho chinh minh', () => {
    const composition = compose(
      // "Ghế Felix" se xuat hien trong khoi bao gia vua render, nhung nguon he thong thi khong ta
      // gi ve no. Loi nhan van phai bi bo.
      plan(['price_quote'], 'Dạ ghế Felix bên em bán chạy lắm ạ.'),
      quoteFacts(),
      { systemSources: ['Không có tài liệu nào về sản phẩm.'] },
    );

    expect(composition.narrative).toEqual({
      admitted: false,
      reason: 'NARRATIVE_NOT_SOURCE_BACKED',
    });
    // Khoi thi VAN render — loi nhan bi bo khong keo khoi di theo.
    expect(composition.blocks.map((block) => block.kind)).toEqual(['price_quote']);
    expect(composition.text).not.toContain('bán chạy');
  });
});

describe('#189 G5 — quet lai o diem nghen gui (phong thu chieu sau)', () => {
  /*
   * CHANG 3b bat thu ma chang soan KHONG the bat: mot doan van xuoi duoc GHEP THEM vao `text` sau
   * khi ban soan da xet. Chang soan chi nhin `plan.narrative`.
   *
   * Cau ghep them o day khong mang chu so, khong trung `POLICY_SURFACES`, va khong co danh tu don
   * — tuc no di lot ca ba bo nhan dang o chang 3. Thu chan no la G5: khong nguon nao noi.
   */
  it('ghep them mot cau vao van ban cuoi -> diem nghen gui tu choi', () => {
    const composition = compose(plan([], 'Dạ ghế Felix có tựa lưng lưới ạ.'), NO_BUSINESS_FACTS, {
      systemSources: ['Ghế Felix có tựa lưng lưới, khung thép sơn tĩnh điện.'],
    });
    const tampered = {
      ...composition,
      text: `${composition.text}\nDạ bên em cho mình khất tiền hàng tới khi bán xong ạ.`,
    };

    expect(decideOutboundAuthority(composition, { grants: [] })).toMatchObject({ sendable: true });
    expect(decideOutboundAuthority(tampered, { grants: [] })).toMatchObject({
      sendable: false,
      reason: 'COMPOSITION_TEXT_NOT_SOURCE_BACKED',
    });
  });

  it('dong cua khoi da render KHONG lam van ban cuoi bi tu choi', () => {
    const turn = quoteFacts();
    const composition = compose(plan(['price_quote'], ''), turn);

    // Khoi mang ten san pham, ky gia va cau qualifier — deu do bo soan viet, khong do model. Neu
    // chang 3b khong ke chung vao bang chung thi MOI ban co khoi deu bi tu choi.
    expect(composition.blocks).toHaveLength(1);
    expect(decideOutboundAuthority(composition, { grants: [] }).reason).not.toBe(
      'COMPOSITION_TEXT_NOT_SOURCE_BACKED',
    );
  });
});

describe('#189 G5 — hinh dang cua phep doi chieu', () => {
  it('doi chieu theo DUNG cach viet: `nó` trong nguon khong bao lanh cho `nợ`', () => {
    const attested = attestedWords(['Nguyên lý làm mát của quạt là hạ nhiệt độ, cho nên nó mát.']);

    expect(unattestedWords('nợ', attested)).toEqual(['nợ']);
    expect(unattestedWords('nó', attested)).toEqual([]);
  });

  it('cum thuan chu so khong di qua G5 — G2/G4 so khop chung theo GIA TRI', () => {
    const attested = attestedWords(['Bảo hành 3 năm.']);

    // "1150" khong co trong nguon, nhung G5 khong co y kien ve chu so: mot cach viet hop le
    // ("1.150.000đ" trong nguon vs "1150k" trong loi nhan) khong duoc phep chet o lop chuoi.
    expect(unattestedWords('1150', attested)).toEqual([]);
  });

  it('chu hoa/chu thuong khong lam doi ket qua', () => {
    const attested = attestedWords(['Ghế Felix có tựa lưng lưới.']);

    expect(unattestedWords('GHẾ FELIX', attested)).toEqual([]);
    expect(unattestedWords('ghế felix', attested)).toEqual([]);
  });
});
