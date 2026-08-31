import type { BusinessDate } from '../business-date.js';
import type { FuelMatchReason } from './fuel-decisions.js';
import type { FuelReconciliationStatus } from './fuel-lifecycle.js';

/**
 * SO KHOP BANG KE <-> PHIEU DO DAU — ham THUAN, TAT DINH, khong biet Nest/Prisma.
 *
 * ===========================================================================
 * BA DIEU HAM NAY KHONG BAO GIO LAM, va moi dieu la mot bat bien co nguon:
 *
 *   1. KHONG doan khi nhap nhang (`GD-09`). Nhieu ung vien thi KHONG cap nao duoc khop — ca cum
 *      di ra thanh mot chenh lech cho nguoi quyet. Tu chon mot trong hai la doan, va doan sai thi
 *      tien vao nham ky ma khong ai thay.
 *
 *   2. KHONG khop mot dong voi phieu de ra tu CHINH bang ke do (`INV-26`). Neu cho phep, he thong
 *      luon bao khop 100% va toan bo gia tri chong that thoat cua `TX-04` bien mat.
 *
 *   3. KHONG sinh mot nghia vu tien nao (`INV-07`, `INV-27`). Dau ra chi la de nghi khop va chenh
 *      lech; khong co khoan phai tra, khong co no cua lai xe, khong co khau tru luong. Tien chi di
 *      tiep khi mot NGUOI quyet `ACCEPT_SUPPLIER_AMOUNT`.
 *
 * ===========================================================================
 * TAT DINH nghia la gi o day, cu the:
 *
 * Cung mot dau vao -> cung mot dau ra, khong phu thuoc thu tu mang dau vao, khong phu thuoc lan
 * chay truoc. Duoc bao dam bang ba dieu:
 *
 *   · moi tap deu duoc SAP XEP theo `id` truoc khi duyet;
 *   · quyet dinh khop la QUAN HE HAI CHIEU DUY NHAT (mot dong co dung mot ung vien, VA ung vien do
 *     cung chi co dung mot dong) — khong co buoc tham lam "lay cai gan nhat";
 *   · khong doc trang thai cua ket qua dang dung dan (khong co bien `matched` bi doi giua chung).
 *
 * Neu doi sang "chon ung vien lech it nhat" thi bo test se van xanh, nhung mot bang ke co hai dong
 * gan giong nhau se cho hai ket qua khac nhau tuy thu tu dong trong file. Do la ly do buoc kiem
 * hai chieu ton tai thay vi mot phep sap xep theo do lech.
 */

export interface FuelMatchTolerance {
  /** `GD-08` — chenh lech tien toi da van coi la khop. So nguyen DONG, khong am. */
  readonly amountVnd: number;
  /** `GD-08` — lech ngay nghiep vu toi da. Ca dem qua nua dem la ly do truong nay ton tai. */
  readonly businessDateDays: number;
}

/**
 * Phan cua mot phieu ma viec so khop CAN — khong hon.
 *
 * Ngheo co chu dich, cung ly le voi `TripFacts` cua T3: mang ca ban ghi vao day se keo `declaredBy`,
 * anh chung tu va trang thai duyet vao pham vi cua mot ham chi can bon truong — va tu do khong con
 * gi ngan mot dieu kien "chi khop phieu da duyet" lang le xuat hien, tuc mot chinh sach nghiep vu
 * moi khong ai quyet.
 */
export interface MatchableFuelEntry {
  readonly id: string;
  readonly vehicleId: string;
  readonly businessDate: BusinessDate;
  /** So nguyen DONG. */
  readonly amount: number;
  /** `INV-26` — bang ke da de ra phieu nay. `null` o moi phieu do lai xe khai. */
  readonly sourceStatementId: string | null;
  readonly reconciliationStatus: FuelReconciliationStatus;
}

export interface MatchableStatementLine {
  readonly id: string;
  readonly statementId: string;
  readonly vehicleId: string;
  readonly businessDate: BusinessDate;
  readonly amount: number;
  readonly reconciliationStatus: FuelReconciliationStatus;
}

/** Anh xa 1-1 sang enum `TransportFuelDiscrepancyKind` cua DB. */
export const FUEL_DISCREPANCY_KINDS = [
  'AMBIGUOUS_CANDIDATES',
  'STATEMENT_LINE_ONLY',
  'FUEL_ENTRY_ONLY',
  'OUT_OF_TOLERANCE',
  'SELF_SOURCED_BLOCKED',
] as const;
export type FuelDiscrepancyKind = (typeof FUEL_DISCREPANCY_KINDS)[number];

