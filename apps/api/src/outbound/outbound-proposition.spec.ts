import { describe, expect, it } from 'vitest';
import { decideOutboundAuthority } from './outbound-authority.js';
import { claimedCommitmentLevel, numeralLiterals, policyClaimTokens } from './outbound-claims.js';
import { NO_BUSINESS_FACTS } from './outbound-facts.js';
import {
  bindProposition,
  FILLER_WORDS,
  POLARITY_WORDS,
  sourceUnits,
} from './outbound-proposition.js';
import { authorityFor, compose, plan, quoteFacts } from './__tests__/composition.fixture.js';

/**
 * MUC 4 HOP DONG #200 — bon nhom bat buoc, cong cac lop giu nguyen an toan da co.
 *
 * Ca tep nay doc duoc nhu mot cau: mot loi nhan chi ra duoc kenh khi phan su kien cua no la
 * NHUNG MENH DE NGUYEN VEN cua he thong, phat ra tu ban sao cua he thong.
 */

/** Nguon tong hop cua muc 2 hop dong — hai menh de doi lap trong CUNG mot chuoi. */
const SAME_SOURCE = 'Khách hàng thanh toán ngay khi nhận hàng. Hàng bán xong không được đổi trả.';
/** Cung hai menh de do, nhung o HAI chuoi nguon khac nhau (hai lan tra cuu khac nhau). */
const SOURCE_A = 'Khách hàng thanh toán ngay khi nhận hàng.';
const SOURCE_B = 'Hàng bán xong không được đổi trả.';

const narrativeOf = (narrative: string, sources: readonly string[]) =>
  compose(plan([], narrative), NO_BUSINESS_FACTS, { systemSources: [...sources] });

describe('#200 — ghep lai tu ngu cua nguon trong CUNG mot nguon', () => {
  /*
   * DAY LA CA DUOC HOP DONG DAT TEN, VA NO TUNG GUI DUOC.
   *
   * Do tren `main` (`582ded3`) truoc khi sua: `admitted: true`, `mode: narrative_only`,
   * `sendable: true`, `NARRATIVE_ONLY_COMPOSITION`. Ky han thanh toan doi tu TRA NGAY KHI NHAN
   * HANG thanh TRA SAU KHI BAN XONG, ma khong mot chu nao nam ngoai nguon.
   */
  it('doi ky han thanh toan bang cach ghep lai chu cua nguon -> khong den tay khach', () => {
    const composition = narrativeOf('Khách hàng thanh toán khi bán xong.', [SAME_SOURCE]);

    expect(composition.narrative).toEqual({
      admitted: false,
      reason: 'NARRATIVE_NOT_SOURCE_BOUND',
    });
    expect(composition.text).toBe('');
    expect(decideOutboundAuthority(composition, { grants: [] })).toMatchObject({
      sendable: false,
      reason: 'COMPOSITION_EMPTY',
    });
  });

  /*
   * VI SAO NAM CONG TRUOC DEU IM VOI CHINH CAU DO — bai nay khoa lai phep chan doan cua review.
   *
   * Neu mot ngay nao do co nguoi "sua" G3 de bat cau nay bang mot cum tu moi thi bai duoi day do,
   * va do la dieu mong muon: no nhac rang cau nay KHONG duoc chan boi mot bo nhan dang, ma boi
   * phep rang buoc — muc 7 hop dong cam lay `POLICY_SURFACES` lam ban sua chinh.
   */
  it('bon cong truoc deu IM voi chinh cau do — G2, G3 va G4 khong thay gi', () => {
    const sentence = 'Khách hàng thanh toán khi bán xong.';

    expect(numeralLiterals(sentence)).toEqual([]);
    expect(policyClaimTokens(sentence)).toEqual([]);
    expect(claimedCommitmentLevel(sentence)).toBeNull();
  });

  it('cat duoi mot ngoai le o cuoi menh de cung la doi nghia -> bi chan', () => {
    const composition = narrativeOf('Dạ khách hàng thanh toán ngay ạ.', [SAME_SOURCE]);

    expect(composition.narrative).toMatchObject({ reason: 'NARRATIVE_NOT_SOURCE_BOUND' });
  });

  it('dao thu tu tu ngu trong cung mot menh de -> bi chan', () => {
    const composition = narrativeOf('Dạ thanh toán khách hàng ngay khi nhận hàng ạ.', [
      SAME_SOURCE,
    ]);

    expect(composition.narrative).toMatchObject({ reason: 'NARRATIVE_NOT_SOURCE_BOUND' });
  });
});

