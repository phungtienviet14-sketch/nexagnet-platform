import { describe, expect, it } from 'vitest';
import type { AgentTrace } from '@netviet/shared';
import { decideOutboundAuthority, pinnedOutboundVerdict } from './outbound-authority.js';
import { matchProductsInText } from '../rules/rules.js';
import {
  APPROVED_DOC,
  authorityFor,
  blockText,
  compose,
  line,
  plan,
  pricedFacts,
  pricedOrder,
  quoteFacts,
  tellable,
  OTHER_TENANT,
} from './__tests__/composition.fixture.js';
import { evidenceVersion, documentEvidence, type SourceEvidence } from './source-evidence.js';
import {
  parseSubjectPin,
  resolveTurnSubject,
  subjectAdmits,
  subjectPinToken,
  UNRESOLVED_SUBJECT,
  type TurnSubject,
} from './turn-subject.js';

/**
 * #208 — BANG CHUNG PHAI KHOP CHU THE CUA LUOT, KHONG CHI KHOP CHINH NO.
 *
 * ---------------------------------------------------------------------------------------------
 * DO TREN `main` (`63ebe04`) TRUOC KHI VIET MOT DONG NAO, dung `composeOutbound` that:
 *
 *     chu the that cua luot   = SKU B
 *     bang chung tra cuu duoc = mot cau cua SKU A
 *     model chon DUY NHAT cau cua A
 *     -> admitted: true, sendable: true, va qua duoc ca `pinnedOutboundVerdict`
 *
 * Vi `singleProductScope({A}) === true`: phep kiem pham vi cua #205 hoi cac nguon DA CHON co hoa
 * hop VOI NHAU khong — mot cau hoi phan than, luon dung khi chi co mot nguon sai.
 *
 * MUC TIEU CHUNG MINH cua ca tep nay, nguyen van muc 9 hop dong #208:
 *
 *   Khong mot menh de nguon nao NGOAI chu the he thong so huu tro thanh gui duoc cho khach chi
 *   vi no rang buoc dung nguon va noi bo don-pham-vi.
 */

/** SKU B — san pham ma luot dang thuc su noi den. */
const SKU_B = 'CR022';
/** SKU A — san pham KHAC. Moi bai am tinh deu xoay quanh viec cau cua no khong duoc ra kenh. */
const SKU_A = 'BB-GREY';

const DOC_A = 'Máy lọc không khí BB Grey dùng màng lọc HEPA H13.';
const DOC_B = 'Ghế công thái học CR022 có tựa lưng lưới thoáng khí.';
const DOC_TENANT = 'Ultty là thương hiệu gia dụng cao cấp.';
/** Cau ky thuat co con so — muc 9 ca 11 doi rang no van noi duoc khi dung pham vi. */
const DOC_B_NUMERAL = 'Ghế CR022 chịu tải tối đa 120 kg.';

const SUBJECT_B: TurnSubject = { kind: 'single', productSku: SKU_B };
const SUBJECT_A: TurnSubject = { kind: 'single', productSku: SKU_A };
const AMBIGUOUS: TurnSubject = { kind: 'ambiguous', productSkus: [SKU_A, SKU_B] };

/** Soan mot luot chi co van xuoi, voi chu the va bang chung cho truoc. */
const on = (narrative: string, evidence: readonly SourceEvidence[], subject: TurnSubject) =>
  compose(plan([], narrative), undefined, { evidence, subject });

const BASE_TRACE: AgentTrace = {
  steps: [],
  primaryRole: 'router',
  senderType: 'dai_ly',
  llmCalls: 1,
  brainMode: 'stub',
  supervisor: { riskLevel: 'none', escalate: false, reasons: [] },
};

/** Ban soan da luu + phan quyet da ghim — dung hinh dang ma diem nghen gui doc. */
function stored(composition: ReturnType<typeof on>): AgentTrace {
  return {
    ...BASE_TRACE,
    outbound: { text: composition.text },
    outboundAuthority: decideOutboundAuthority(composition, { grants: [] }),
    outboundComposition: composition,
  };
}

/* ================================================================== *
 * 1-8. PHAM VI SAI — AM TINH
 * ================================================================== */

