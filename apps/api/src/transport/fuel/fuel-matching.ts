import type { BusinessDate } from '../business-date.js';
import type { FuelMatchReason } from './fuel-decisions.js';
import { compareFuelInvoiceNumbers, type FuelInvoiceRelation } from './fuel-invoice-number.js';
import type { FuelReconciliationStatus } from './fuel-lifecycle.js';
import { isSupplierPayable } from './fuel-payable.js';
import type { FuelPaymentMethod } from './fuel.types.js';

/**
 * SO KHOP BANG KE <-> PHIEU DO DAU — ham THUAN, TAT DINH, khong biet Nest/Prisma.
 *
 * ===========================================================================
 * BON DIEU HAM NAY KHONG BAO GIO LAM, va moi dieu la mot bat bien co nguon:
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
 *   4. KHONG khop mot dong bang ke voi phieu lai xe DA TRA TIEN MAT (`#371`). Bang ke la chung tu
 *      CONG NO; chi phieu `SUPPLIER_ACCOUNT` la ung vien cua no. Phieu `DRIVER_CASH` da vao Quy lai
 *      xe — khop no voi bang ke la tra cung mot lan do dau HAI lan. Xem `fuel-payable.ts`.
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
  /**
   * So hoa don lai xe khai — `#317` G4. `null` = khong khai.
   *
   * KHONG tuy chon (`?`) du gia tri `null` duoc: moi noi goi phai tu noi ro "phieu nay co so hoa don
   * nao". Mot truong tuy chon la mot truong ma mot noi goi moi quen dien, va quen o day nghia la
   * lang le tat bo phan biet ma khong ai hay.
   */
  readonly invoiceNo: string | null;
  /** `INV-26` — bang ke da de ra phieu nay. `null` o moi phieu do lai xe khai. */
  readonly sourceStatementId: string | null;
  /**
   * `#371` — AI DA TRA lan do nay. Chi `SUPPLIER_ACCOUNT` (ghi no) la ung vien cua bang ke CONG NO;
   * `DRIVER_CASH` da vao Quy lai xe va KHONG BAO GIO duoc khop.
   *
   * KHONG tuy chon, cung ly do voi `invoiceNo`: mot noi goi quen dien truong nay la mot noi goi
   * lang le mo lai duong tra hai lan.
   */
  readonly paymentMethod: FuelPaymentMethod;
  readonly reconciliationStatus: FuelReconciliationStatus;
}

export interface MatchableStatementLine {
  readonly id: string;
  readonly statementId: string;
  readonly vehicleId: string;
  readonly businessDate: BusinessDate;
  readonly amount: number;
  /** So hoa don tren dong bang ke — `#317` G4. Cung ly do khong tuy chon nhu ben phieu. */
  readonly invoiceNo: string | null;
  readonly reconciliationStatus: FuelReconciliationStatus;
}

/** Anh xa 1-1 sang enum `TransportFuelDiscrepancyKind` cua DB. */
export const FUEL_DISCREPANCY_KINDS = [
  'AMBIGUOUS_CANDIDATES',
  'STATEMENT_LINE_ONLY',
  'FUEL_ENTRY_ONLY',
  'OUT_OF_TOLERANCE',
  'SELF_SOURCED_BLOCKED',
  /**
   * `#317` G4 — dong CHI con nhung ung vien dung xe/ngay/tien nhung so hoa don TRAI nguoc.
   *
   * Tach khoi `OUT_OF_TOLERANCE`/`AMBIGUOUS_CANDIDATES` vi nguoi soat phai lam mot viec khac han: doi
   * chieu to hoa don giay voi dong bang ke, khong phai hoi cay xang ve so tien.
   */
  'INVOICE_CONFLICT',
  /**
   * `#371` — dong CHI con ung vien la phieu lai xe DA TRA TIEN MAT (`DRIVER_CASH`): cay xang ghi no
   * mot lan do ma Quy lai xe da tra.
   *
   * Tach khoi `STATEMENT_LINE_ONLY` vi he thong BIET chinh xac ly do, va vi nguoi soat phai lam mot
   * viec khac han: khong phai "chap nhan so cay xang" (se tra hai lan — tang mien CHAN duong do, xem
   * `isCashPaidLineAcceptance`), ma tu choi dong, hoac sua phieu neu lai xe khai sai cach tra.
   */
  'PAYMENT_METHOD_CONFLICT',
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
  /**
   * `#317` G4 — so hoa don cua cap nay: `EQUAL` (tang do chac) hoac `ABSENT` (khong noi gi).
   *
   * Khong bao gio `CONFLICT`: mot cap xung dot so hoa don khong bao gio duoc de nghi khop.
   */
  readonly invoiceRelation: Exclude<FuelInvoiceRelation, 'CONFLICT'>;
  /**
   * `true` khi BO QUA so hoa don thi cap nay KHONG tu khop duoc — co nhieu hon mot ung vien dung
   * xe/ngay/tien o it nhat mot chieu, va chinh so hoa don (trung, hoac xung dot loai bot) da tach
   * chung ra. Ghi ro de nguoi soat biet cap nay dua vao mot chuoi in tren giay.
   */
  readonly decidedByInvoice: boolean;
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
  /** `#317` G4 — `CONFLICT` khong bao gio nam trong tap `eligible`, xem `classifyPair`. */
  readonly invoiceRelation: FuelInvoiceRelation;
}

