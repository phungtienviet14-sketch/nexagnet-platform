import type { BusinessDate } from '../business-date.js';
import type {
  FuelReconciliationStatus,
  FuelReviewReason,
  FuelVerificationStatus,
} from './fuel-lifecycle.js';
import type { FuelStation } from './fuel-station.types.js';
import type {
  FuelEntry,
  FuelPaymentMethod,
  FuelReceiptEvidence,
  FuelSupplier,
} from './fuel.types.js';

/**
 * KHUNG NHIN CUA LAI XE cho phieu do dau — `INV-09`, VT-083, `GD-23`.
 *
 * Mot KIEU RIENG, khong phai `FuelEntry` da bi loc bot truong — cung ly le da viet o
 * `driver-trip.view.ts`:
 *
 *   · loc theo vai   -> lan THEM TRUONG sau la lan no ro ra, vi khong ai nho cap nhat danh sach loc;
 *   · kieu rieng     -> them mot truong vao `FuelEntry` khong lam gi duoc o day ca, vi phep anh xa
 *                       ben duoi phai duoc VIET RA moi co truong.
 *
 * ---------------------------------------------------------------------------
 * O DAY KHONG CHI THIEU DOANH THU. Con thieu ba thu nua, va moi thu mot ly do:
 *
 *   `costExpenseId`      — day la SO CUA KE TOAN. Lai xe khong can biet phieu cua ho da thanh dong
 *                          gia thanh nao, va lo id do ra la mo mot duong doan ve so sach noi bo.
 *   `sourceStatementId`  — noi phieu tu dau ra la chuyen cua doi soat (`INV-26`), khong phai cua
 *                          nguoi nop phieu.
 *   `declaredBy`         — lai xe chi thay phieu CUA CHINH HO, nen truong nay luon la chinh ho:
 *                          mot o hien thi khong noi them gi, va no lam be mat rong ra vo ich.
 *
 * `verificationStatus` thi CO, va co chu dich: mot lai xe phai biet phieu cua minh da duoc duyet
 * hay bi tra lai, va bi tra lai VI SAO — do la ca ly do `reviewNote` cung nam o day.
 */
export interface DriverFuelSlipView {
  readonly id: string;
  /**
   * `#364` — NGU CANH, uu tien XE + THOI DIEM. Vong chay/chang khi phieu khai tren viec duoc dieu;
   * chuyen v1 chi la thong tin TUONG THICH cua phieu cu. Nhieu nhat mot loai co mat.
   */
  readonly tripId: string | null;
  /** Ma chuyen v1 doc duoc — chi co voi phieu cu. */
  readonly tripCode: string | null;
  readonly runId: string | null;
  /** Ma vong xe doc duoc (`RUN-...`), cai lai xe thay o man Hien truong. */
  readonly runCode: string | null;
  readonly legId: string | null;
  /** So thu tu chang trong vong xe ("Chang 2"). */
  readonly legSequence: number | null;
  readonly vehicleId: string;
  /** BIEN SO — lai xe nhan xe bang bien so, khong bang `id`. */
  readonly vehiclePlate: string | null;
  readonly supplierId: string;
  /** `#317` G1 — tram lai xe da khai, va TEN tren bien hieu cua no (khong ma so thue, khong toa do). */
  readonly stationId: string | null;
  readonly stationName: string | null;
  readonly businessDate: BusinessDate;
  readonly occurredAt: string;
  readonly litersUnits: number;
  readonly amount: number;
  readonly currencyCode: string;
  readonly odometerKm: number;
  readonly previousOdometerKm: number | null;
  readonly consumptionUnits: number | null;
  readonly reviewReasons: readonly FuelReviewReason[];
  readonly paymentMethod: FuelPaymentMethod;
  readonly verificationStatus: FuelVerificationStatus;
  readonly reconciliationStatus: FuelReconciliationStatus;
  readonly invoiceNo: string | null;
  readonly note: string | null;
  /** Ly do ke toan tra lai phieu. `null` khi chua ai tra lai. */
  readonly reviewNote: string | null;
  readonly evidenceCount: number;
  /**
   * ANH CUA CHINH PHIEU NAY — chi `id` va loai noi dung, khong hon.
   *
   * Vi sao phai co: `GET /transport/me/fuel/slips/:id/evidence/:evidenceId` doi mot `evidenceId`,
   * va truoc lan sua nay be mat lai xe KHONG co duong nao hoc duoc ma do — chi biet co BAO NHIEU
   * anh (`evidenceCount`). Nen lai xe tai anh len duoc nhung khong xem lai duoc no sau khi tai
   * trang, va acceptance 8 cua #170 khong the dat.
   *
   * `locator` CO Y vang mat: no la khoa trong kho anh, va dua no ra trinh duyet se bien mot dinh vi
   * duc thanh mot dia chi doan duoc. `uploadedBy` cung vang mat — do la danh tinh nguoi van hanh,
   * cung ly le voi bon truong bi bo o be mat phieu luong (`#168 B8 §3`).
   *
   * `contentType` co mat vi man hinh phai chon giua the anh va mot lien ket tai ve cho PDF.
   */
  readonly evidence: readonly DriverFuelEvidenceView[];
  readonly createdAt: string;
}