describe('#208/1 — chu the B, chi co bang chung A, trich TRON VEN cau cua A', () => {
  /*
   * DAY LA PHAN VI DU BAT BUOC cua muc 7 hop dong, va la bai do duoc `admitted: true` tren
   * `63ebe04`. Khong mot lop nao cua #189/#200/#205 cham vao no: model khong bia mot chu nao,
   * khong nhac tien, khong tron hai san pham. No chi ke ve sai san pham.
   */
  it('cau cua SKU A khong ra duoc kenh trong mot luot ve SKU B', () => {
    expect(on(DOC_A, [tellable(DOC_A, SKU_A)], SUBJECT_B).narrative).toMatchObject({
      admitted: false,
      reason: 'NARRATIVE_SUBJECT_MISMATCH',
    });
  });

  it('va no khong ra duoc kenh o BAT KY buoc nao sau do', () => {
    const composition = on(DOC_A, [tellable(DOC_A, SKU_A)], SUBJECT_B);
    expect(composition.text).toBe('');
    expect(decideOutboundAuthority(composition, { grants: [] }).sendable).toBe(false);
  });
});

describe('#208/2 — chu the B, co ca A lan B, model chon MOI A', () => {
  it('chon dung mot pham vi noi bo hoa hop van khong du', () => {
    expect(
      on(DOC_A, [tellable(DOC_A, SKU_A), tellable(DOC_B, SKU_B)], SUBJECT_B).narrative,
    ).toMatchObject({ admitted: false, reason: 'NARRATIVE_SUBJECT_MISMATCH' });
  });

  it('tron A voi B cung bi tu choi', () => {
    expect(
      on(`${DOC_A} ${DOC_B}`, [tellable(DOC_A, SKU_A), tellable(DOC_B, SKU_B)], SUBJECT_B)
        .narrative,
    ).toMatchObject({ admitted: false });
  });
});

describe('#208/3 — tham so cong cu cua model KHONG mo rong duoc chu the', () => {
  /*
   * Bai nay do CHINH chu so huu chu the, khong do mot lop trung gian.
   *
   * `matchProductsInText` chi doc tin CUA KHACH. Model goi `tra_cuu_tai_lieu({sku: "BB-GREY"})`
   * bao nhieu lan cung khong doi duoc mot ky tu nao trong tin do, nen chu the van la B — va bang
   * chung ma chinh lan goi do keo ve bi loai.
   */
  const CATALOG = [
    { sku: SKU_A, name: 'Máy lọc không khí BB Grey', aliases: ['bb grey'] },
    { sku: SKU_B, name: 'Ghế công thái học CR022', aliases: ['cr022'] },
  ];

  it('tin khach noi ve B thi chu the la B, du model tra cuu A', () => {
    const customerText = 'ghế CR022 có tựa lưng lưới không ạ';
    const subject = resolveTurnSubject(
      matchProductsInText(customerText, CATALOG).map((product) => product.sku),
    );
    expect(subject).toEqual({ kind: 'single', productSku: SKU_B });
    expect(on(DOC_A, [tellable(DOC_A, SKU_A)], subject).narrative).toMatchObject({
      admitted: false,
    });
  });
});

describe('#208/4 — chu the CHUA GIAI RA + bang chung theo san pham -> fail closed', () => {
  it('khong doan, khong lay SKU duy nhat lam chu the', () => {
    expect(on(DOC_B, [tellable(DOC_B, SKU_B)], UNRESOLVED_SUBJECT).narrative).toMatchObject({
      admitted: false,
    });
  });

  it('luot do khong gui gi — duong an toan, khong phai mot loi', () => {
    expect(on(DOC_B, [tellable(DOC_B, SKU_B)], UNRESOLVED_SUBJECT).text).toBe('');
  });
});

describe('#208/5 — chu the NHAP NHANG -> van xuoi theo san pham fail closed', () => {
  it('hai san pham duoc nhac thi khong san pham nao duoc ke', () => {
    for (const evidence of [tellable(DOC_A, SKU_A), tellable(DOC_B, SKU_B)]) {
      expect(on(evidence.text, [evidence], AMBIGUOUS).narrative).toMatchObject({
        admitted: false,
      });
    }
  });
});

