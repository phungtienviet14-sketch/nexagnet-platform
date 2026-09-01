import type { BusinessDate } from '../business-date.js';

/**
 * CHON VA TINH HOA HONG — ham THUAN, khong biet Nest, khong biet Prisma.
 *
 * ===========================================================================
 * VI SAO PHEP CHON PHAI TAT DINH, VA VI SAO NHAP NHANG PHAI DO.
 *
 * Issue #87 doi: *"Define deterministic precedence if multiple rules could apply"* va
 * *"Equal-precedence ambiguity must fail closed."*
 *
 * "Fail closed" o day khong phai su than trong chung chung. Neu hai luat cung bac cung ap duoc va
 * he thong chon bua mot cai, thi hai lan chay cung mot chuyen co the ra hai so tien khac nhau —
 * va khong lan nao bao loi. Doi tac nhan duoc mot con so, ke toan doi chieu ra mot con so khac, va
 * khong ai truy duoc vi sao, boi ca hai deu "dung theo mot luat co that".
 *
 * Nen khi khong phan dinh duoc, ham nay tra ve `AMBIGUOUS` va cong ghi dong lai. Mot khoan hoa
 * hong khong ghi duoc la mot viec cho nguoi lam; mot khoan hoa hong ghi sai la mot khoan tien.
 */

/**
 * BAC UU TIEN — so cang lon cang cu the, cang thang.
 *
 * Issue #87 dat mac dinh demo la `partner+route > partner > global`. Ba bac do co trong bang duoi.
 *
 * BAC `ROUTE` (chi tuyen, khong doi tac) KHONG nam trong cau cua Issue, nhung lai BIEU DIEN DUOC
 * boi luoc do: `partnerId` va `routeKey` deu tuy chon DOC LAP ("optional partner scope, optional
 * route scope"). Mot dan uu tien co lo hong la mot dan uu tien khong tat dinh, nen bac nay duoc
 * khai TUONG MINH o giua `PARTNER` va `GLOBAL` thay vi de no roi vao mot nhanh khong ai dinh nghia.
 *
 * Ly le xep no DUOI `PARTNER`: mot thoa thuan rieng voi mot doi tac cu the la cam ket voi MOT ben,
 * con mot muc chung cho mot tuyen la chinh sach noi bo. Khi hai cai va nhau, cam ket voi doi tac
 * thang — do la thu ho da ky.
 *
 * Neu ai do muon cam luat chi-tuyen, cho dung la luc TAO luat, khong phai luc chon: cam o day se
 * lam mot hang DA nam trong DB tro nen khong chon duoc, tuc mot chuyen khong tinh duoc hoa hong.
 */
export const COMMISSION_SCOPES = ['PARTNER_ROUTE', 'PARTNER', 'ROUTE', 'GLOBAL'] as const;
export type CommissionScope = (typeof COMMISSION_SCOPES)[number];

const SCOPE_RANK: Readonly<Record<CommissionScope, number>> = {
  PARTNER_ROUTE: 4,
  PARTNER: 3,
  ROUTE: 2,
  GLOBAL: 1,
};

export const COMMISSION_CALC_KINDS = ['PERCENTAGE', 'FIXED'] as const;
export type CommissionCalcKind = (typeof COMMISSION_CALC_KINDS)[number];

/**
 * KHOA TUYEN chuan hoa. Hai nguoi go `HN - HP` va `hn-hp` phai ra cung mot tuyen, neu khong thi
 * bang luat se co hai hang cho cung mot duong va phep chon lai nhap nhang.
 *
 * Chuan hoa dung HAI phep: cat khoang thua va dua ve chu hoa. KHONG bo dau tieng Viet — "Hải
 * Phòng" va "Hai Phong" la hai chuoi khac nhau o nguon, va gop chung lai la mot quyet dinh nghiep
 * vu chu khong phai mot phep chuan hoa ky thuat.
 */
export const commissionRouteKey = (origin: string, destination: string): string =>
  `${origin.trim().toUpperCase()}>${destination.trim().toUpperCase()}`;

/** Ban luat da cong bo — chi doc. */
export interface CommissionRuleCandidate {
  readonly ruleId: string;
  readonly ruleVersionId: string;
  readonly version: number;
  /** NULL = moi doi tac. */
  readonly partnerId: string | null;
  /** NULL = moi tuyen. */
  readonly routeKey: string | null;
  readonly calcKind: CommissionCalcKind;
  /** Diem co ban: 1% = 100. BAT BUOC khi `calcKind = PERCENTAGE`. */
  readonly rateBasisPoints: number | null;
  /** So nguyen dong. BAT BUOC khi `calcKind = FIXED`. */
  readonly fixedAmount: number | null;
  readonly effectiveFrom: BusinessDate;
  readonly effectiveTo: BusinessDate | null;
}

/** Pham vi cua mot ban luat, suy tu hai truong tuy chon. */
export const scopeOf = (rule: {
  readonly partnerId: string | null;
  readonly routeKey: string | null;
}): CommissionScope => {
  if (rule.partnerId && rule.routeKey) return 'PARTNER_ROUTE';
  if (rule.partnerId) return 'PARTNER';
  if (rule.routeKey) return 'ROUTE';
  return 'GLOBAL';
};

