import type { BusinessDate } from '../business-date.js';
import { resolveLinkedVehicle, type TollActiveLinkView } from './toll-account-link.js';
import { normalizeAccountNo } from './toll-identity.js';
import type { TollTransactionKind } from './toll-provider.port.js';
import type { TollMatchState } from './toll.types.js';

/**
 * PHAN LOAI mot dong DA DOC DUOC — ham THUAN, khong cham DB.
 *
 * ===========================================================================
 * TEP NAY DE XUAT, NO KHONG QUYET.
 *
 * #269 J5/J6: mot dong doc ra van la mot UNG VIEN / mot du kien cua nha cung cap, khong phai mot
 * khoan phai tra. Khong ham nao o day sinh cong no, khong ham nao cham so quy lai xe, va khong
 * ham nao suy ra mot nghia vu tu DAU cua so tien — quy uoc dau cua tung nha cung cap con o muc
 * `CUSTOMER SAMPLE REQUIRED`.
 *
 * Va no khong bao gio chon bua: khi co nhieu ung vien, nhan la `AMBIGUOUS` chu khong phai cai dau
 * tien trong danh sach.
 */

export interface ClassifiableTollRow {
  readonly rowNumber: number;
  readonly parseStatus: 'ACCEPTED' | 'REJECTED';
  readonly accountNoRaw: string;
  readonly kind: TollTransactionKind | null;
  readonly vehiclePlateRaw: string;
  readonly providerRef: string | null;
  readonly businessDate: BusinessDate | null;
  readonly fingerprint: string | null;
}

export interface ClassifiedTollRow {
  readonly rowNumber: number;
  readonly accountId: string | null;
  readonly vehicleId: string | null;
  /** `null` o dong bi tu choi luc doc — mot dong khong doc duoc thi khong co gi de phan loai. */
  readonly matchState: TollMatchState | null;
  readonly ambiguousVehicleIds: readonly string[];
}

export interface ClassifyTollRowsInput {
  readonly rows: readonly ClassifiableTollRow[];
  readonly accountIdByNormalizedNo: ReadonlyMap<string, string>;
  readonly linksByAccountId: ReadonlyMap<string, readonly TollActiveLinkView[]>;
  /**
   * Dau van DA CO trong kho, tu cac lan nap TRUOC.
   *
   * #269 J4 doi phat hien duoc *"same external transaction arriving through two source files"*.
   * VETC gop toi da 1.000 giao dich mot hoa don, nen mot thang co the ve nhieu tep — va hai tep co
   * the chong nhau o phan giao.
   */
  readonly knownFingerprints: ReadonlySet<string>;
}

/**
 * CHI mot luot qua tram moi CAN mot chiec xe.
 *
 * #269 J6: *"account top-up/fee/adjustment may not belong to one trip"*. Doi moi dong ETC phai co
 * xe se lam moi lan nap tien nam vinh vien trong hang cho doi soat, va hang do se khong bao gio
 * ngan di — tuc nguoi doi soat se thoi doc no.
 */
const requiresVehicle = (kind: TollTransactionKind | null): boolean => kind === 'TOLL_PASS';

export function classifyTollRows(input: ClassifyTollRowsInput): ClassifiedTollRow[] {
  /*
   * DEM DAU VAN TRONG CHINH LAN NAP NAY truoc khi phan loai dong nao.
   *
   * Phai dem TRUOC vi ca hai dong cua mot cap trung deu phai mang nhan — neu vua di vua danh dau
   * thi dong dau tien se di qua sach se roi chi dong thu hai bi neu, va nguoi doi soat se mo dong
   * thu hai ra ma khong thay no trung voi cai gi.
   */
  const occurrences = new Map<string, number>();
  for (const row of input.rows) {
    if (row.parseStatus !== 'ACCEPTED' || row.fingerprint === null) continue;
    occurrences.set(row.fingerprint, (occurrences.get(row.fingerprint) ?? 0) + 1);
  }

  return input.rows.map((row): ClassifiedTollRow => {
    const empty = {
      rowNumber: row.rowNumber,
      accountId: null,
      vehicleId: null,
      ambiguousVehicleIds: [] as readonly string[],
    };

    if (row.parseStatus !== 'ACCEPTED' || row.businessDate === null) {
      return { ...empty, matchState: null };
    }

    const accountId =
      input.accountIdByNormalizedNo.get(normalizeAccountNo(row.accountNoRaw)) ?? null;
    if (accountId === null) return { ...empty, matchState: 'ACCOUNT_UNRESOLVED' };

    const resolution = resolveLinkedVehicle({
      links: input.linksByAccountId.get(accountId) ?? [],
      onDate: row.businessDate,
      plateRaw: row.vehiclePlateRaw === '' ? null : row.vehiclePlateRaw,
      providerVehicleRef: row.providerRef,
    });

    const vehicleId = resolution.kind === 'RESOLVED' ? resolution.vehicleId : null;
    const ambiguousVehicleIds = resolution.kind === 'AMBIGUOUS' ? resolution.vehicleIds : [];

    /*
     * NGHI NGO TRUNG THANG cau hoi ve chiec xe — nhung KHONG xoa cau tra loi do.
     *
     * Thu tu: chua biet su kien nay co that hay khong thi gan xe cho no la viec thua. Nhung
     * `vehicleId` van duoc tra ve, de nguoi doi soat nhin thay ca hai mat cua cap trung cung luc
     * thay vi phai giai mot cau hoi roi moi thay cau kia.
     */
    const duplicated =
      row.fingerprint !== null &&
      ((occurrences.get(row.fingerprint) ?? 0) > 1 || input.knownFingerprints.has(row.fingerprint));
    if (duplicated) {
      return {
        ...empty,
        accountId,
        vehicleId,
        ambiguousVehicleIds,
        matchState: 'DUPLICATE_CANDIDATE',
      };
    }

    if (resolution.kind === 'AMBIGUOUS') {
      return { ...empty, accountId, ambiguousVehicleIds, matchState: 'AMBIGUOUS' };
    }

    if (requiresVehicle(row.kind) && vehicleId === null) {
      return { ...empty, accountId, matchState: 'VEHICLE_UNRESOLVED' };
    }

    return { ...empty, accountId, vehicleId, matchState: 'MATCHED' };
  });
}
