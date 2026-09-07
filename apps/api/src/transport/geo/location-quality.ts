/**
 * CHAT LUONG cua mot ban dinh vi — phan hang de NGUOI doc, khong phai de may chan.
 *
 * `Location.getAccuracy()` tren Android la ban kinh do tin cay 68% tinh bang met. Con so nay
 * KHONG phai mot dam bao: no la uoc luong cua chinh he thong dinh vi ve chinh no, va mot thiet bi
 * bi can thiep hoan toan co the bao 3 m cho mot toa do bia dat. Nen phan hang o day chi lam mot
 * viec: noi cho nguoi xem lai biet phep do nay CO DU TOT de tra loi cau hoi dang duoc hoi hay
 * khong. Voi mot hang rao ban kinh 200 m, sai so 8 m tra loi duoc; sai so 400 m thi khong.
 *
 * `UNKNOWN` la mot hang RIENG chu khong gop vao `POOR`, vi hai thu do dan toi hai hanh dong khac
 * nhau: `POOR` la "tin hieu kem, doi hoac di ra cho thoang"; `UNKNOWN` la "ung dung khong gui
 * truong nay" — tuc mot cau hoi ve PHIEN BAN hoac ve TINH TOAN VEN cua ung dung.
 */

export type AccuracyGrade = 'FINE' | 'COARSE' | 'POOR' | 'UNKNOWN';

export interface AccuracyPolicy {
  /** Toi da de xep hang `FINE`. Mac dinh 25 m — dat duoc bang GNSS ngoai troi. */
  readonly fineMaxMetres: number;
  /** Toi da de xep hang `COARSE`. Mac dinh 100 m — con dung duoc cho hang rao quy mo kho bai. */
  readonly coarseMaxMetres: number;
}

export const DEFAULT_ACCURACY_POLICY: AccuracyPolicy = {
  fineMaxMetres: 25,
  coarseMaxMetres: 100,
};

export function gradeAccuracy(
  accuracyMetres: number | null | undefined,
  policy: AccuracyPolicy = DEFAULT_ACCURACY_POLICY,
): AccuracyGrade {
  if (accuracyMetres === null || accuracyMetres === undefined || !Number.isFinite(accuracyMetres)) {
    return 'UNKNOWN';
  }
  // Sai so am khong co nghia vat ly. Xep vao `UNKNOWN` chu khong `POOR`: no noi rang thiet bi
  // dang bao mot thu vo nghia, va do la cau hoi ve ung dung chu khong ve song ve tinh.
  if (accuracyMetres < 0) {
    return 'UNKNOWN';
  }
  if (accuracyMetres <= policy.fineMaxMetres) {
    return 'FINE';
  }
  if (accuracyMetres <= policy.coarseMaxMetres) {
    return 'COARSE';
  }
  return 'POOR';
}

/**
 * Mot ban dinh vi co du tot de DUNG LAM BANG CHUNG khong.
 *
 * CO Y de rieng khoi `gradeAccuracy`: phan hang la mot su that ve phep do, con "du tot chua" la
 * mot CHINH SACH. Khi mot khach muon bat chat hon (chi nhan `FINE` cho bang chung giao hang), ho
 * doi cho nay, khong doi thang do.
 */
export function isEvidenceGradeAccuracy(grade: AccuracyGrade): boolean {
  return grade === 'FINE' || grade === 'COARSE';
}