const byId = <T extends { id: string }>(items: readonly T[]): T[] =>
  [...items].sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));

/**
 * CHAY SO KHOP cho mot bang ke.
 *
 * Ket qua la mot DE NGHI, khong phai mot lan ghi: tang service quyet dinh ghi gi va ghi vao dau.
 * Tach nhu vay de bo test khoa duoc dung phan logic ma `GD-08`/`GD-09`/`INV-26` noi toi, khong phai
 * dung mot CSDL len de hoi mot cau hoi so hoc.
 *
 * ===========================================================================
 * SO HOA DON (`#317` G4) — BO PHAN BIET TUY CHON, KHONG PHAI KHOA.
 *
 * Mot cap chi duoc hoi toi so hoa don SAU KHI da qua ca bon cong cu: xe, ngay, tien, `INV-26`. Den
 * luc do so hoa don lam dung ba viec, va chi ba:
 *
 *   · `CONFLICT` — LOAI DUNG CAP DO khoi tap ung vien (ca hai chieu). Khong loai ca dong, khong loai
 *     ca phieu: hai lan do cung xe/ngay/tien ma so hoa don khac nhau la chuyen that, va chinh so hoa
 *     don la thu tach chung ra. Dong khong con ung vien nao ngoai cac cap xung dot -> `INVOICE_CONFLICT`.
 *   · `EQUAL` — khi CON NHIEU ung vien o mot chieu, dung MOT cap trung so thi cap do duoc chon. Hai
 *     cap cung trung so thi van nhap nhang: bo phan biet khong phan biet duoc gi ca.
 *   · `ABSENT` — khong lam gi. Cap von dung van dung (quyet dinh chu so huu: thieu mot ben khong duoc
 *     pha mot cap chuan).
 *
 * Phep chon van HAI CHIEU va KHONG LAP: dong chon phieu, phieu chon dong, chi khi hai lan chon gap nhau
 * moi khop. Khong co vong "loai cap da khop roi chay lai" — do la duong tham lam ma `GD-09` cam.
 *
 * ===========================================================================
 * CACH TRA (`#371`) — CONG, KHONG PHAI BO PHAN BIET.
 *
 * Phieu `DRIVER_CASH` qua duoc xe/ngay/tien/`INV-26` thi di vao mot tap RIENG (`cashPaid`), KHONG vao
 * tap ung vien — o CA HAI chieu. Hai he qua co y:
 *
 *   · mot phieu tien mat KHONG lam mot ung vien ghi no hop le thanh nhap nhang: dong co mot phieu
 *     ghi no va mot phieu tien mat gan giong nhau van khop phieu ghi no;
 *   · dong chi con phieu tien mat thi ra `PAYMENT_METHOD_CONFLICT`, khong phai `STATEMENT_LINE_ONLY`
 *     chung chung — va o `STATEMENT_LINE_ONLY` nguoi soat duoc phep "chap nhan so cay xang".
 *
 * Hoi TRUOC so hoa don: mot phieu tien mat khong bao gio thanh cap khop, du so hoa don trung hay
 * trai, nen no khong duoc dem vao phep "so hoa don co la thu tach cac ung vien" (`decidedByInvoice`).
 */