describe('#200 — phu dinh / dao nguoc bang chinh tu cua vo hoi thoai', () => {
  /*
   * `không`, `có`, `được`, `khi` DEU nam trong `CONVERSATIONAL_ENVELOPE` cua G5. Nen truoc ban
   * nay model dao nguoc duoc mot cau nguon MA KHONG CAN THEM MOT CHU NAO — G5 tang khong het.
   */
  it('bo chu `không` di thi cau con lai khong con la menh de nao', () => {
    const composition = narrativeOf('Hàng bán xong được đổi trả ạ.', [SAME_SOURCE]);

    expect(composition.narrative).toEqual({
      admitted: false,
      reason: 'NARRATIVE_NOT_SOURCE_BOUND',
    });
  });

  it('cat bo phan dau mang phu dinh roi giu ve sau -> bi chan', () => {
    const composition = narrativeOf('Dạ được đổi trả ạ.', [SAME_SOURCE]);

    expect(composition.narrative).toMatchObject({ reason: 'NARRATIVE_NOT_SOURCE_BOUND' });
  });

  /*
   * MOT TIENG "VANG" TRON VEN CUNG LA MOT LOI CAP PHEP.
   *
   * `được` la mot tu cuc, nen no co mat trong hau het tai lieu. Neu mot menh de chi gom tu cuc
   * bao lanh duoc thi "Dạ được ạ." — cau cap phep ngan nhat co the — se ra duoc kenh chi vi dau
   * do trong kho tai lieu co mot tieng "được". Cong `POLARITY` ton tai cho dung dieu nay.
   */
  it('`Dạ được ạ.` khong ra duoc kenh du nguon co chu `được`', () => {
    const composition = narrativeOf('Dạ được ạ.', [SAME_SOURCE]);

    expect(composition.narrative).toMatchObject({ reason: 'NARRATIVE_NOT_SOURCE_BOUND' });
  });

  it('mot menh de nguon chi gom tu cuc khong bao lanh duoc gi', () => {
    expect(sourceUnits(['Có. Được. Chưa.'])).toEqual([]);
  });
});

describe('#200 — ghep CHEO nhieu nguon da tra cuu trong mot luot', () => {
  /*
   * `AdvisorReply.sources` gom phang ket qua cua MOI lan tra cuu trong luot, va muc 2 hop dong
   * goi ten dung dieu do. Phep rang buoc khong doc tap gom phang do nhu MOT kho tu vung: mot
   * menh de khong bao gio trai qua hai chuoi nguon.
   */
  it('hai nguon rieng biet khong cong lai thanh mot tham quyen moi', () => {
    const composition = narrativeOf('Khách hàng thanh toán khi bán xong.', [SOURCE_A, SOURCE_B]);

    expect(composition.narrative).toEqual({
      admitted: false,
      reason: 'NARRATIVE_NOT_SOURCE_BOUND',
    });
  });

  it('nua menh de cua nguon A noi voi nua menh de cua nguon B -> bi chan', () => {
    const composition = narrativeOf('Khách hàng thanh toán không được đổi trả.', [
      SOURCE_A,
      SOURCE_B,
    ]);

    expect(composition.narrative).toMatchObject({ reason: 'NARRATIVE_NOT_SOURCE_BOUND' });
  });

  it('tung nguon rieng le van tra loi duoc — day khong phai "chan het"', () => {
    expect(
      narrativeOf('Dạ khách hàng thanh toán ngay khi nhận hàng ạ.', [SOURCE_A, SOURCE_B]),
    ).toMatchObject({ narrative: { admitted: true }, mode: 'narrative_only' });
    expect(
      narrativeOf('Dạ hàng bán xong không được đổi trả ạ.', [SOURCE_A, SOURCE_B]),
    ).toMatchObject({ narrative: { admitted: true } });
  });
});