export interface FuelMatchProposal {
  readonly statementLineId: string;
  readonly fuelEntryId: string;
  /** `dong bang ke - phieu`. CO DAU: nguoi doi soat can biet ben nao cao hon. */
  readonly amountDeltaVnd: number;
  /** `dong bang ke - phieu`, so ngay tron. CO DAU. */
  readonly businessDateDeltaDays: number;
  readonly reason: Extract<FuelMatchReason, 'MATCH_EXACT' | 'MATCH_WITHIN_TOLERANCE'>;
}

export interface FuelDiscrepancyProposal {
  readonly kind: FuelDiscrepancyKind;
  readonly statementLineId: string | null;
  readonly fuelEntryId: string | null;
  /** Ung vien phia phieu — chi id, khong ban sao du lieu. */
  readonly candidateEntryIds: readonly string[];
  readonly candidateLineIds: readonly string[];
  readonly reason: FuelMatchReason;
}

export interface FuelMatchingResult {
  readonly matches: readonly FuelMatchProposal[];
  readonly discrepancies: readonly FuelDiscrepancyProposal[];
}

export interface FuelMatchingInput {
  readonly statementId: string;
  readonly lines: readonly MatchableStatementLine[];
  readonly entries: readonly MatchableFuelEntry[];
  readonly tolerance: FuelMatchTolerance;
}

/**
 * Trang thai CON MO CHO SO KHOP — va `MATCHED` NAM TRONG day.
 *
 * ---------------------------------------------------------------------------
 * VI SAO `MATCHED` VAO LAI VONG SO KHOP:
 *
 * `applyMatchingRun` XOA cac cap khop tu dong cu roi ghi lai bo moi (xem chu thich cua no). Neu
 * `MATCHED` bi loai o day, thi lan chay thu hai se xoa cac cap cu ma khong tao lai duoc — vi hai
 * dau cua chung deu dang mang trang thai `MATCHED`. Ket qua la mot ky doi soat MAT HET cap khop
 * sau lan bam "chay lai" thu hai, va con so ban giao cho T5 tut ve 0.
 *
 * Do la mot loi that, do duoc o `transport-fuel.int.spec.ts` P10 tren Postgres.
 *
 * ---------------------------------------------------------------------------
 * `SETTLED` va `IGNORED` thi KHONG: ca hai deu la ket qua cua mot QUYET DINH CUA NGUOI (dong ky,
 * hoac bo qua co ly do). Va cac cap khop do NGUOI xac nhan (`origin = MANUAL`) duoc loai ra o
 * TANG SERVICE truoc khi goi ham nay — o day khong con thong tin ve nguon goc cua mot cap.
 *
 * Ranh gioi la: MAY duoc lam lai cai MAY da lam; cai NGUOI da quyet thi khong ai dong toi.
 */
const OPEN_FOR_MATCHING: readonly FuelReconciliationStatus[] = [
  'UNMATCHED',
  'MISMATCHED',
  'MATCHED',
];

const MS_PER_DAY = 86_400_000;

/**
 * So ngay TRON giua hai ngay nghiep vu.
 *
 * Doc bang `Date.UTC` chu khong `new Date(value)`: hai chuoi la NGAY LICH khong mui gio, va dat ca
 * hai o UTC nua dem lam hieu cua chung luon la boi so nguyen cua mot ngay — khong co gio mua he nao
 * chen vao giua de bien 1 ngay thanh 0,958 ngay.
 */
export function businessDateDeltaDays(left: BusinessDate, right: BusinessDate): number {
  return Math.round((utcMidnightOf(left) - utcMidnightOf(right)) / MS_PER_DAY);
}

function utcMidnightOf(value: BusinessDate): number {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  return Date.UTC(year, month - 1, day);
}

interface Pairing {
  readonly line: MatchableStatementLine;
  readonly entry: MatchableFuelEntry;
  readonly amountDeltaVnd: number;
  readonly businessDateDeltaDays: number;
}

const byId = <T extends { id: string }>(items: readonly T[]): T[] =>
  [...items].sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));

/**
 * CHAY SO KHOP cho mot bang ke.
 *
 * Ket qua la mot DE NGHI, khong phai mot lan ghi: tang service quyet dinh ghi gi va ghi vao dau.
 * Tach nhu vay de bo test khoa duoc dung phan logic ma `GD-08`/`GD-09`/`INV-26` noi toi, khong phai
 * dung mot CSDL len de hoi mot cau hoi so hoc.
 */
