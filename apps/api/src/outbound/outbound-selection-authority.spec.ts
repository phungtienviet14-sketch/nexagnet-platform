import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AgentTrace } from '@netviet/shared';
import { decideOutboundAuthority, pinnedOutboundVerdict } from './outbound-authority.js';
import {
  authorityFor,
  authorityOwned,
  blockText,
  compose,
  facts,
  line,
  orderStateFactsFor,
  OTHER_TENANT,
  plan,
  policyFacts,
  pricedFacts,
  pricedOrder,
  quoteFacts,
  tellable,
  tellableAll,
  unclassified,
} from './__tests__/composition.fixture.js';
import {
  evidenceVersion,
  parsePinnedEvidence,
  stalePins,
  type SourceEvidence,
} from './source-evidence.js';

/**
 * MUC 8 HOP DONG #205 — QUYEN CHON, khong phai quyen viet.
 *
 * #200 da dong cong NGHIA: phan su kien cua loi nhan la menh de NGUYEN VEN cua nguon, phat ra
 * bang ky tu cua nguon. Tep nay dong cong con lai: MENH DE NAO duoc chon.
 *
 *     MOT CAU CO THAT TRONG TAI LIEU DA DUYET
 *             ≠
 *     CAU DO DUOC PHEP NOI TRONG LUOT NAY
 *
 * Moi cau nguon duoi day lay tu chinh kho tai lieu da duyet cua khach (`content-manifest.json`)
 * hoac tu bang do luong da dang tren Issue — khong bia mot chinh sach hay mot con so nao.
 */

/** `faq:cr022:skj-cr022:021` — mot cau GIA that, nam trong kho tai lieu da duyet. */
const PRICE_FAQ = 'Giá niêm yết: 12.000.000 VNĐ. Giá bán lẻ: 8.500.000 VNĐ.';
/** `faq:bb:bb-grey:017` — bao hanh + `1 đổi 1`, tuc mot QUYEN LOI cua khach. */
const WARRANTY_FAQ =
  'Bảo hành 3 năm lỗi, 1 đổi 1 trong 7 ngày đầu tiên nếu có lỗi từ nhà sản xuất.';
/** Dieu khoan cong no — hinh dang cua chinh sach thanh toan trong kho tai lieu. */
const DEBT_DOC = 'Đại lý được thanh toán công nợ trong 45 ngày kể từ ngày nhận hàng.';
/** Quyen huong khuyen mai — repo KHONG co nguon tat dinh nao cho lop nay. */
const PROMO_DOC = 'Khách đặt trong tháng được tặng thêm một màng lọc.';
/** Cau phe duyet — cung vay, khong bo phan nao cap. */
const APPROVAL_DOC = 'Đơn của đại lý đã được duyệt.';
/** Cam ket trang thai don. */
const COMMIT_DOC = 'Đơn của mình đã được chốt.';
/** `faq:bb:bb-grey:011` — thong so ky thuat, KHONG he qua. */
const SPEC_DOC = 'Lưu lượng gió lên tới 9700 lít/phút.';
/** `faq:bb:bb-grey:012` — cau FAQ thuong. */
const PLAIN_DOC = 'Quạt BB quay 4 góc: 30, 60, 90, 120 độ.';

const NO_GRANT = { grants: [] } as const;

/** Soan mot luot chi co van xuoi, tren mot bo bang chung cho truoc. */
const on = (narrative: string, evidence: readonly SourceEvidence[]) =>
  compose(plan([], narrative), undefined, { evidence });

/* ================================================================== *
 * 1-11. KHANG DINH CO HE QUA — AM TINH
 * ================================================================== */