describe('#200 — FAQ co nguon van dung duoc', () => {
  it('cau tra loi trich tron ven menh de nguon -> gui duoc, va van ban la ky tu cua NGUON', () => {
    const composition = narrativeOf('Dạ khách hàng thanh toán ngay khi nhận hàng ạ.', [SOURCE_A]);

    expect(composition.narrative).toEqual({
      admitted: true,
      text: 'Dạ Khách hàng thanh toán ngay khi nhận hàng ạ.',
    });
    expect(decideOutboundAuthority(composition, { grants: [] })).toMatchObject({
      sendable: true,
      reason: 'NARRATIVE_ONLY_COMPOSITION',
    });
  });

  it('menh de da trich duoc ghim vao bang chung de diem nghen gui kiem lai', () => {
    const composition = narrativeOf('Dạ khách hàng thanh toán ngay khi nhận hàng ạ.', [SOURCE_A]);

    expect(composition.grounded).toContain('x:Khách hàng thanh toán ngay khi nhận hàng');
  });

  it('mot luot nhieu menh de: model chon menh de nao va thu tu nao', () => {
    const composition = narrativeOf('Dạ hàng bán xong không được đổi trả ạ.', [SAME_SOURCE]);

    expect(composition.narrative).toEqual({
      admitted: true,
      text: 'Dạ Hàng bán xong không được đổi trả ạ.',
    });
  });

  /*
   * PHAT LAI TU NGUON, KHONG PHAI TU MODEL. Model go hoa het ca cau thi khach van doc duoc dung
   * ban cua he thong — day la cho tinh chat "renderer owns the statement" nhin thay duoc.
   */
  it('van ban den tay khach lay tu nguon, khong phai chuoi model viet', () => {
    const composition = narrativeOf('dạ HÀNG BÁN XONG KHÔNG ĐƯỢC ĐỔI TRẢ ạ.', [SAME_SOURCE]);

    expect(composition.text).toBe('dạ Hàng bán xong không được đổi trả ạ.');
  });
});

describe('#200 — dau noi model chon khong duoc khang dinh mot quan he', () => {
  /*
   * Hai CAU dung dat canh nhau van la hai cau dung — do la phan du da noi ro. Nhung mot dau NOI
   * thi khac: "A: B" doc len la "A, cu the la B", tuc mot quan he ma khong nguon nao khang dinh.
   *
   * Tu khi don vi rang buoc la CA CAU, dau hai cham / cham phay / gach ngang / dau phay khong con
   * la ranh gioi nua, nen mot loi nhan noi hai cau bang chung se thanh MOT doan khong trung cau
   * nao — va ca loi nhan bi bo.
   */
  it('dau hai cham noi hai cau -> ca loi nhan bi bo', () => {
    const composition = narrativeOf(
      'Dạ khách hàng thanh toán ngay khi nhận hàng: hàng bán xong không được đổi trả ạ.',
      [SAME_SOURCE],
    );

    expect(composition.narrative).toMatchObject({ reason: 'NARRATIVE_NOT_SOURCE_BOUND' });
  });

  it('gach ngang, cham phay va dau phay cung the', () => {
    for (const joiner of ['—', ';', ',']) {
      const composition = narrativeOf(
        `Dạ khách hàng thanh toán ngay khi nhận hàng ${joiner} hàng bán xong không được đổi trả ạ.`,
        [SAME_SOURCE],
      );

      expect(composition.narrative, joiner).toMatchObject({
        reason: 'NARRATIVE_NOT_SOURCE_BOUND',
      });
    }
  });

  it('noi bang dau cham thi duoc — do la hai cau nguon, va do la phan du da noi ro', () => {
    const composition = narrativeOf(
      'Dạ khách hàng thanh toán ngay khi nhận hàng. Hàng bán xong không được đổi trả ạ.',
      [SAME_SOURCE],
    );

    expect(composition.text).toBe(
      'Dạ Khách hàng thanh toán ngay khi nhận hàng. Hàng bán xong không được đổi trả ạ.',
    );
  });

  it('dau ket cau duoc giu — mot cau hoi khong phai mot cam ket', () => {
    const composition = narrativeOf('Dạ khách hàng thanh toán ngay khi nhận hàng ạ?', [
      SAME_SOURCE,
    ]);

    expect(composition.text).toBe('Dạ Khách hàng thanh toán ngay khi nhận hàng ạ?');
  });
});

