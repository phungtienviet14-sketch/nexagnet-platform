import type { PartyStatus } from '../transport.types.js';

/**
 * DANH TINH CAY XANG — hinh dang du lieu doc len tu kho.
 *
 * Tach khoi `fuel.types.ts` cung ly le voi viec do da tach khoi `costing.types.ts`: day la MASTER
 * DATA (ai la ai, o dau), con ben kia la CHUNG TU (ai da do bao nhieu lit, luc nao). Hai vong doi
 * khac han nhau — mot cai nguoi nhap mot lan roi sua thua thot, mot cai sinh ra moi ngay va bi
 * khoa lai sau khi doi soat. Tron chung se lam mot lan sua ten tram trong nhu mot lan sua chung tu.
 *
 * ---------------------------------------------------------------------------
 * QUY UOC DON VI cua ca tep:
 *
 *   `latitudeE7`/`longitudeE7`  so nguyen ty le 1e-7 DO (1e-7 do ~ 1,1 cm)
 *   `geofenceRadiusM`           so nguyen MET
 *   `contract*Date`             chuoi `YYYY-MM-DD`
 *
 * KHONG truong nao o day mang so thuc — cung mot luat voi `fuel.types.ts`.
 */

/** MOT CAY XANG CU THE. `nameNormalized`/`codeNormalized` la KHOA SO KHOP, khong phai trang tri. */
export interface FuelStation {
  readonly id: string;
  readonly supplierId: string;
  readonly name: string;
  readonly nameNormalized: string;
  readonly code: string | null;
  readonly codeNormalized: string | null;
  readonly address: string | null;
  readonly latitudeE7: number | null;
  readonly longitudeE7: number | null;
  readonly geofenceRadiusM: number | null;
  readonly status: PartyStatus;
  readonly note: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** BI DANH — mot lan quyet cua NGUOI, ghi lai de khong phai quyet lai. */
export interface FuelStationAlias {
  readonly id: string;
  readonly stationId: string;
  readonly normalized: string;
  readonly raw: string;
  readonly createdBy: string;
  readonly createdAt: string;
}

/** Mot tram kem cac bi danh cua no — khung nhin cua man hinh chi tiet. */
export interface FuelStationDetail {
  readonly station: FuelStation;
  readonly aliases: readonly FuelStationAlias[];
}

export const FUEL_INGEST_CHANNELS = ['STATEMENT_FILE', 'EINVOICE'] as const;
export type FuelIngestChannel = (typeof FUEL_INGEST_CHANNELS)[number];

/**
 * SIEU DU LIEU HOP DONG cua mot nha cung cap.
 *
 * MOT KIEU RIENG chu khong tron thang vao `FuelSupplier`, du chung o cung mot bang: cai nay la thu
 * nguoi doi soat DOC, va `INV-07`/`INV-27` cam moi duong tu dong bien no thanh tien. Mot kieu
 * rieng lam ranh gioi do doc duoc trong chinh chu ky ham — mot ham nhan `FuelSupplierContract`
 * khong the vo tinh nhan them mot con so tien.
 */
export interface FuelSupplierContract {
  readonly contactName: string | null;
  readonly contactEmail: string | null;
  readonly contractNo: string | null;
  readonly contractStartDate: string | null;
  readonly contractEndDate: string | null;
  /** So ngay cong no theo hop dong. KHONG duong tinh tien nao doc truong nay. */
  readonly paymentTermDays: number | null;
  readonly termsNote: string | null;
  /** Nguon du lieu nha cung cap that su gui ve. Mang rong = chua ai khai (`Q-08` chua co loi). */
  readonly ingestChannels: readonly FuelIngestChannel[];
  readonly ingestAccountRef: string | null;
}
