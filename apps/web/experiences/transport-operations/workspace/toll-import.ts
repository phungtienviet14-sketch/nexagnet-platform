import type { TollImportInput } from '../transport-api';
import {
  type ManualTollRowInput,
  type TollFileFormat,
  type TollProvider,
  type TollTransactionKind,
} from '../transport-types';
import type { TollPreviewModel } from './toll';

/**
 * BIEU NAP BANG KE ETC — phan QUYET DINH, tach khoi phan ve.
 *
 * ==============================================================================================
 * VI SAO TEP NAY TON TAI
 * ==============================================================================================
 *
 * Mot bieu nhap thi ai cung nghi la "chi la giao dien". Nhung hai cau hoi duoi day khong phai cau
 * hoi giao dien, va tra loi sai thi tien di sai:
 *
 *   1. *"bo byte sap duoc GHI co dung la bo byte vua duoc doc thu khong"*;
 *   2. *"dong nay la mot luot qua tram, hay mot lan nap tien"*.
 *
 * Ca hai deu kiem duoc bang ham thuan, va o day chung duoc kiem nhu vay. Tang ve (`TollImport.tsx`)
 * khong con mot phep quyet dinh nao — no chi doc ket qua cua tep nay.
 */

/* ------------------------------------------------------------------ *
 * BAN NHAP
 * ------------------------------------------------------------------ */

export type TollImportMode = 'STATEMENT_FILE' | 'MANUAL';

/**
 * ANH CHUP bieu nhap tai MOT khoanh khac.
 *
 * `fileToken` chu khong phai `File`: tang nay khong duoc doc mot tep (doc tep la viec bat dong bo,
 * va mot ham thuan thi khong lam viec do). Ma danh tinh cua tep la du de tra loi cau hoi duy nhat
 * ma tang nay can — *"van con la dung tep do khong"*.
 */
export interface TollImportDraft {
  readonly provider: TollProvider;
  readonly mode: TollImportMode;
  readonly sourceLabel: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly format: TollFileFormat;
  readonly fileToken: string | null;
  readonly rows: readonly ManualTollRowInput[];
}

/** Chuoi rong tu mot o nhap la "khong co", khong phai mot gia tri. */
const orNull = (value: string): string | null => (value.trim() === '' ? null : value.trim());

/**
 * DANH TINH cua mot tep da chon.
 *
 * Ten + co + lan sua cuoi. Khong phai mot bam noi dung — bam noi dung doi doc ca tep, va tang nay
 * thuan. Ba truong nay du de bat truong hop that: nguoi dung doi sang mot tep khac sau khi da doc
 * thu. Hai tep khac noi dung ma trung ca ba truong la truong hop khong xay ra tren mot may that,
 * va neu no xay ra thi may chu van chan bang `unique(provider, sourceDigest)`.
 */
export const tollFileToken = (file: {
  readonly name: string;
  readonly size: number;
  readonly lastModified: number;
}): string => `${file.name}|${String(file.size)}|${String(file.lastModified)}`;

/* ------------------------------------------------------------------ *
 * LOAI GIAO DICH — mot dong nap tien KHONG phai mot luot qua tram
 * ------------------------------------------------------------------ */

/**
 * Dong thuoc loai nay co gan vao MOT CHIEC XE khong.
 *
 * ==============================================================================================
 * DAY LA MOT SU THAT NGHIEP VU, KHONG PHAI MOT LUA CHON GIAO DIEN
 * ==============================================================================================
 *
 * `TOP_UP` la tien di VAO tai khoan; `ACCOUNT_FEE` la phi cua chinh tai khoan. Ca hai xay ra o muc
 * TAI KHOAN va khong co chiec xe nao trong do — khong tram, khong thoi diem qua tram, khong bien
 * so. Gan mot bien so vao mot dong nhu vay la tao ra mot lien he khong co that, va lien he do di
 * tiep vao moi bao cao chi phi theo xe.
 *
 * `ADJUSTMENT` thi CO THE thuoc ve mot chiec xe (dieu chinh mot luot qua tram ghi nham) hoac khong
 * (dieu chinh so du). Nen no o trang thai tuy chon — ep mot chieu nao cung sai mot nua so truong
 * hop.
 */