describe('#200 — PHAN DU DA BIET: model chon duoc CAU NAO va THU TU NAO', () => {
  /*
   * BAI NAY GHI LAI MOT HANH VI CON MO, KHONG PHAI MOT TINH CHAT AN TOAN. No o day de khong ai —
   * ke ca ban bao cao bang chung — noi rang #200 da dong het moi duong.
   *
   * Muc 3 hop dong CHO PHEP model chon: "model may select/request a source reference or approved
   * fragment". Nen hai cau, moi cau deu la mot cau DA DUYET nguyen van, van dat canh nhau duoc —
   * va hai cau dung dat canh nhau co the doc ra mot y ma khong cau nao noi. Vi du duoi day den tu
   * vong review noi bo: mot cau gia + mot cau khuyen mai da het han cua CUNG mot tai lieu.
   *
   * Cai #200 dong la GHEP LAI TU NGU thanh mot menh de moi. Cai con mo la CHON va XEP. Ranh gioi
   * cho phan con mo nay khong nam o day, ma o khau DUYET NOI DUNG: mot tai lieu con cau khuyen
   * mai het han la mot tai lieu can go, va do la viec cua nguoi duyet (CLAUDE.md quyet dinh #10).
   *
   * Hai lop van con hieu luc len chinh vi du nay: G4 chan mot con so DA CO THAM QUYEN xuat hien
   * trong van xuoi (no phai di qua khoi bao gia), va khoi `promotion` thi LUON bi bo vi repo
   * khong co nguon tat dinh nao cho no.
   */
  const DOC =
    'Giá gốc ghế Felix là 1.150.000đ. Chương trình giảm giá 50% dịp khai trương áp dụng cho đơn đặt trong tháng 3/2024.';

  it('hai cau nguyen van cua cung mot tai lieu van dat canh nhau duoc', () => {
    const composition = narrativeOf(
      'Dạ giá gốc ghế Felix là 1.150.000đ. Chương trình giảm giá 50% dịp khai trương áp dụng cho đơn đặt trong tháng 3/2024 ạ.',
      [DOC],
    );

    expect(composition.narrative).toMatchObject({ admitted: true });
  });

  it('nhung ghep lai TU NGU cua chinh hai cau do thi khong', () => {
    const composition = narrativeOf('Dạ giá ghế Felix giảm giá 50% ạ.', [DOC]);

    expect(composition.narrative).toMatchObject({ reason: 'NARRATIVE_NOT_SOURCE_BOUND' });
  });
});

describe('#200 — hai tap tu boc khong duoc phep mang nghia thuong mai', () => {
  /*
   * DOI TRONG CUA CA THIET KE. `FILLER` la thu duy nhat model duoc tu viet, nen mot ngay nao do
   * ai them `nợ`, `giá`, `duyệt` vao do la mo lai dung cai cong nay dong. Bai nay khoa lai.
   */
  const COMMERCIAL = [
    'nợ',
    'giá',
    'tiền',
    'giảm',
    'tặng',
    'duyệt',
    'chốt',
    'ship',
    'cod',
    'vat',
    'khất',
    'thanh',
    'toán',
    'đổi',
    'trả',
    'bán',
  ];

  it('khong tu boc nao la tu thuong mai', () => {
    expect(FILLER_WORDS.filter((word) => COMMERCIAL.includes(word))).toEqual([]);
  });

  it('khong tu cuc nao la tu thuong mai', () => {
    expect(POLARITY_WORDS.filter((word) => COMMERCIAL.includes(word))).toEqual([]);
  });

  /*
   * HAI TAP KHONG DUOC GIAO NHAU. Mot tu vua duoc cat o hai dau (`FILLER`) vua bi coi la khong du
   * de thanh menh de (`POLARITY`) se lam phep cat va phep kiem noi ve hai thu khac nhau.
   */
  it('hai tap roi nhau', () => {
    expect(FILLER_WORDS.filter((word) => POLARITY_WORDS.includes(word))).toEqual([]);
  });

  /*
   * DOI CHIEU CO DAU. Bo dau thi `dạ` (le phep) phu ca `da` (lan da), `anh` phu ca `ảnh`, `chị`
   * phu ca `chỉ`/`chi` — va phep cat hai dau se cat mat chu THAT cua nguon.
   */
  it('cat tu boc theo DUNG cach viet: `da` trong nguon khong bi coi la tieng `dạ`', () => {
    expect(sourceUnits(['Không gây hại cho mắt và da']).map((unit) => unit.text)).toEqual([
      'Không gây hại cho mắt và da',
    ]);
  });
});