describe('#205/1 — gia trong tai lieu da duyet KHONG phai tham quyen gia', () => {
  /*
   * DO DUOC TREN `main` (443a2cc) TRUOC KHI SUA: cau nay `admitted`, `sendable: true`,
   * `NARRATIVE_ONLY_COMPOSITION`, khong mot grant nao. Xem bang do luong tren Issue #205.
   */
  it('ban ghi CHUA AI TUYEN BO thi khong co menh de nao de chon', () => {
    const composition = on('Dạ giá bán lẻ 8.500.000 VNĐ ạ.', [unclassified(PRICE_FAQ)]);

    expect(composition.narrative).toMatchObject({ admitted: false });
    expect(composition.text).toBe('');
    expect(decideOutboundAuthority(composition, NO_GRANT)).toMatchObject({ sendable: false });
  });

  /*
   * LOP THU HAI, VA DAY MOI LA LOP QUAN TRONG: ke ca khi mot NGUOI THAT da tuyen bo ban ghi nay
   * ke duoc, con so tien trong no VAN khong ra duoc — vi tien chi neo duoc bang GRANT tat dinh.
   */
  it('ban ghi DA DUOC TUYEN BO ke duoc van khong lam con so tien thanh tham quyen', () => {
    const composition = on('Dạ giá bán lẻ 8.500.000 VNĐ ạ.', [tellable(PRICE_FAQ)]);

    expect(composition.narrative).toMatchObject({ reason: 'NUMERAL_NOT_GROUNDED' });
    expect(composition.text).not.toContain('8.500.000');
  });
});

describe('#205/2 — gia trong tai lieu KHONG de bep duoc bang gia dang chay', () => {
  it('chi con so tat dinh render, cau gia cua FAQ bi bo', () => {
    const priced = pricedFacts(pricedOrder({ lines: [line({ quantity: 1 })] }));
    const composition = compose(plan(['order_pricing'], 'Dạ giá bán lẻ 8.500.000 VNĐ ạ.'), priced, {
      evidence: [tellable(PRICE_FAQ)],
    });

    expect(composition.narrative).toMatchObject({ reason: 'NUMERAL_NOT_GROUNDED' });
    expect(blockText(composition)).toContain('1.150.000');
    expect(composition.text).not.toContain('8.500.000');
    expect(decideOutboundAuthority(composition, authorityFor(priced))).toMatchObject({
      sendable: true,
    });
  });
});

describe('#205/3 — dieu khoan thanh toan/cong no can grant, khong can mot cau van', () => {
  it('khong grant chinh sach -> khong ra duoc kenh', () => {
    expect(
      on('Dạ đại lý được thanh toán công nợ trong 45 ngày kể từ ngày nhận hàng ạ.', [
        tellable(DEBT_DOC),
      ]).narrative,
    ).toMatchObject({ reason: 'POLICY_CARRIER_NOT_GROUNDED' });
  });
});

describe('#205/4 — bao hanh / doi tra: repo khong co may cap quyen, nen fail closed', () => {
  it('cau bao hanh 1-doi-1 khong den tay khach', () => {
    expect(
      on('Dạ bảo hành 3 năm lỗi, 1 đổi 1 trong 7 ngày đầu tiên nếu có lỗi từ nhà sản xuất ạ.', [
        tellable(WARRANTY_FAQ),
      ]).narrative,
    ).toMatchObject({ reason: 'POLICY_CARRIER_NOT_GROUNDED' });
  });

  /** CHUYEN SALE la ket cuc DUOC PHEP: khong gui gi con hon gui mot cam ket khong ai cap. */
  it('luot do khong gui gi — do la duong an toan, khong phai mot loi', () => {
    const composition = on('Dạ bảo hành 3 năm lỗi ạ.', [tellable(WARRANTY_FAQ)]);

    expect(composition.mode).toBe('empty');
    expect(decideOutboundAuthority(composition, NO_GRANT)).toMatchObject({
      sendable: false,
      reason: 'COMPOSITION_EMPTY',
    });
  });
});