export const tollRowCarriesVehicle = (kind: TollTransactionKind): boolean =>
  kind === 'TOLL_PASS' || kind === 'ADJUSTMENT';

/**
 * DOI LOAI cua mot dong — va don theo nhung o khong con nghia.
 *
 * Khong don thi mot nguoi go bien so, roi doi loai sang `TOP_UP`, se gui di mot dong `TOP_UP` mang
 * bien so. May chu KHONG tu choi dong do (bien so la truong tuy chon), nen no se lang le tro thanh
 * mot khoan nap tien gan vao mot chiec xe.
 *
 * Tra ve MOT DOI TUONG MOI — khong sua tai cho.
 */
export const applyTollRowKind = (
  row: ManualTollRowInput,
  kind: TollTransactionKind,
): ManualTollRowInput =>
  tollRowCarriesVehicle(kind)
    ? { ...row, kind }
    : { ...row, kind, vehiclePlate: null, station: null, passedAt: null };

export const EMPTY_MANUAL_TOLL_ROW: ManualTollRowInput = {
  accountNo: '',
  kind: 'TOLL_PASS',
  vehiclePlate: null,
  passedAt: null,
  businessDate: null,
  amount: '',
  station: null,
  providerRef: null,
};

/** Mot dong duoc gui di khi co du hai o BAT BUOC. May chu kiem lai lan nua. */
export const tollRowSubmittable = (row: ManualTollRowInput): boolean =>
  row.accountNo.trim() !== '' && row.amount.trim() !== '';

/* ------------------------------------------------------------------ *
 * THAN YEU CAU, VA DAU VAN TAY CUA NO
 * ------------------------------------------------------------------ */

/**
 * HINH DANG cua than yeu cau — KHONG kem noi dung tep.
 *
 * Ham nay la nguon DUY NHAT sinh ra ca than yeu cau that lan dau van tay dung de so sanh. Hai cho
 * tu liet ke lay "nhung truong nao anh huong toi yeu cau" la hai danh sach se lech nhau — va cho
 * lech dau tien chinh la loi ban soat tim thay: `sourceLabel`, `periodStart`, `periodEnd` va
 * `format` khong nam trong danh sach lam mat hieu luc ban doc thu.
 *
 * Rut ca hai tu mot cho thi khong con danh sach nao de quen.
 */
const requestShape = (draft: TollImportDraft): Record<string, unknown> => {
  const base = {
    provider: draft.provider,
    sourceLabel: draft.sourceLabel.trim(),
    periodStart: orNull(draft.periodStart),
    periodEnd: orNull(draft.periodEnd),
  };
  return draft.mode === 'MANUAL'
    ? { ...base, sourceKind: 'MANUAL', rows: draft.rows }
    : { ...base, sourceKind: 'STATEMENT_FILE', format: draft.format, file: draft.fileToken };
};

/**
 * DAU VAN TAY cua than yeu cau ma ban nhap nay se sinh ra.
 *
 * Doi MOT truong bat ky co anh huong toi yeu cau thi dau van tay doi. Do la ca hop dong cua ham
 * nay, va no duoc giu bang cach lay thang tu `requestShape` chu khong bang mot danh sach viet tay.
 */
export const tollImportFingerprint = (draft: TollImportDraft): string =>
  JSON.stringify(requestShape(draft));

/**
 * THAN YEU CAU THAT — chi khac `requestShape` o cho tep da duoc doc thanh base64.
 *
 * `contentBase64` di vao bang tham so vi viec doc tep la bat dong bo, con tang nay thuan.
 */