describe('#208/6-7 — diem nghen GUI kiem lai quan he, Sale khong di vong duoc', () => {
  /*
   * VI SAO PHAI CO CA HAI BAI NAY du chang soan da chan: mot ban nhap nam trong hang cho cua Sale
   * co the nhieu gio. Neu quan he chi duoc kiem luc soan thi mot cu bam `Duyệt & gửi` van dua no
   * ra nhom — dung dieu ma muc 2 hop dong goi ten.
   */
  it('ban soan DUNG pham vi qua duoc ca hai cong', () => {
    const composition = on(DOC_B, [tellable(DOC_B, SKU_B)], SUBJECT_B);
    expect(composition.narrative).toMatchObject({ admitted: true });
    expect(pinnedOutboundVerdict(stored(composition), composition.text).sendable).toBe(true);
  });

  it('ghim chu the BI XOA khoi ban soan da luu -> diem nghen gui tu choi', () => {
    const composition = on(DOC_B, [tellable(DOC_B, SKU_B)], SUBJECT_B);
    const tampered = {
      ...composition,
      grounded: composition.grounded.filter((token) => !token.startsWith('t:')),
    };
    expect(pinnedOutboundVerdict(stored(tampered), tampered.text)).toMatchObject({
      sendable: false,
      reason: 'COMPOSITION_SUBJECT_MISMATCH',
    });
  });

  it('ghim chu the bi DOI sang san pham khac -> diem nghen gui tu choi', () => {
    const composition = on(DOC_B, [tellable(DOC_B, SKU_B)], SUBJECT_B);
    const tampered = {
      ...composition,
      grounded: composition.grounded.map((token) =>
        token.startsWith('t:') ? subjectPinToken(SUBJECT_A) : token,
      ),
    };
    expect(pinnedOutboundVerdict(stored(tampered), tampered.text)).toMatchObject({
      sendable: false,
      reason: 'COMPOSITION_SUBJECT_MISMATCH',
    });
  });

  it('chu the bi ha xuong `unresolved` -> bang chung theo san pham het hieu luc', () => {
    const composition = on(DOC_B, [tellable(DOC_B, SKU_B)], SUBJECT_B);
    const tampered = {
      ...composition,
      grounded: composition.grounded.map((token) =>
        token.startsWith('t:') ? subjectPinToken(UNRESOLVED_SUBJECT) : token,
      ),
    };
    expect(pinnedOutboundVerdict(stored(tampered), tampered.text).sendable).toBe(false);
  });

  /*
   * BAN SOAN CU (truoc #208) khong mang the `t:` nao.
   *
   * Hai nhanh, va ranh gioi giua chung la mot quyet dinh co chu y (xem `pinsOutsideSubject`):
   * co ghim theo san pham ma khong co chu the -> TU CHOI, vi do dung la tap ban soan ma quan he
   * CO THE bi vi pham. Toan bo ghim la toan khach -> cho qua, vi bang chung toan khach hoa hop
   * voi MOI chu the theo dinh nghia, nen doi the o do se fail-closed ma khong bao ve gi.
   */
  it('ban soan cu CO ghim theo san pham -> tu choi', () => {
    const composition = on(DOC_B, [tellable(DOC_B, SKU_B)], SUBJECT_B);
    const legacy = {
      ...composition,
      grounded: composition.grounded.filter((token) => !token.startsWith('t:')),
    };
    expect(pinnedOutboundVerdict(stored(legacy), legacy.text).sendable).toBe(false);
  });

  it('ban soan cu CHI co ghim toan khach -> van gui duoc', () => {
    const composition = on(DOC_TENANT, [tellable(DOC_TENANT, null)], SUBJECT_B);
    const legacy = {
      ...composition,
      grounded: composition.grounded.filter((token) => !token.startsWith('t:')),
    };
    expect(composition.narrative).toMatchObject({ admitted: true });
    expect(pinnedOutboundVerdict(stored(legacy), legacy.text).sendable).toBe(true);
  });
});

describe('#208/8 — bang chung CUA KHACH KHAC van bi chan, doc lap voi pham vi san pham', () => {
  it('cung SKU, cung van ban, khach khac -> khong chon duoc', () => {
    const foreign = documentEvidence(
      `faq:x:${evidenceVersion(DOC_B)}`,
      DOC_B,
      { tenant: OTHER_TENANT, productSku: SKU_B },
      true,
    );
    expect(on(DOC_B, [foreign], SUBJECT_B).narrative).toMatchObject({ admitted: false });
  });
});

/* ================================================================== *
 * 9-12. DOI CHUNG DUONG — ban sua khong duoc lam cam mot luot dung
 * ================================================================== */