describe('#205/5-6 — khuyen mai va phe duyet: khong nguon tat dinh nao', () => {
  it('cau khuyen mai trong ban ghi chua tuyen bo khong chon duoc', () => {
    expect(
      on('Dạ khách đặt trong tháng được tặng thêm một màng lọc ạ.', [unclassified(PROMO_DOC)])
        .narrative,
    ).toMatchObject({ admitted: false });
  });

  it('cau phe duyet trong ban ghi chua tuyen bo khong chon duoc', () => {
    expect(
      on('Dạ đơn của đại lý đã được duyệt ạ.', [unclassified(APPROVAL_DOC)]).narrative,
    ).toMatchObject({ admitted: false });
  });

  /** Va hai khoi do LUON bi bo, du model xin bao nhieu lan — khong co nguon nao render chung. */
  it('khoi khuyen mai / phe duyet luon bi bo voi NO_AUTHORITY_SOURCE', () => {
    const composition = compose(plan(['promotion', 'approval']));

    expect(composition.omitted).toEqual([
      { kind: 'promotion', reason: 'NO_AUTHORITY_SOURCE' },
      { kind: 'approval', reason: 'NO_AUTHORITY_SOURCE' },
    ]);
  });
});

describe('#205/7 — cam ket don phai den tu trang thai da ben vung', () => {
  it('khong trang thai don nao -> cau `da chot` khong ra duoc kenh', () => {
    expect(on('Dạ đơn của mình đã được chốt ạ.', [tellable(COMMIT_DOC)]).narrative).toMatchObject({
      reason: 'COMMITMENT_CARRIER_NOT_GROUNDED',
    });
  });
});

describe('#205/8 — pham vi san pham', () => {
  const BOTH = 'Dạ lưu lượng gió lên tới 9700 lít/phút. Quạt BB quay 4 góc: 30, 60, 90, 120 độ ạ.';

  it('menh de cua SKU A tron voi menh de cua SKU B trong MOT loi nhan -> tu choi', () => {
    expect(
      on(BOTH, [tellable(SPEC_DOC, 'SKJ-CR022'), tellable(PLAIN_DOC, 'BB-GREY')]).narrative,
    ).toMatchObject({ reason: 'NARRATIVE_SCOPE_CONFLICT' });
  });

  it('cung hai cau do nhung CUNG mot san pham thi binh thuong', () => {
    expect(
      on(BOTH, [tellable(SPEC_DOC, 'BB-GREY'), tellable(PLAIN_DOC, 'BB-GREY')]).narrative,
    ).toMatchObject({ admitted: true });
  });
});

describe('#205/9 — hai su that rieng le khong cong lai thanh mot tham quyen', () => {
  it('nua menh de cua nguon A noi voi nua menh de cua nguon B -> khong menh de nao', () => {
    expect(
      on('Dạ lưu lượng gió quay 4 góc ạ.', tellableAll([SPEC_DOC, PLAIN_DOC], 'BB-GREY')).narrative,
    ).toMatchObject({ reason: 'NARRATIVE_NOT_SOURCE_BOUND' });
  });
});

describe('#205/10 — ban ghi doi hay bi rut quyen ke sau khi soan', () => {
  const composition = on('Dạ lưu lượng gió lên tới 9700 lít/phút ạ.', [tellable(SPEC_DOC)]);
  const pins = (): ReturnType<typeof parsePinnedEvidence> =>
    parsePinnedEvidence(composition.grounded);

  it('ghim mang danh tinh + ban + pham vi, khong phai mot chuoi tron', () => {
    expect(pins()).toEqual([
      expect.objectContaining({
        excerpt: 'Lưu lượng gió lên tới 9700 lít/phút',
        version: evidenceVersion(SPEC_DOC),
      }),
    ]);
  });

  it('so ghi hien hanh con ban ghi do -> khong ghim nao het han', () => {
    expect(stalePins(pins(), new Map([[pins()[0]!.sourceId, pins()[0]!.version]]))).toEqual([]);
  });

  it('ban ghi BI RUT QUYEN ke -> ghim het han', () => {
    expect(stalePins(pins(), new Map())).toHaveLength(1);
  });

  it('ban ghi DOI NOI DUNG -> ghim het han, khong duoc am tham cap phep lai', () => {
    const index = new Map([[pins()[0]!.sourceId, evidenceVersion('Một nội dung khác hẳn.')]]);

    expect(stalePins(pins(), index)).toHaveLength(1);
  });
});