export const buildTollImportRequest = (
  draft: TollImportDraft,
  contentBase64: string | null,
): TollImportInput => {
  const base = {
    provider: draft.provider,
    sourceLabel: draft.sourceLabel.trim(),
    periodStart: orNull(draft.periodStart),
    periodEnd: orNull(draft.periodEnd),
  };
  if (draft.mode === 'MANUAL') {
    return { ...base, sourceKind: 'MANUAL', rows: draft.rows };
  }
  if (contentBase64 === null) throw new Error('Chưa chọn tệp bảng kê.');
  return { ...base, sourceKind: 'STATEMENT_FILE', format: draft.format, contentBase64 };
};

/** Da du de bam "Xem truoc" chua. */
export const tollImportReady = (draft: TollImportDraft, statementReady: boolean): boolean => {
  if (draft.sourceLabel.trim() === '') return false;
  return draft.mode === 'MANUAL'
    ? draft.rows.some(tollRowSubmittable)
    : draft.fileToken !== null && statementReady;
};

/* ------------------------------------------------------------------ *
 * RANG BUOC: GHI DUNG CAI DA DOC THU
 * ------------------------------------------------------------------ */

/**
 * KET QUA DOC THU, BUOC VAO DUNG THAN YEU CAU DA SINH RA NO.
 *
 * ==============================================================================================
 * VI SAO PHAI GIU CA `request`, KHONG CHI GIU `model`
 * ==============================================================================================
 *
 * Ban truoc giu moi `TollPreviewModel` (thu de VE), roi luc nap that thi DUNG LAI bieu nhap de sinh
 * mot than yeu cau MOI. Hai than yeu cau do khong buoc phai giong nhau: nguoi van hanh doc thu bo
 * A, sua mot o, roi bam nap — va cai duoc GHI la bo B, trong khi man hinh van dang hien ket qua doc
 * thu cua bo A.
 *
 * Voi `format` thi day khong con la chuyen hinh thuc: no doi cach may chu doc tep, tuc doi luon cac
 * dong ung vien duoc sinh ra. Va khong co duong `DELETE` nao cho mot lan nap.
 *
 * Nen `request` duoc DONG BANG tai luc doc thu, va no la thu duy nhat duoc gui di khi nap.
 */
export interface TollImportPreviewBinding {
  readonly request: TollImportInput;
  readonly fingerprint: string;
  readonly model: TollPreviewModel;
}

export const bindTollPreview = (
  request: TollImportInput,
  draft: TollImportDraft,
  model: TollPreviewModel,
): TollImportPreviewBinding => ({
  request,
  fingerprint: tollImportFingerprint(draft),
  model,
});

/**
 * THAN YEU CAU DUOC PHEP GHI — hoac `null`.
 *
 * `null` co DUNG mot nghia: bieu nhap da doi ke tu lan doc thu, nen khong co gi da duoc doc thu de
 * ma ghi. Nguoi goi bien `null` thanh mot cai nut bi khoa.
 *
 * Phep so sanh tren DAU VAN TAY chu khong tren chinh `request`: hai ban nhap sinh ra cung mot than
 * yeu cau (vi du rot them khoang trang vao `sourceLabel`) van duoc coi la KHONG doi — dung nhu the,
 * vi thu di vao may chu khong doi.
 */
export const commitableTollRequest = (
  binding: TollImportPreviewBinding | null,
  draft: TollImportDraft,
): TollImportInput | null => {
  if (binding === null) return null;
  return binding.fingerprint === tollImportFingerprint(draft) ? binding.request : null;
};

/**
 * Ban doc thu con dang NOI VE bieu nhap hien tai khong.
 *
 * Tach khoi `commitableTollRequest` de man hinh noi duoc mot cau cu the (*"ban da sua… hay doc thu
 * lai"*) thay vi chi khoa mot cai nut roi im lang.
 */
export const tollPreviewStale = (
  binding: TollImportPreviewBinding | null,
  draft: TollImportDraft,
): boolean => binding !== null && binding.fingerprint !== tollImportFingerprint(draft);