/** Mot anh cua phieu, o dang lai xe duoc phep biet. */
export interface DriverFuelEvidenceView {
  readonly id: string;
  readonly contentType: string | null;
}

/**
 * Phep anh xa TUONG MINH tung truong.
 *
 * CO Y khong dung `{ ...entry, costExpenseId: undefined }` hay mot ham `omit()`: ca hai deu la
 * "loc" doi lot, va ca hai deu de lot truong moi. O day, mot truong chi co mat neu ai do go ten no
 * ra — va luc go thi phai doc lai chinh khoi chu thich ben tren.
 */
/**
 * NHUNG MA DOC DUOC cua phieu — tang doc doi `id -> ma` THEO LO roi dua vao day.
 *
 * BAT BUOC du tung truong co the `null`, cung ly le voi `stationName`: mot tham so tuy chon la mot
 * noi goi quen doi ma.
 */
export interface DriverFuelSlipLabels {
  readonly stationName: string | null;
  readonly vehiclePlate: string | null;
  readonly tripCode: string | null;
  readonly runCode: string | null;
  readonly legSequence: number | null;
}

export function toDriverFuelSlipView(
  entry: FuelEntry,
  evidence: readonly FuelReceiptEvidence[],
  labels: DriverFuelSlipLabels,
): DriverFuelSlipView {
  return {
    id: entry.id,
    tripId: entry.tripId,
    tripCode: entry.tripId === null ? null : labels.tripCode,
    runId: entry.runId,
    runCode: entry.runId === null ? null : labels.runCode,
    legId: entry.legId,
    legSequence: entry.legId === null ? null : labels.legSequence,
    vehicleId: entry.vehicleId,
    vehiclePlate: labels.vehiclePlate,
    supplierId: entry.supplierId,
    stationId: entry.stationId,
    stationName: entry.stationId === null ? null : labels.stationName,
    businessDate: entry.businessDate,
    occurredAt: entry.occurredAt,
    litersUnits: entry.litersUnits,
    amount: entry.amount,
    currencyCode: entry.currencyCode,
    odometerKm: entry.odometerKm,
    previousOdometerKm: entry.previousOdometerKm,
    consumptionUnits: entry.consumptionUnits,
    reviewReasons: entry.reviewReasons,
    paymentMethod: entry.paymentMethod,
    verificationStatus: entry.verificationStatus,
    reconciliationStatus: entry.reconciliationStatus,
    invoiceNo: entry.invoiceNo,
    note: entry.note,
    reviewNote: entry.reviewNote,
    evidenceCount: evidence.length,
    // Chon TUNG TRUONG, khong spread: `FuelReceiptEvidence` mang `locator` va `uploadedBy`, va mot
    // `...row` o day se lang le day ca hai ra trinh duyet.
    evidence: evidence.map((row) => ({ id: row.id, contentType: row.contentType })),
    createdAt: entry.createdAt,
  };
}
/**
 * CAY XANG — khung nhin cua LAI XE.
 *
 * ==============================================================================================
 * VI SAO KHUNG NHIN NAY PHAI TON TAI
 *
 * `POST /transport/me/fuel/slips` DOI `supplierId`. Nhung duong doc danh sach cay xang duy nhat
 * (`GET /transport/fuel/suppliers`) doi `transport.fuel.entry.read` — mot quyen VAN HANH ma lai xe
 * khong co, va khong duoc co. Hau qua doc duoc tren man hinh: o chon cay xang cua lai xe LUON
 * RONG, va vi no `required` nen lai xe KHONG BAO GIO nop duoc phieu.
 *
 * Cach sua sai la cap cho lai xe quyen van hanh. Cach dung la mo mot duong doc THUOC PHAM VI CUA
 * CHINH HO, tra ve dung nhung gi can de chon mot cay xang: ma va TEN.
 *
 * `taxCode` co y VANG MAT. Lai xe chon cay xang bang ten tren bien hieu; ma so thue la thong tin
 * ke toan, va mot truong khong duoc gui di la mot truong khong the ro ri.
 */