describe('#205/11 — nut `Duyệt & gửi` cua Sale khong di vong duoc', () => {
  const BASE: AgentTrace = {
    steps: [],
    primaryRole: 'router',
    senderType: 'dai_ly',
    llmCalls: 1,
    brainMode: 'stub',
    supervisor: { riskLevel: 'none', escalate: false, reasons: [] },
  };

  it('ban soan bi tu choi luc soan thi diem nghen gui cung tu choi', () => {
    const composition = on('Dạ giá bán lẻ 8.500.000 VNĐ ạ.', [tellable(PRICE_FAQ)]);
    const verdict = decideOutboundAuthority(composition, NO_GRANT);
    const trace: AgentTrace = {
      ...BASE,
      outbound: { text: composition.text },
      outboundAuthority: verdict,
      outboundComposition: composition,
    };

    expect(verdict.sendable).toBe(false);
    expect(pinnedOutboundVerdict(trace, composition.text).sendable).toBe(false);
  });
});

/* ================================================================== *
 * 12-15. VAN XUOI HOP LE — DUONG
 * ================================================================== */

describe('#205/12-13 — tai lieu da tuyen bo van tra loi duoc', () => {
  it('cau FAQ thuong van den tay khach', () => {
    const composition = on('Dạ quạt BB quay 4 góc: 30, 60, 90, 120 độ ạ.', [tellable(PLAIN_DOC)]);

    expect(composition.narrative).toMatchObject({ admitted: true });
    expect(decideOutboundAuthority(composition, NO_GRANT)).toMatchObject({
      sendable: true,
      reason: 'NARRATIVE_ONLY_COMPOSITION',
    });
  });

  /*
   * CON SO KY THUAT KHONG PHAI TIEN, va bai nay khoa lai dieu do.
   *
   * `monetaryLiterals()` coi moi con so tu 1.000 tro len la tien, nen mot phep loai theo DO LON
   * se giet chinh cau nay. Phep loai cua nguon he thong dua vao DON VI TIEN di kem, khong vao do
   * lon — xem `sourceNumeralValues` trong `outbound-narrative.ts`.
   */
  it('9700 lít/phút van noi duoc', () => {
    const composition = on('Dạ lưu lượng gió lên tới 9700 lít/phút ạ.', [tellable(SPEC_DOC)]);

    expect(composition.narrative).toMatchObject({ admitted: true });
    expect(composition.text).toContain('9700');
  });
});

describe('#205/14-15 — cac tinh chat cua #200 giu nguyen', () => {
  it('dau noi khong duoc khang dinh mot quan he', () => {
    expect(
      on(
        'Dạ lưu lượng gió lên tới 9700 lít/phút: quạt BB quay 4 góc: 30, 60, 90, 120 độ ạ.',
        tellableAll([SPEC_DOC, PLAIN_DOC], 'BB-GREY'),
      ).narrative,
    ).toMatchObject({ reason: 'NARRATIVE_NOT_SOURCE_BOUND' });
  });

  it('van ban phat ra van la ky tu cua NGUON', () => {
    expect(on('dạ LƯU LƯỢNG GIÓ LÊN TỚI 9700 LÍT/PHÚT ạ.', [tellable(SPEC_DOC)]).text).toBe(
      'dạ Lưu lượng gió lên tới 9700 lít/phút ạ.',
    );
  });
});

/* ================================================================== *
 * 16-19. KHOI NGHIEP VU CO THAM QUYEN — DUONG
 * ================================================================== */

