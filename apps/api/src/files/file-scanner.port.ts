import type { FileScanState } from './file.types.js';

/**
 * CONG QUET NOI DUNG — `#287` P5.
 *
 * ============================================================================================
 * MOT CONG CO THAT, VOI MOT HIEN THUC TAT
 * ============================================================================================
 *
 * `#287` P5: *"Expose a scanner port + states even if deployment uses scanner disabled"*, va
 * *"No mandatory SaaS dependency"*. Hai cau do di voi nhau: cong ton tai de ngu nghia
 * `QUARANTINED` co that trong vong doi ngay hom nay, con viec cam mot may quet vao la mot quyet
 * dinh trien khai cua tung ban.
 *
 * Neu de den luc co may quet moi dat cong, thi `QUARANTINED` hom nay se chi la mot gia tri enum
 * khong duong nao dat toi — tuc mot loi hua, khong mot bat bien.
 *
 * ============================================================================================
 * `REQUIRED` LA MOT CONG, KHONG MOT LOI KHUYEN
 * ============================================================================================
 *
 * `#287` P5: khi quet duoc dat o muc BAT BUOC thi *"unscanned file cannot become normal ACTIVE
 * evidence"* va *"infected/failed scan becomes QUARANTINED/fail-closed"*.
 *
 * Nen `FileScannerMode` la mot QUYET DINH doc duoc, khong mot co an trong hien thuc: mot ban dat
 * `REQUIRED` ma cam vao `DisabledFileScanner` se KHONG kich hoat duoc tep nao ca — va do la hanh vi
 * dung. Mot he thong doi phai quet nhung khong co may quet thi khong duoc phep tu cho qua.
 */

/** Quet la BAT BUOC hay khong. `OFF` = mac dinh, `REQUIRED` = fail-closed. */
export const FILE_SCANNER_MODES = ['OFF', 'REQUIRED'] as const;
export type FileScannerMode = (typeof FILE_SCANNER_MODES)[number];

/**
 * KET QUA mot lan quet.
 *
 * `FAILED` tach khoi `INFECTED` vi hai dieu do doi hai viec khac nhau o phia nguoi van hanh: mot
 * ben la mot tep ban, mot ben la mot may quet hong. Gop chung se lam mot may quet chet bao thanh
 * mot dot lay nhiem.
 */
export type FileScanVerdict = Extract<FileScanState, 'CLEAN' | 'INFECTED' | 'FAILED'>;

export abstract class FileScannerPort {
  abstract readonly mode: FileScannerMode;
  /**
   * Quet mot tep. `null` = cong nay khong quet gi ca (may quet dang tat).
   *
   * `null` KHONG phai `CLEAN`. Mot tep chua ai nhin va mot tep da duoc ket luan sach la hai su that
   * khac han, va `FileService` xu ly chung khac han khi `mode = REQUIRED`.
   */
  abstract scan(bytes: Buffer, declaredMimeType: string): Promise<FileScanVerdict | null>;
}

/**
 * MAY QUET TAT — mac dinh cua moi ban chua cau hinh gi.
 *
 * Tra `null` cho moi tep, va `mode = OFF` nen `FileService` cho tep di tiep sang `ACTIVE`. Doi
 * `mode` sang `REQUIRED` ma van dung lop nay se KHOA moi lan kich hoat: xem khoi chu thich tren.
 */
export class DisabledFileScanner extends FileScannerPort {
  readonly mode: FileScannerMode = 'OFF';

  async scan(): Promise<FileScanVerdict | null> {
    return null;
  }
}