export interface DriverFuelSupplierView {
  readonly id: string;
  readonly name: string;
}

export function toDriverFuelSupplierView(supplier: FuelSupplier): DriverFuelSupplierView {
  // Chon TUNG TRUONG, khong spread — cung ly le nhu `evidence` o tren.
  return { id: supplier.id, name: supplier.name };
}

/**
 * TRAM/DIEM DO — khung nhin cua LAI XE (`#317` G1).
 *
 * Cung ly le voi `DriverFuelSupplierView`: `POST me/fuel/slips` nhan `stationId`, nhung danh muc tram
 * nam sau quyen `transport.fuel.station.read` cua van hanh. Lai xe can dung nhung gi de NHAN RA mot
 * cua hang tren duong: ten, ma cua hang, dia chi. Toa do, ban kinh hang rao va ghi chu noi bo CO Y
 * vang mat — chung khong giup chon, va mot truong khong gui di la mot truong khong the ro ri.
 *
 * Chi tram `ACTIVE`: mot tram da ngung hop tac se bi tu choi o duong nop (`FUEL_ENTRY_STATION_INACTIVE`),
 * nen dua no vao o chon la moi lai xe chon mot thu chac chan bi tu choi.
 */
export interface DriverFuelStationView {
  readonly id: string;
  readonly supplierId: string;
  readonly name: string;
  readonly code: string | null;
  readonly address: string | null;
}

/**
 * VIEC DUOC DIEU lai xe khai phieu dau duoc — `#364`, khung nhin cua LAI XE.
 *
 * May chu TU tim (vong chay DANG MO ma lai xe DANG duoc phan cong — cung tap voi man Hien truong),
 * va dua kem BIEN SO cua xe vong chay: lai xe khong chon xe, xe LA xe cua vong chay. Lenh nop van
 * kiem lai tat ca — danh sach nay chi de DE XUAT, khong phai mot cong quyen.
 *
 * Khong doanh thu, khong don hang, khong khach (`INV-09`): chi du de nhan ra MOT viec tren duong.
 */
export interface DriverFuelRunView {
  readonly runId: string;
  readonly runCode: string;
  readonly runStatus: string;
  readonly vehicleId: string;
  readonly vehiclePlate: string | null;
  readonly legs: readonly DriverFuelLegView[];
}

export interface DriverFuelLegView {
  readonly legId: string;
  readonly sequence: number;
  readonly kind: string;
  readonly status: string;
  readonly originLabel: string;
  readonly destinationLabel: string;
}

export function toDriverFuelStationView(station: FuelStation): DriverFuelStationView {
  return {
    id: station.id,
    supplierId: station.supplierId,
    name: station.name,
    code: station.code,
    address: station.address,
  };
}