describe('#208/9-11 — luot DUNG pham vi van tra loi binh thuong', () => {
  it('chu the B + bang chung B -> ke duoc', () => {
    expect(on(DOC_B, [tellable(DOC_B, SKU_B)], SUBJECT_B).narrative).toMatchObject({
      admitted: true,
    });
  });

  it('chu the B + bang chung TOAN KHACH -> ke duoc', () => {
    expect(on(DOC_TENANT, [tellable(DOC_TENANT, null)], SUBJECT_B).narrative).toMatchObject({
      admitted: true,
    });
  });

  it('bang chung toan khach ke duoc ca khi chu the CHUA GIAI RA', () => {
    expect(
      on(DOC_TENANT, [tellable(DOC_TENANT, null)], UNRESOLVED_SUBJECT).narrative,
    ).toMatchObject({ admitted: true });
  });

  it('con so KY THUAT tu bang chung dung pham vi van noi duoc', () => {
    const composition = on(DOC_B_NUMERAL, [tellable(DOC_B_NUMERAL, SKU_B)], SUBJECT_B);
    expect(composition.narrative).toMatchObject({ admitted: true });
    expect(composition.text).toContain('120 kg');
  });
});

describe('#208/12 — KHOI TAT DINH khong bi ban sua nay cham vao', () => {
  /*
   * Cong chu the nam TRON VEN trong phep xet loi nhan. `renderBlock()` doc `TurnBusinessFacts`
   * va khong bao gio hoi chu the — nen mot luot bi tu choi phan van xuoi VAN gui du bang gia.
   *
   * Do la yeu cau muc 9 ca 12 hop dong, va no dung theo CAU TRUC chu khong theo mot phep kiem.
   */
  it('bang gia render y het du chu the la gi', () => {
    const rendered = (subject: TurnSubject) =>
      blockText(
        compose(plan(['price_quote'], ''), quoteFacts(), {
          evidence: [tellable(APPROVED_DOC)],
          subject,
        }),
      );
    expect(rendered(SUBJECT_B)).toContain('1.150.000');
    expect(rendered(SUBJECT_B)).toBe(rendered(UNRESOLVED_SUBJECT));
    expect(rendered(SUBJECT_B)).toBe(rendered(AMBIGUOUS));
  });

  it('don da tinh gia van render dung khi van xuoi bi tu choi vi sai pham vi', () => {
    const priced = pricedOrder({ lines: [line({ quantity: 10 })] });
    const composition = compose(plan(['order_pricing'], DOC_A), pricedFacts(priced), {
      evidence: [tellable(DOC_A, SKU_A)],
      subject: SUBJECT_B,
      authority: authorityFor(pricedFacts(priced)),
    });
    expect(composition.narrative).toMatchObject({ admitted: false });
    expect(composition.text).toContain('11.500.000');
  });
});

/* ================================================================== *
 * DOT BIEN — muc 9 hop dong
 * ================================================================== */

