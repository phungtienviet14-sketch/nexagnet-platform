import type { GeoPoint } from '../../geo/geo-point.js';

/**
 * CONG TELEMATICS — vi tri xe tu hop GSHT gan tren xe.
 *
 * TEN NAY DA DUOC DAT SAN. `docs/kien-truc/transport-domain-contract.md` §Layer E khai
 * `VehicleTelematicsPort` tu T1 va de trang o cot "trang thai". Lane B mo no ra chu KHONG dat mot
 * cai ten moi canh no — hai cong cung nghia voi hai cai ten la cach mot he thong co hai su that.
 *
 * ============================================================================================
 * VI SAO CONG NAY QUAN TRONG HON VE NGOAI CUA NO
 * ============================================================================================
 *
 * Moi tin hieu chong gia mao chay tren DIEN THOAI cua lai xe deu co cung mot diem yeu: chinh
 * nguoi bi do dang cam thiet bi do. `Location.isMock()` bi cac module LSPosed dang phat hanh cong
 * khai ep tra `false`; gia mao o tang vo tuyen thi khong de lai mot dau vet phan mem nao.
 *
 * Hop GSHT thi khac: no gan tren XE, do CONG TY lap, va tu 01/01/2025 la thiet bi BAT BUOC hop
 * quy tren xe dau keo (NĐ 158/2024/NĐ-CP; QCVN 06:2024/BCA). Do la mot nguon vi tri DOC LAP ma
 * doanh nghiep DA TRA TIEN, va no la doi chieu cheo tot nhat he nay se co — tot hon moi thu ta
 * co the viet o phia ung dung.
 *
 * ============================================================================================
 * CHUA CO NHA CUNG CAP, VA DO KHONG PHAI MOT KHOANG TRONG DE LAP BUA
 * ============================================================================================
 *
 * Do lai 08/09/2026: khong mot hang GSHT lon nao o Viet Nam (BA GPS, VNPT, Viettel, Adsun) cong
 * bo mot API cho KHACH HANG. Cai ho co la mot bang dieu khien, va mot duong truyen bat buoc ve
 * he thong cua Cuc Duong bo — tuc du lieu chay ve CO QUAN QUAN LY, khong chay ve phan mem cua
 * doanh nghiep. Nen ba duong nhap thuc te la: xuat tu bang dieu khien (CSV/XLSX), nhap tay, va
 * mot API neu sau nay dam phan duoc.
 *
 * Vi vay tep nay KHONG chua mot dong nao cua mot hang cu the (#232 D-03). No chi dinh nghia hinh
 * dang cua cau tra loi.
 */

export interface TelematicsFix {
  /** Da giai ra xe cua he thong o TANG ADAPTER. Cong nay khong biet bien so la gi. */
  readonly vehicleId: string;
  readonly point: GeoPoint;
  /** Thoi diem hop GSHT ghi nhan. Dong ho cua HOP, khong phai cua may chu. */
  readonly recordedAt: Date;
  readonly speedMetresPerSecond: number | null;
  readonly odometerKm: number | null;
  /** Ma hang cua chinh nha cung cap, de chan nhap trung. `null` khi nguon khong co ma. */
  readonly providerRef: string | null;
}

export interface TelematicsQuery {
  readonly vehicleId: string;
  readonly from: Date;
  readonly to: Date;
}

export type TelematicsUnavailableReason =
  /** Khach chua khai mot nha cung cap nao. Day la trang thai MAC DINH hom nay. */
  | 'NO_PROVIDER_CONFIGURED'
  /** Co nha cung cap, nhung chiec xe nay khong nam trong tai khoan do. */
  | 'VEHICLE_NOT_ENROLLED'
  /** Co nha cung cap, co xe, nhung khong goi duoc — mang, xac thuc, hoac hang dang hong. */
  | 'PROVIDER_UNREACHABLE';

export type TelematicsAvailability =
  | { readonly available: true; readonly providerName: string }
  | { readonly available: false; readonly reason: TelematicsUnavailableReason };

/**
 * `describe()` la ham QUAN TRONG NHAT cua cong nay, quan trong hon `fetch()`.
 *
 * Ly do: neu chi co `fetch()`, thi "chua khai nha cung cap" va "xe do khong chay hom nay" deu tra
 * ve MOT MANG RONG. Hai cau do khong lien quan gi den nhau — mot cai la mot khoang trong trong
 * CAU HINH, cai kia la mot khang dinh ve THE GIOI — nhung o dau ra chung giong het.
 *
 * Va hau qua khong phai ly thuyet: mot man hinh doi chieu cheo se hien "khong co bat thuong" cho
 * moi chiec xe, mai mai, o mot he thong chua he duoc cam vao gi ca. Khong ai phat hien ra, vi
 * mot he thong khong bao gio keu thi trong y het mot he thong khong co van de.
 *
 * Nen mot nguon KHONG SAN SANG phai noi ra rang no khong san sang, va `crossCheckTracks` tra ve
 * `NO_SECOND_SOURCE` chu khong tra ve `AGREE`.
 */