describe('#200 — dau cham chi duoc mien khi co chu so o CA HAI ben', () => {
  /*
   * "1.150.000đ" chua HAI dau cham. Neu chung duoc coi la ranh gioi cau thi chuoi do vo thanh ba
   * don vi "1" / "150" / "000đ", va mot don vi mot chu so se bao lanh cho bat ky chu so nao.
   */
  it('dau cham giua hai chu so khong cat mot so tien lam doi', () => {
    expect(sourceUnits(['Tổng đơn là 1.150.000đ.']).map((unit) => unit.text)).toEqual([
      'Tổng đơn là 1.150.000đ',
    ]);
  });

  /*
   * MAT KIA, VA NO LA MOT BAN SUA: mien theo kieu "khong co chu so o MOT ben" lam mot dau cham
   * ket cau dung sau ma san pham bi nuot, va hai cau roi rac gop thanh mot don vi khong the trich
   * rieng. Do duoc tren chinh kho tai lieu cua khach ("Gas R290. Đây là..."). Huong hong la
   * fail-restrictive nen no khong lam ro ri gi — nhung no lam mot cau FAQ binh thuong khong tra
   * loi duoc, va cai gia do khong can phai tra.
   */
  it('dau cham sau mot ma co chu so VAN la ranh gioi cau', () => {
    expect(
      sourceUnits(['Máy dùng khí Gas R290. Đây là loại khí gas cao cấp nhất.']).map(
        (unit) => unit.text,
      ),
    ).toEqual(['Máy dùng khí Gas R290', 'Đây là loại khí gas cao cấp nhất']);
  });

  it('dau phay khong con la ranh gioi — mot cau la mot don vi', () => {
    expect(sourceUnits(['Lọc bụi mịn 99,97%, 9 cấp độ gió.']).map((unit) => unit.text)).toEqual([
      'Lọc bụi mịn 99,97%, 9 cấp độ gió',
    ]);
  });
});

describe('#200 — cat duoi mot ve DIEU KIEN ngan bang dau phay', () => {
  /*
   * BAN SUA MOT LO HONG THAT CUA CHINH BAN DAU TEP NAY, tim ra o vong tu soat truoc khi merge.
   *
   * Khi don vi con la MENH DE, mot ve dieu kien ngan bang dau phay la mot don vi RIENG, va model
   * chi viec khong trich no. Ba cau duoi day deu di ra duoc, va ca ba deu doi nghia theo huong co
   * loi cho khach mot cach nguy hiem: bao hanh vo dieu kien, gia ap cho ca cap 1, mien ship moi
   * vung. Don vi la CA CAU thi ca ba dung lai.
   */
  const CONDITIONAL: readonly (readonly [string, string])[] = [
    [
      'Bảo hành 3 năm, 1 đổi 1 trong 7 ngày đầu tiên, nếu có lỗi từ nhà sản xuất.',
      'Dạ bảo hành 3 năm, 1 đổi 1 trong 7 ngày đầu tiên ạ.',
    ],
    ['Giá áp dụng cho tất cả đại lý, trừ đại lý cấp 1.', 'Dạ giá áp dụng cho tất cả đại lý ạ.'],
    ['Đơn được miễn phí ship, trừ khu vực miền núi.', 'Dạ đơn được miễn phí ship ạ.'],
  ];

  it('bo ve dieu kien di thi ca loi nhan bi bo', () => {
    for (const [source, narrative] of CONDITIONAL) {
      expect(narrativeOf(narrative, [source]).narrative, narrative).toMatchObject({
        reason: 'NARRATIVE_NOT_SOURCE_BOUND',
      });
    }
  });

  it('trich CA CAU, ke ca ve dieu kien, thi van gui duoc', () => {
    const composition = narrativeOf(
      'Dạ bảo hành 3 năm, 1 đổi 1 trong 7 ngày đầu tiên, nếu có lỗi từ nhà sản xuất ạ.',
      [CONDITIONAL[0]![0]],
    );

    expect(composition.narrative).toMatchObject({ admitted: true });
    expect(composition.text).toContain('nếu có lỗi từ nhà sản xuất');
  });
});