export function runFuelMatching(input: FuelMatchingInput): FuelMatchingResult {
  const lines = byId(input.lines.filter((line) => isOpen(line.reconciliationStatus)));
  const entries = byId(input.entries.filter((entry) => isOpen(entry.reconciliationStatus)));

  /** Ung vien HOP LE cua tung dong: cung xe, trong dung sai, va khong bi `INV-26` chan. */
  const eligible = new Map<string, Pairing[]>();
  /** Ung vien bi `INV-26` chan — giu rieng de bao dung ly do thay vi noi "khong tim thay". */
  const selfSourced = new Map<string, Pairing[]>();
  /** Cung xe, dung ngay, nhung lech tien vuot dung sai. */
  const outOfTolerance = new Map<string, Pairing[]>();

  for (const line of lines) {
    const eligibleForLine: Pairing[] = [];
    const selfSourcedForLine: Pairing[] = [];
    const outOfToleranceForLine: Pairing[] = [];

    for (const entry of entries) {
      // XE KHOP TUYET DOI (`GD-08`). Khong co duong khop mo nao — hai bien so khac nhau la hai xe.
      if (entry.vehicleId !== line.vehicleId) continue;

      const dayDelta = businessDateDeltaDays(line.businessDate, entry.businessDate);
      if (Math.abs(dayDelta) > input.tolerance.businessDateDays) continue;

      const amountDelta = line.amount - entry.amount;
      const pairing: Pairing = {
        line,
        entry,
        amountDeltaVnd: amountDelta,
        businessDateDeltaDays: dayDelta,
      };

      if (Math.abs(amountDelta) > input.tolerance.amountVnd) {
        outOfToleranceForLine.push(pairing);
        continue;
      }

      // `INV-26` — kiem SAU dung sai co chu dich: mot phieu tu-nguon lech tien qua xa thi no la mot
      // `OUT_OF_TOLERANCE` binh thuong, khong phai mot lan `INV-26` chan. Bao sai ly do o day se
      // lam nguoi doi soat di tim mot van de ve nguon goc du lieu khong ton tai.
      if (entry.sourceStatementId !== null && entry.sourceStatementId === line.statementId) {
        selfSourcedForLine.push(pairing);
        continue;
      }

      eligibleForLine.push(pairing);
    }

    eligible.set(line.id, eligibleForLine);
    selfSourced.set(line.id, selfSourcedForLine);
    outOfTolerance.set(line.id, outOfToleranceForLine);
  }

  /**
   * Chieu NGUOC LAI: mot phieu dang la ung vien cua nhung dong nao.
   *
   * Day la thu lam phep khop thanh HAI CHIEU. Thieu no thi hai dong bang ke cung khop duoc voi mot
   * phieu se ca hai cung "khop" — va mot lan do dau se doi soat cho hai khoan tien.
   */
  const linesByEntry = new Map<string, string[]>();
  for (const [lineId, pairings] of eligible) {
    for (const pairing of pairings) {
      const bucket = linesByEntry.get(pairing.entry.id) ?? [];
      bucket.push(lineId);
      linesByEntry.set(pairing.entry.id, bucket);
    }
  }

  const matches: FuelMatchProposal[] = [];
  const discrepancies: FuelDiscrepancyProposal[] = [];
  const matchedEntryIds = new Set<string>();
  const entryIdsInDiscrepancy = new Set<string>();

  for (const line of lines) {
    const candidates = eligible.get(line.id) ?? [];
    // Tach `[dau, ...con lai]` thay vi `candidates[0]` sau khi kiem `length`: hai nhanh duoi doc
    // ra dung ba truong hop (0 / 1 / nhieu) ma khong can mot phep truy cap chi so nao co the
    // `undefined`, nen khong co dong `if (!only)` chet nao phai giai thich ve sau.
    const [only, ...rest] = candidates;

    if (only === undefined) {
      const discrepancy = emptyCandidateDiscrepancy(line, selfSourced, outOfTolerance);
      discrepancies.push(discrepancy);
      for (const id of discrepancy.candidateEntryIds) entryIdsInDiscrepancy.add(id);
      continue;
    }

    if (rest.length > 0) {
      const candidateEntryIds = candidates.map((pairing) => pairing.entry.id).sort();
      discrepancies.push({
        kind: 'AMBIGUOUS_CANDIDATES',
        statementLineId: line.id,
        fuelEntryId: null,
        candidateEntryIds,
        candidateLineIds: [],
        reason: 'MATCH_AMBIGUOUS_CANDIDATES',
      });
      for (const id of candidateEntryIds) entryIdsInDiscrepancy.add(id);
      continue;
    }

    const competingLineIds = (linesByEntry.get(only.entry.id) ?? []).slice().sort();

    // Chieu nguoc: dong nay chi co mot ung vien, nhung ung vien do lai duoc NHIEU dong nham toi.
    // `GD-09` doi day cung la nhap nhang — day ca cum cho nguoi quyet, khong cap nao tu khop.
    if (competingLineIds.length > 1) {
      discrepancies.push({
        kind: 'AMBIGUOUS_CANDIDATES',
        statementLineId: line.id,
        fuelEntryId: only.entry.id,
        candidateEntryIds: [only.entry.id],
        candidateLineIds: competingLineIds,
        reason: 'MATCH_AMBIGUOUS_CANDIDATES',
      });
      entryIdsInDiscrepancy.add(only.entry.id);
      continue;
    }

    matches.push({
      statementLineId: line.id,
      fuelEntryId: only.entry.id,
      amountDeltaVnd: only.amountDeltaVnd,
      businessDateDeltaDays: only.businessDateDeltaDays,
      reason:
        only.amountDeltaVnd === 0 && only.businessDateDeltaDays === 0
          ? 'MATCH_EXACT'
          : 'MATCH_WITHIN_TOLERANCE',
    });
    matchedEntryIds.add(only.entry.id);
  }

  /**
   * PHIEU KHONG THAY TREN BANG KE.
   *
   * Chi tinh cac phieu KHONG khop VA khong nam trong mot chenh lech nao khac. Neu khong loai tru
   * nhom thu hai thi mot phieu nhap nhang se hien ra hai lan — mot lan la "nhap nhang", mot lan la
   * "khong thay tren bang ke" — va hai dong do mau thuan nhau tren cung mot man hinh.
   */
  for (const entry of entries) {
    if (matchedEntryIds.has(entry.id) || entryIdsInDiscrepancy.has(entry.id)) continue;
    discrepancies.push({
      kind: 'FUEL_ENTRY_ONLY',
      statementLineId: null,
      fuelEntryId: entry.id,
      candidateEntryIds: [],
      candidateLineIds: [],
      reason: 'MATCH_FUEL_ENTRY_ONLY',
    });
  }

  return { matches, discrepancies };
}