export abstract class VehicleTelematicsPort {
  /**
   * Muc KHACH/NHA CUNG CAP: *"khach nay co dau mot nguon thu hai khong"*.
   *
   * CHU Y PHAM VI. Cau tra loi o day KHONG noi gi ve MOT CHIEC XE cu the — chinh bang
   * `TelematicsUnavailableReason` da noi ra dieu do: `VEHICLE_NOT_ENROLLED` chi co nghia khi dang
   * xet mot `vehicleId`. Dung ham nay de tra loi mot cau hoi ve mot chiec xe la mot loi pham vi,
   * va no im lang cho den ngay co mot nha cung cap that (xem `describeVehicle`).
   */
  abstract describe(): TelematicsAvailability;
  /**
   * Muc CHIEC XE: *"chiec xe nay co gan/dang ky thiet bi voi nha cung cap do khong"*.
   *
   * ============================================================================================
   * VI SAO DAY PHAI LA MOT HAM RIENG, VA PHAI LA `abstract`
   * ============================================================================================
   *
   * Mot doi xe khong bao gio duoc gan thiet bi DONG LOAT. Xe dau keo lap hop GSHT hop quy, xe tai
   * nho thi khong; mot chiec vua ban di thi thiet bi da thao ra. Nen `describe().available === true`
   * chi noi *"khach da ky voi mot nha cung cap"* — no KHONG cho phep ket luan mot chiec xe bat ky
   * dang duoc phan cung theo doi.
   *
   * Tron hai muc lai thi dung ngay ngay mot nha cung cap that duoc cam vao, MOI chiec xe dang co
   * phien deu bi coi la co telematics — ke ca xe khong gan thiet bi. Sau cua so mat, phep cham suc
   * khoe ket luan `ALL_SOURCES_LOST` cho mot nguon CHUA BAO GIO TON TAI tren chiec xe do. Do la
   * mot bao dong SAI, va la loai te nhat: no chi xuat hien dung luc he thong bat dau chay that.
   *
   * `abstract` chu khong phai mot hien thuc mac dinh goi `describe()`: mot mac dinh nhu vay tai
   * lap dung cai loi vua ta, va nguoi viet adapter tiep theo khong co cach nao biet minh vua bo qua
   * mot cau hoi. Bat buoc tra loi thi khong ai quen duoc.
   */
  abstract describeVehicle(vehicleId: string): TelematicsAvailability;
  /** NEM khi `describe()` bao khong san sang. KHONG tra mang rong: xem khoi chu thich tren. */
  abstract fetch(query: TelematicsQuery): Promise<readonly TelematicsFix[]>;
}

export class TelematicsUnavailableError extends Error {
  constructor(readonly reason: TelematicsUnavailableReason) {
    super(`Nguon telematics khong san sang: ${reason}`);
    this.name = 'TelematicsUnavailableError';
  }
}

/**
 * Hien thuc MAC DINH, va la hien thuc DUY NHAT hom nay.
 *
 * No khong gia vo lam gi ca. Do la chu y: mot adapter gia tra ve du lieu bia se lam moi bai kiem
 * doi chieu cheo xanh o mot he thong chua bao gio doi chieu cai gi.
 */
export class UnconfiguredVehicleTelematicsAdapter extends VehicleTelematicsPort {
  describe(): TelematicsAvailability {
    return { available: false, reason: 'NO_PROVIDER_CONFIGURED' };
  }

  // Chua co nha cung cap thi khong chiec xe nao dang ky duoc — va ly do dung van la
  // `NO_PROVIDER_CONFIGURED`: `VEHICLE_NOT_ENROLLED` se ngu y rang co mot tai khoan de dang ky vao.
  describeVehicle(_vehicleId: string): TelematicsAvailability {
    return { available: false, reason: 'NO_PROVIDER_CONFIGURED' };
  }

  // Nhan `_query` du khong dung: giu dung chu ky cua cong de mot hien thuc that sau nay thay vao
  // duoc ma khong doi mot dong nao o phia nguoi goi.
  async fetch(_query: TelematicsQuery): Promise<readonly TelematicsFix[]> {
    throw new TelematicsUnavailableError('NO_PROVIDER_CONFIGURED');
  }
}