describe('#205/16-18 — khoi co kieu van render dung', () => {
  it('bang gia tat dinh render dung don gia', () => {
    const quote = quoteFacts();
    const composition = compose(plan(['price_quote']), quote, { evidence: [tellable(PLAIN_DOC)] });

    expect(blockText(composition)).toContain('1.150.000');
    expect(decideOutboundAuthority(composition, authorityFor(quote))).toMatchObject({
      sendable: true,
    });
  });

  it('grant chinh sach thanh toan render dung chinh sach do', () => {
    const policy = policyFacts('cong_no_30');
    const composition = compose(plan(['payment_policy']), policy, {
      evidence: [tellable(PLAIN_DOC)],
    });

    expect(blockText(composition)).toContain('Meta HN');
    expect(decideOutboundAuthority(composition, authorityFor(policy))).toMatchObject({
      sendable: true,
    });
  });

  it('trang thai don chi uy quyen den muc no cho phep', () => {
    const recorded = orderStateFactsFor('needs_edit');
    const composition = compose(plan(['order_commitment']), recorded, {
      evidence: [tellable(PLAIN_DOC)],
    });

    expect(blockText(composition)).toContain('ghi nhận');
    expect(blockText(composition)).not.toContain('đã được chốt');
  });
});

describe('#205/19 — VAT/COD/cuoc van fail closed khi don khong bat truong nao', () => {
  it('don khong VAT/COD/cuoc -> khoi bi bo voi FACT_INCOMPLETE', () => {
    const composition = compose(plan(['vat_cod_shipping']), pricedFacts());

    expect(composition.omitted).toEqual([{ kind: 'vat_cod_shipping', reason: 'FACT_INCOMPLETE' }]);
  });
});

/* ================================================================== *
 * 20-22. KHACH / PHAM VI / BAO MAT
 * ================================================================== */

describe('#205/20 — bang chung cua khach khac khong bao gio thoa man', () => {
  it('cung mot cau, khach khac -> khong chon duoc', () => {
    const composition = on('Dạ quạt BB quay 4 góc: 30, 60, 90, 120 độ ạ.', [
      tellable(PLAIN_DOC, null, OTHER_TENANT),
    ]);

    expect(composition.narrative).toMatchObject({ reason: 'NO_SYSTEM_SOURCE' });
    expect(composition.text).toBe('');
  });
});

describe('#205/21 — ghim du de lan vet, khong mang bi mat', () => {
  it('ghim co danh tinh + ban, va KHONG chua tin cua khach', () => {
    const composition = compose(
      plan([], 'Dạ quạt BB quay 4 góc: 30, 60, 90, 120 độ ạ.'),
      undefined,
      {
        evidence: [tellable(PLAIN_DOC)],
        customerText: 'so dt cua em la 0900000000, dia chi 12 Lang Ha',
      },
    );
    const pinned = parsePinnedEvidence(composition.grounded);

    expect(pinned[0]!.sourceId).toMatch(/^faq:/u);
    expect(pinned[0]!.version).toHaveLength(16);
    expect(composition.grounded.join('|')).not.toContain('0900000000');
    expect(composition.grounded.join('|')).not.toContain('Lang Ha');
  });
});