describe('#208 — dot bien: khong phep bien doi nao dua mot menh de NGOAI chu the ra kenh', () => {
  /*
   * MUC TIEU CHUNG MINH, nguyen van:
   *
   *   Khong mot menh de nguon nao ngoai chu the he thong so huu tro thanh gui duoc cho khach chi
   *   vi no rang buoc dung nguon va noi bo don-pham-vi.
   *
   * Nen cac bai duoi day KHONG kiem mot ma ly do cu the. Chung kiem KET CUC: `sendable`. Mot ban
   * sua sau nay doi ma nao do van phai giu dung bai nay, va do la co y.
   */
  const a = tellable(DOC_A, SKU_A);
  const b = tellable(DOC_B, SKU_B);
  const wide = tellable(DOC_TENANT, null);

  it('thu tu bang chung, ban trung lap va so luong deu khong doi ket cuc', () => {
    for (const evidence of [[a], [a, b], [b, a], [a, a], [a, wide], [wide, a], [b, a, wide, a]]) {
      const composition = on(DOC_A, evidence, SUBJECT_B);
      const verdict = decideOutboundAuthority(composition, { grants: [] });
      expect(composition.text, `${evidence.length} manh`).not.toContain('HEPA');
      expect(verdict.sendable && composition.text.includes('HEPA'), `${evidence.length} manh`).toBe(
        false,
      );
    }
  });

  it('CUNG MOT VAN BAN duoi hai danh tinh: pham vi quyet dinh, khong phai ky tu', () => {
    const shared = 'Sản phẩm có bảo hành chính hãng.';
    expect(on(shared, [tellable(shared, SKU_B)], SUBJECT_B).narrative).toMatchObject({
      admitted: true,
    });
    expect(on(shared, [tellable(shared, SKU_A)], SUBJECT_B).narrative).toMatchObject({
      admitted: false,
    });
    expect(on(shared, [tellable(shared, null)], SUBJECT_B).narrative).toMatchObject({
      admitted: true,
    });
  });

  it('moi chu the kha di deu duoc duyet, va khong chu the nao mo duoc cau cua A', () => {
    const subjects: TurnSubject[] = [
      UNRESOLVED_SUBJECT,
      SUBJECT_B,
      AMBIGUOUS,
      { kind: 'single', productSku: 'SKU-KHAC' },
    ];
    for (const subject of subjects) {
      const composition = on(DOC_A, [tellable(DOC_A, SKU_A), tellable(DOC_B, SKU_B)], subject);
      expect(composition.narrative, subject.kind).toMatchObject({ admitted: false });
    }
    // ...va DUNG mot chu the mo duoc no: chinh A.
    expect(on(DOC_A, [tellable(DOC_A, SKU_A)], SUBJECT_A).narrative).toMatchObject({
      admitted: true,
    });
  });

  it('ghim `t:` di theo ban soan va doc nguoc ra dung chu the', () => {
    for (const subject of [SUBJECT_B, UNRESOLVED_SUBJECT, AMBIGUOUS]) {
      const composition = on(DOC_TENANT, [tellable(DOC_TENANT, null)], subject);
      const parsed = parseSubjectPin(composition.grounded);
      expect(parsed?.kind, subject.kind).toBe(subject.kind);
    }
    expect(parseSubjectPin(on(DOC_B, [tellable(DOC_B, SKU_B)], SUBJECT_B).grounded)).toEqual(
      SUBJECT_B,
    );
  });
});

/* ================================================================== *
 * CHU SO HUU CHU THE — tinh chat cua chinh phep giai
 * ================================================================== */

describe('#208 — chu the do HE THONG giai, tat dinh va khong tu model', () => {
  const CATALOG = [
    { sku: SKU_A, name: 'Máy lọc không khí BB Grey', aliases: ['bb grey', 'may loc bb'] },
    { sku: SKU_B, name: 'Ghế công thái học CR022', aliases: ['cr022'] },
  ];

  it('khong nhac san pham nao -> `unresolved`, KHONG bia mot SKU', () => {
    const subject = resolveTurnSubject(
      matchProductsInText('bảo hành bao lâu ạ', CATALOG).map((product) => product.sku),
    );
    expect(subject).toEqual(UNRESOLVED_SUBJECT);
  });

  it('nhac hai san pham -> `ambiguous`, KHONG chon ho mot cai', () => {
    const subject = resolveTurnSubject(
      matchProductsInText('so sánh bb grey với cr022', CATALOG).map((product) => product.sku),
    );
    expect(subject.kind).toBe('ambiguous');
  });

  it('nhac MOT san pham hai lan van la `single`', () => {
    expect(resolveTurnSubject([SKU_B, SKU_B])).toEqual({ kind: 'single', productSku: SKU_B });
  });

  it('phep giai TAT DINH — cung dau vao, cung ket qua', () => {
    const run = () =>
      resolveTurnSubject(matchProductsInText('ghế cr022 giá bao nhiêu', CATALOG).map((p) => p.sku));
    expect(run()).toEqual(run());
  });

  it('bang chung TOAN KHACH hoa hop voi moi chu the', () => {
    for (const subject of [UNRESOLVED_SUBJECT, SUBJECT_A, SUBJECT_B, AMBIGUOUS]) {
      expect(subjectAdmits(subject, null), subject.kind).toBe(true);
    }
  });

  it('chi `single` khop dung SKU moi cho bang chung theo san pham qua', () => {
    expect(subjectAdmits(SUBJECT_B, SKU_B)).toBe(true);
    expect(subjectAdmits(SUBJECT_B, SKU_A)).toBe(false);
    expect(subjectAdmits(UNRESOLVED_SUBJECT, SKU_B)).toBe(false);
    expect(subjectAdmits(AMBIGUOUS, SKU_B)).toBe(false);
  });
});