const isOpen = (status: FuelReconciliationStatus): boolean => OPEN_FOR_MATCHING.includes(status);

/**
 * BA LY DO khac nhau cho cung mot hien tuong "dong nay khong khop duoc voi gi".
 *
 * Thu tu uu tien khong tuy y: `INV-26` truoc, vi no la ly do NGHIEM TRONG nhat — no noi rang co ai
 * do dang co khop mot bang ke voi chinh no. Roi den lech dung sai (co ung vien that, chi la so
 * khong khop), roi cuoi cung la "khong co gi ca".
 */
function emptyCandidateDiscrepancy(
  line: MatchableStatementLine,
  selfSourced: ReadonlyMap<string, Pairing[]>,
  outOfTolerance: ReadonlyMap<string, Pairing[]>,
): FuelDiscrepancyProposal {
  const blocked = selfSourced.get(line.id) ?? [];
  if (blocked.length > 0) {
    return {
      kind: 'SELF_SOURCED_BLOCKED',
      statementLineId: line.id,
      fuelEntryId: null,
      candidateEntryIds: blocked.map((pairing) => pairing.entry.id).sort(),
      candidateLineIds: [],
      reason: 'MATCH_SELF_SOURCED_BLOCKED',
    };
  }

  const near = outOfTolerance.get(line.id) ?? [];
  if (near.length > 0) {
    return {
      kind: 'OUT_OF_TOLERANCE',
      statementLineId: line.id,
      fuelEntryId: null,
      candidateEntryIds: near.map((pairing) => pairing.entry.id).sort(),
      candidateLineIds: [],
      reason: 'MATCH_OUT_OF_TOLERANCE',
    };
  }

  return {
    kind: 'STATEMENT_LINE_ONLY',
    statementLineId: line.id,
    fuelEntryId: null,
    candidateEntryIds: [],
    candidateLineIds: [],
    reason: 'MATCH_STATEMENT_LINE_ONLY',
  };
}