/**
 * Ban luat nay CO AP DUOC cho chuyen nay khong — pham vi va hieu luc.
 *
 * Hieu luc so bang CHUOI `YYYY-MM-DD`, khong doi sang `Date`. Dinh dang nay sap xep dung theo thu
 * tu tu dien, nen phep so sanh chuoi CHINH LA phep so sanh ngay — va no khong keo mui gio vao mot
 * cau hoi von khong co mui gio (`INV-25`).
 */
const applies = (
  rule: CommissionRuleCandidate,
  trip: {
    readonly partnerId: string;
    readonly routeKey: string;
    readonly businessDate: BusinessDate;
  },
): boolean => {
  if (rule.partnerId !== null && rule.partnerId !== trip.partnerId) return false;
  if (rule.routeKey !== null && rule.routeKey !== trip.routeKey) return false;
  if (trip.businessDate < rule.effectiveFrom) return false;
  if (rule.effectiveTo !== null && trip.businessDate > rule.effectiveTo) return false;
  return true;
};

export type CommissionSelection =
  | {
      readonly outcome: 'SELECTED';
      readonly rule: CommissionRuleCandidate;
      readonly scope: CommissionScope;
    }
  | { readonly outcome: 'NO_RULE' }
  | {
      readonly outcome: 'AMBIGUOUS';
      readonly scope: CommissionScope;
      /** Cac luat cung bac — de thong bao tu choi noi ro phai go cai nao. */
      readonly ruleIds: readonly string[];
    };

/**
 * CHON MOT ban luat cho mot chuyen. Tat dinh, hoac do.
 *
 * Ba buoc: loc theo pham vi + hieu luc, giu bac cao nhat, roi DOI HOI bac do con dung mot ban.
 *
 * Buoc ba la thu de bo qua nhat va cung la thu Issue #87 goi ten. `@@unique([partnerId, routeKey])`
 * o DB da chan phan lon truong hop, nhung KHONG chan duoc hai BAN cua cung mot luat co khoang hieu
 * luc chong lap — va do la duong nhap nhang that su de xay ra: mot nguoi cong bo ban moi tu 01/09
 * ma quen dong ban cu lai.
 */
export function selectCommissionRule(
  candidates: readonly CommissionRuleCandidate[],
  trip: {
    readonly partnerId: string;
    readonly routeKey: string;
    readonly businessDate: BusinessDate;
  },
): CommissionSelection {
  const applicable = candidates.filter((rule) => applies(rule, trip));
  if (applicable.length === 0) return { outcome: 'NO_RULE' };

  const bestRank = Math.max(...applicable.map((rule) => SCOPE_RANK[scopeOf(rule)]));
  const top = applicable.filter((rule) => SCOPE_RANK[scopeOf(rule)] === bestRank);
  const scope = scopeOf(top[0]!);

  if (top.length > 1) {
    return {
      outcome: 'AMBIGUOUS',
      scope,
      ruleIds: [...new Set(top.map((rule) => rule.ruleId))].sort(),
    };
  }

  return { outcome: 'SELECTED', rule: top[0]!, scope };
}

export interface CommissionAmount {
  /** Ket qua THO truoc lam tron, dang chuoi thap phan. Giu de doi soat duoc phep lam tron. */
  readonly rawAmount: string;
  /** So nguyen dong, da lam tron. */
  readonly resultAmount: number;
}

/**
 * TINH SO TIEN hoa hong tu mot ban luat va mot can cu.
 *
 * PHEP NHAN TRUOC, PHEP CHIA SAU. `basis * bp / 10000` giu moi phep tinh trong so nguyen cho toi
 * lan chia cuoi; `basis * (bp / 10000)` tao ra mot so thuc ngay o buoc dau va keo sai so vao mot
 * con so tien. Voi gia cuoc vai chuc trieu va ty le hai chu so, khac biet do la hang dong le —
 * nho, nhung no lech MOI LAN va khong bao gio tu bu lai.
 *
 * `Math.round` (nua len) va `rawAmount` giu lai phan thap phan. Mot con so `resultAmount` don doc
 * khong tra loi duoc "lam tron len hay xuong, tu bao nhieu" — va do dung la cau hoi dau tien cua
 * mot doi tac khong dong y voi so tien nhan duoc.
 */
export function calculateCommission(
  rule: Pick<CommissionRuleCandidate, 'calcKind' | 'rateBasisPoints' | 'fixedAmount'>,
  basisAmount: number,
): CommissionAmount {
  if (rule.calcKind === 'FIXED') {
    const fixed = rule.fixedAmount ?? 0;
    return { rawAmount: fixed.toFixed(2), resultAmount: fixed };
  }

  const bp = rule.rateBasisPoints ?? 0;
  const raw = (basisAmount * bp) / 10000;
  return { rawAmount: raw.toFixed(2), resultAmount: Math.round(raw) };
}