describe('#200 — tu boc dong am voi tu noi dung khong cat mat chu cua nguon', () => {
  /*
   * `kính` la mot tieng le phep trong `FILLER`, va no cung la mot nua cua "nhà kính" (hieu ung
   * nha kinh) — mot chu co that trong tai lieu da duyet cua khach.
   *
   * Vi the doi chieu thi CAT tu boc o hai dau, con PHAT LAI thi khong: `unit.text` la CA CAU. Neu
   * phat lai ban da cat, khach se nhan "...không gây hiện tượng nhà" — mot manh vo nghia.
   */
  it('`kính` cuoi cau khong bi cat khoi ban phat ra', () => {
    const source = 'Gas R290 không gây hiện tượng nhà kính, không phá hủy tầng ozon.';

    expect(sourceUnits([source]).map((unit) => unit.text)).toEqual([
      'Gas R290 không gây hiện tượng nhà kính, không phá hủy tầng ozon',
    ]);
    expect(narrativeOf(`Dạ ${source.slice(0, -1)} ạ.`, [source]).text).toContain('nhà kính');
  });
});

describe('#200 — chang 3c: van ban CUOI bi ghep them sau khi soan', () => {
  /*
   * BAI NAY DUNG CHINH TU NGU MA LOI NHAN DA GHIM, nen chang 3b (muc TU NGU) IM.
   *
   * Do la ca chan doan quan trong nhat cua chang 3c: mot buoc hau xu ly tuong lai ghep them mot
   * cau bang dung nhung chu da co trong van ban se di qua duoc phep doi chieu muc tu ngu — va
   * chi phep doi chieu muc MENH DE moi thay cau do khong thuoc ve ai.
   */
  it('mot menh de ghep them tu chinh chu DA GHIM van bi tu choi o diem nghen gui', () => {
    const composition = narrativeOf('Dạ khách hàng thanh toán ngay khi nhận hàng ạ.', [SOURCE_A]);
    const tampered = { ...composition, text: `${composition.text}\nKhách hàng nhận hàng ngay.` };

    expect(decideOutboundAuthority(tampered, { grants: [] })).toMatchObject({
      sendable: false,
      reason: 'COMPOSITION_TEXT_NOT_SOURCE_BOUND',
    });
  });

  /** Chang 3b van la lop dau tien cham vao: mot chu HOAN TOAN moi hong o do, khong phai o 3c. */
  it('mot chu hoan toan moi van hong o chang 3b, khong phai o 3c', () => {
    const composition = narrativeOf('Dạ khách hàng thanh toán ngay khi nhận hàng ạ.', [SOURCE_A]);
    const tampered = { ...composition, text: `${composition.text}\nBên em tặng thêm quà.` };

    expect(decideOutboundAuthority(tampered, { grants: [] })).toMatchObject({
      sendable: false,
      reason: 'COMPOSITION_TEXT_NOT_SOURCE_BACKED',
    });
  });

  it('khoi nghiep vu that van di qua chang 3c binh thuong', () => {
    const quote = quoteFacts();
    const composition = compose(plan(['price_quote']), quote);

    expect(composition.mode).toBe('deterministic_business');
    expect(decideOutboundAuthority(composition, authorityFor(quote))).toMatchObject({
      sendable: true,
    });
  });
});

describe('#200 — bindProposition truc tiep', () => {
  it('loi nhan toan tu boc khong phai mot cau tra loi', () => {
    expect(bindProposition('Dạ vâng ạ.', sourceUnits([SOURCE_A]))).toEqual({ bound: false });
  });

  it('khong nguon nao thi khong rang buoc duoc gi', () => {
    expect(bindProposition('Dạ khách hàng thanh toán ngay khi nhận hàng ạ.', [])).toEqual({
      bound: false,
    });
  });
});