export function runFuelMatching(input: FuelMatchingInput): FuelMatchingResult {
  const lines = byId(input.lines.filter((line) => isOpen(line.reconciliationStatus)));
  const entries = byId(input.entries.filter((entry) => isOpen(entry.reconciliationStatus)));

  /**
   * Ung vien HOP LE cua tung dong: cung xe, trong dung sai, khong bi `INV-26` chan, phieu GHI NO,
   * khong xung dot so hoa don.
   */
  const eligible = new Map<string, Pairing[]>();
  /** Ung vien bi `INV-26` chan — giu rieng de bao dung ly do thay vi noi "khong tim thay". */
  const selfSourced = new Map<string, Pairing[]>();
  /** Cung xe, dung ngay, nhung lech tien vuot dung sai. */
  const outOfTolerance = new Map<string, Pairing[]>();
  /** `#371` — dung xe/ngay/tien, nhung phieu do lai xe DA TRA TIEN MAT: khong bao gio la cong no. */
  const cashPaid = new Map<string, Pairing[]>();
  /** `#317` G4 — du bon cong cu, nhung so hoa don hai ben TRAI nguoc. */
  const invoiceConflicts = new Map<string, Pairing[]>();

  for (const line of lines) {
    const eligibleForLine: Pairing[] = [];
    const selfSourcedForLine: Pairing[] = [];
    const outOfToleranceForLine: Pairing[] = [];
    const cashPaidForLine: Pairing[] = [];
    const conflictsForLine: Pairing[] = [];

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
        invoiceRelation: compareFuelInvoiceNumbers(line.invoiceNo, entry.invoiceNo),
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

      // `#371` — bang ke la chung tu CONG NO. Phieu lai xe da tra tien mat dung ve moi mat van KHONG
      // la ung vien: no chi con la bang chung rang dong nay co the la mot lan cay xang ghi no nham.
      if (!isSupplierPayable(entry.paymentMethod)) {
        cashPaidForLine.push(pairing);
        continue;
      }

      // `#317` G4 — so hoa don duoc hoi CUOI CUNG, tren mot cap da dung ve moi mat khac. Xung dot chi
      // loai DUNG cap nay; cac cap khac cua cung dong/phieu van la ung vien.
      if (pairing.invoiceRelation === 'CONFLICT') {
        conflictsForLine.push(pairing);
        continue;
      }

      eligibleForLine.push(pairing);
    }

    eligible.set(line.id, eligibleForLine);
    selfSourced.set(line.id, selfSourcedForLine);
    outOfTolerance.set(line.id, outOfToleranceForLine);
    cashPaid.set(line.id, cashPaidForLine);
    invoiceConflicts.set(line.id, conflictsForLine);
  }

  /**
   * Chieu NGUOC LAI: mot phieu dang la ung vien cua nhung dong nao.
   *
   * Day la thu lam phep khop thanh HAI CHIEU. Thieu no thi hai dong bang ke cung khop duoc voi mot
   * phieu se ca hai cung "khop" — va mot lan do dau se doi soat cho hai khoan tien.
   *
   * `canonicalLineCount` dem CA cap xung dot: no chi dung de biet so hoa don co la thu da tach cac
   * ung vien ra hay khong (`decidedByInvoice`), khong bao gio dung de chon.
   */
  const pairingsByEntry = new Map<string, Pairing[]>();
  const canonicalLineCount = new Map<string, number>();
  for (const pairings of eligible.values()) {
    for (const pairing of pairings) {
      const bucket = pairingsByEntry.get(pairing.entry.id) ?? [];
      bucket.push(pairing);
      pairingsByEntry.set(pairing.entry.id, bucket);
      canonicalLineCount.set(pairing.entry.id, (canonicalLineCount.get(pairing.entry.id) ?? 0) + 1);
    }
  }
  for (const pairings of invoiceConflicts.values()) {
    for (const pairing of pairings) {
      canonicalLineCount.set(pairing.entry.id, (canonicalLineCount.get(pairing.entry.id) ?? 0) + 1);
    }
  }

  const matches: FuelMatchProposal[] = [];
  const discrepancies: FuelDiscrepancyProposal[] = [];
  const matchedEntryIds = new Set<string>();
  const entryIdsInDiscrepancy = new Set<string>();

  for (const line of lines) {
    const candidates = eligible.get(line.id) ?? [];
    const conflicts = invoiceConflicts.get(line.id) ?? [];

    if (candidates.length === 0) {
      const discrepancy = emptyCandidateDiscrepancy(
        line,
        selfSourced,
        cashPaid,
        conflicts,
        outOfTolerance,
      );
      discrepancies.push(discrepancy);
      for (const id of discrepancy.candidateEntryIds) entryIdsInDiscrepancy.add(id);
      continue;
    }

    const chosen = discriminate(candidates);
    if (chosen === null) {
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

    const competing = pairingsByEntry.get(chosen.entry.id) ?? [];
    const chosenByEntry = discriminate(competing);

    // Chieu nguoc: dong nay chon duoc mot phieu, nhung phieu do KHONG chon lai dong nay (nhieu dong
    // nham toi no, va so hoa don khong tach duoc). `GD-09` doi day cung la nhap nhang.
    if (chosenByEntry === null || chosenByEntry.line.id !== line.id) {
      discrepancies.push({
        kind: 'AMBIGUOUS_CANDIDATES',
        statementLineId: line.id,
        fuelEntryId: chosen.entry.id,
        candidateEntryIds: [chosen.entry.id],
        candidateLineIds: competing.map((pairing) => pairing.line.id).sort(),
        reason: 'MATCH_AMBIGUOUS_CANDIDATES',
      });
      entryIdsInDiscrepancy.add(chosen.entry.id);
      continue;
    }

    matches.push({
      statementLineId: line.id,
      fuelEntryId: chosen.entry.id,
      amountDeltaVnd: chosen.amountDeltaVnd,
      businessDateDeltaDays: chosen.businessDateDeltaDays,
      reason:
        chosen.amountDeltaVnd === 0 && chosen.businessDateDeltaDays === 0
          ? 'MATCH_EXACT'
          : 'MATCH_WITHIN_TOLERANCE',
      invoiceRelation: chosen.invoiceRelation === 'EQUAL' ? 'EQUAL' : 'ABSENT',
      decidedByInvoice:
        candidates.length + conflicts.length > 1 ||
        (canonicalLineCount.get(chosen.entry.id) ?? 0) > 1,
    });
    matchedEntryIds.add(chosen.entry.id);
  }

  /**
   * PHIEU KHONG THAY TREN BANG KE.
   *
   * Chi tinh cac phieu KHONG khop VA khong nam trong mot chenh lech nao khac. Neu khong loai tru
   * nhom thu hai thi mot phieu nhap nhang se hien ra hai lan — mot lan la "nhap nhang", mot lan la
   * "khong thay tren bang ke" — va hai dong do mau thuan nhau tren cung mot man hinh.
   *
   * `#371` KHONG doi nhanh nay: phieu `DRIVER_CASH` khong nam trong chenh lech nao van ra
   * `FUEL_ENTRY_ONLY` nhu truoc `#371`. Vang mat tren bang ke CONG NO la trang thai dung cua mot lan
   * tra tien mat; co dua phieu tien mat ra khoi pham vi doi soat hay khong la mot quyet dinh nghiep vu
   * rieng, chua ai quyet — va no khong mo duong tien nao (`FUEL_ENTRY_ONLY` khong co dong bang ke de
   * chap nhan, `MATCH_CONFIRMED` bi chan theo cach tra).
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
 * CHON MOT CAP trong mot tap ung vien — hoac KHONG chon (`null`).
 *
 * Dung mot ung vien -> cap do. Nhieu ung vien -> chi khi DUNG MOT cap trung so hoa don (`#317` G4).
 * Khong co nhanh thu ba: khong "gan nhat", khong "lech it nhat". Dung cho CA HAI chieu — dong chon
 * phieu va phieu chon dong di qua cung mot luat, nen hai chieu khong the lech nhau.
 */
function discriminate(pairings: readonly Pairing[]): Pairing | null {
  const [only, ...rest] = pairings;
  if (only === undefined) return null;
  if (rest.length === 0) return only;

  const [equal, ...moreEqual] = pairings.filter((pairing) => pairing.invoiceRelation === 'EQUAL');
  return equal !== undefined && moreEqual.length === 0 ? equal : null;
}

/**
 * NAM LY DO khac nhau cho cung mot hien tuong "dong nay khong khop duoc voi gi".
 *
 * Thu tu uu tien khong tuy y: `INV-26` truoc, vi no la ly do NGHIEM TRONG nhat — no noi rang co ai
 * do dang co khop mot bang ke voi chinh no. Roi den phieu lai xe DA TRA TIEN MAT (`#371` — dung ve
 * xe/ngay/tien, tuc chinh lan do dau do, va chap nhan dong nay la tra lan thu hai), roi xung dot so hoa
 * don (`#317` G4 — ung vien DUNG ve xe/ngay/tien, chi trai so hoa don, tuc gan nhat voi mot cap that),
 * roi lech dung sai (co ung vien that, chi la so khong khop), roi cuoi cung la "khong co gi ca".
 *
 * Tien mat dung TRUOC xung dot so hoa don vi ly do tien: hai ly do cung co mat thi dong nay co the la
 * lan do tien mat, va `INVOICE_CONFLICT` cho nguoi soat "chap nhan so cay xang" — dung duong tra hai
 * lan ma `PAYMENT_METHOD_CONFLICT` chan.
 */
function emptyCandidateDiscrepancy(
  line: MatchableStatementLine,
  selfSourced: ReadonlyMap<string, Pairing[]>,
  cashPaid: ReadonlyMap<string, Pairing[]>,
  conflicts: readonly Pairing[],
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

  const paidInCash = cashPaid.get(line.id) ?? [];
  if (paidInCash.length > 0) {
    return {
      kind: 'PAYMENT_METHOD_CONFLICT',
      statementLineId: line.id,
      fuelEntryId: null,
      candidateEntryIds: paidInCash.map((pairing) => pairing.entry.id).sort(),
      candidateLineIds: [],
      reason: 'MATCH_PAYMENT_METHOD_CONFLICT',
    };
  }

  if (conflicts.length > 0) {
    return {
      kind: 'INVOICE_CONFLICT',
      statementLineId: line.id,
      fuelEntryId: null,
      candidateEntryIds: conflicts.map((pairing) => pairing.entry.id).sort(),
      candidateLineIds: [],
      reason: 'MATCH_INVOICE_CONFLICT',
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