describe('#205/22 — nen tang khong re nhanh theo ten khach', () => {
  /*
   * Doc muc 22 hop dong theo nghia den: khong mot `if tenant === '<ten khach>'` nao trong lop nen
   * tang. Quet cac thu muc ma ban nay dung cham, va doi chieu voi CHINH danh sach goi khach co
   * that trong `tenants/` — khong phai mot danh sach cung viet tay se muc dan.
   */
  const ROOT = join(process.cwd(), 'src');
  const DIRS = ['outbound', 'advisor', 'agents', 'turns', 'content'];

  const sourceFiles = (dir: string): string[] => {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
      else if (entry.endsWith('.ts') && !entry.includes('.spec.') && !entry.includes('.fixture.')) {
        out.push(full);
      }
    }
    return out;
  };

  it('khong tep nguon nao so sanh voi mot slug khach', () => {
    const slugs = readdirSync(join(process.cwd(), '..', '..', 'tenants')).filter(
      (entry) => !entry.endsWith('.md'),
    );
    const offenders: string[] = [];
    for (const dir of DIRS) {
      for (const file of sourceFiles(join(ROOT, dir))) {
        const text = readFileSync(file, 'utf8');
        for (const slug of slugs) {
          if (new RegExp(`===\\s*['"\`]${slug}['"\`]`, 'u').test(text)) offenders.push(file);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});

/* ================================================================== *
 * TINH CHAT / DOT BIEN
 * ================================================================== */

describe('#205 — dot bien: khong phep bien doi nao bien SO HUU thanh THAM QUYEN', () => {
  /*
   * TINH CHAT TRUNG TAM CUA CA BAN NAY, va no chi can MOT bai de nhin thay:
   *
   *   CUNG MOT CHUOI KY TU, hai lop khac nhau -> hai ket cuc khac nhau.
   *
   * Neu ranh gioi la VAN BAN (regex, POLICY_SURFACES, bo do so, classifier) thi ba ve duoi day
   * phai ra cung ket qua, vi chung la cung mot chuoi. Chung ra khac nhau, nen ranh gioi khong
   * phai van ban.
   */
  it('cung mot cau, lop khac nhau -> ket cuc khac nhau', () => {
    const narrative = 'Dạ quạt BB quay 4 góc: 30, 60, 90, 120 độ ạ.';

    expect(on(narrative, [tellable(PLAIN_DOC)]).narrative).toMatchObject({ admitted: true });
    expect(on(narrative, [unclassified(PLAIN_DOC)]).narrative).toMatchObject({ admitted: false });
    expect(on(narrative, [authorityOwned(PLAIN_DOC)]).narrative).toMatchObject({ admitted: false });
  });

  it('thu tu nguon, ban trung lap va so luong nguon khong doi ket cuc', () => {
    const narrative = 'Dạ lưu lượng gió lên tới 9700 lít/phút ạ.';
    const a = tellable(SPEC_DOC, 'BB-GREY');
    const b = tellable(PLAIN_DOC, 'BB-GREY');

    for (const evidence of [
      [a, b],
      [b, a],
      [a, a, b],
      [b, a, b, a],
    ]) {
      expect(on(narrative, evidence).narrative, `${evidence.length} manh`).toMatchObject({
        admitted: true,
      });
    }
  });

  it('cung mot van ban duoi HAI danh tinh khong ke duoc van bi tu choi', () => {
    expect(
      on('Dạ giá bán lẻ 8.500.000 VNĐ ạ.', [unclassified(PRICE_FAQ), authorityOwned(PRICE_FAQ)])
        .narrative,
    ).toMatchObject({ admitted: false });
  });

  it('them mot bang chung THUOC THAM QUYEN vao luot khong mo them menh de nao', () => {
    const composition = on('Dạ giá bán lẻ 8.500.000 VNĐ ạ.', [
      tellable(PLAIN_DOC),
      authorityOwned(PRICE_FAQ),
    ]);

    expect(composition.narrative).toMatchObject({ admitted: false });
    expect(composition.text).not.toContain('8.500.000');
  });

  it('grant tien KHONG mo duong cho cau gia cua tai lieu', () => {
    const priced = pricedFacts(pricedOrder({ lines: [line({ quantity: 1 })] }));
    const composition = compose(plan([], 'Dạ giá bán lẻ 8.500.000 VNĐ ạ.'), priced, {
      evidence: [tellable(PRICE_FAQ)],
    });

    expect(composition.narrative).toMatchObject({ reason: 'NUMERAL_NOT_GROUNDED' });
  });

  it('du kien + grant day du van khong cho van xuoi noi ve tien', () => {
    const priced = facts(pricedFacts(), policyFacts('cong_no_30'));
    const composition = compose(plan([], 'Dạ tổng đơn 11.500.000đ ạ.'), priced, {
      evidence: [tellable('Tổng đơn 11.500.000đ.')],
    });

    // G4: con so DA co tham quyen thi phai di qua KHOI, khong qua van xuoi.
    expect(composition.narrative).toMatchObject({ reason: 'FINANCIAL_VALUE_IN_NARRATIVE' });
  });
});
