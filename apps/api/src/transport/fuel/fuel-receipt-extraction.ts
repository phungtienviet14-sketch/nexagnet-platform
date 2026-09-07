import type { FuelDocumentRejectReason } from './fuel-document.types.js';
import type { ParsedInvoice } from './fuel-einvoice-parse.js';

/**
 * `FuelReceiptExtractionPort` — doc mot BUC ANH phieu do dau (Lane C / C3, Issue #236).
 *
 * ===========================================================================
 * VI SAO KHONG PHAI MOT `FuelInvoiceSource` THU HAI
 *
 * `FuelInvoiceSource.read()` la mot ham DONG BO, TAT DINH, khong ra khoi tien trinh: cung mot byte
 * luon cho ra cung mot ket qua. Tinh chat do CHIU LUC — khoi chu thich cua `fuel-document.service.ts`
 * dua vao no de noi rang "sua bo doc roi nhap lai se cho ra dung bo ung vien moi", va do la ly do
 * mot ung vien khong sua duoc.
 *
 * Mot lan doc anh KHONG co tinh chat do: no bat dong bo, di qua mang, va cung mot buc anh co the
 * cho hai ket qua o hai lan goi. Nhet no vao sau `FuelInvoiceSource` se pha tinh chat kia MA KHONG
 * MOT DONG NAO DOI MAU — kieu hong te nhat: mot bat bien chet trong im lang.
 *
 * Nen day la mot cong RIENG, tra ve mot kieu RIENG, va di vao mot phuong thuc RIENG cua service.
 *
 * ===========================================================================
 * CAI GI DUNG CHUNG, VA DO MOI LA PHAN QUAN TRONG
 *
 * Cong nay tra ve dung kieu `ParsedInvoice` ma duong XML tra ve. Nho vay TOAN BO phan sau —
 * nhan dang cay xang, chuan hoa ung vien, goi y bien so, muoi mot phat hien cua C4, man hinh ra
 * soat — chay tren duong anh MA KHONG MOT DONG NAO DUOC VIET LAI. Neu cong nay tra ve mot kieu
 * rieng, ta se co hai vu tru song song va hai bo phep kiem, roi mot ngay nao do chung lech nhau.
 *
 * Cai KHAC nhau duoc noi bang mot thu duy nhat: `confidence`.
 *
 * ===========================================================================
 * DO TIN CAY LA SO NGUYEN, THEO TUNG TRUONG
 *
 * Theo quy uoc so cua repo: khong so thuc o duong du lieu. Do tin cay la so nguyen tren thang
 * `CONFIDENCE_SCALE` (0..1000), khoa theo DUNG NHUNG KHOA ma `provenance` dung — nen mot nguoi doc
 * co the doi chieu tung o: `provenance['line.1.amount']` noi may DOC RA GI, `confidence[...]` noi
 * may TIN DEN DAU.
 *
 * KHONG co do tin cay cho duong XML, va do la co y. Mot truong XML doc duoc thi no CHINH LA thu
 * nguoi ban da ky; sai o do la NGUOI BAN ghi sai. Mot truong doc tu anh sai la TA doc sai. Hai loai
 * sai do doi hai phan ung khac nhau cua con nguoi, nen dat chung tren MOT thang do — bang cach cho
 * XML mot `confidence = 1000` — se moi nguoi ta gop chung lai, va do la dieu khong duoc phep.
 */

/** Thang do tin cay. So nguyen 0..1000; khong so thuc o duong du lieu. */
export const CONFIDENCE_SCALE = 1000;

/**
 * SAN cua mot truong duoc coi la doc duoc ma khong can nguoi nhin lai.
 *
 * 900/1000 khong phai mot con so thieng. No la mot NGUONG VAN HANH: dat thap hon thi nhung o mo di
 * thang vao so lieu doi soat; dat cao hon thi moi buc anh deu doi mot nguoi nhin. No song trong mot
 * hang so CO TEN de mot ngay khach muon chinh, cho phai chinh la MOT cho.
 */
export const FIELD_CONFIDENCE_FLOOR = 900;

/** Do tin cay theo tung khoa truong — CUNG bo khoa ma `EInvoiceProvenance` dung. */
export type ExtractionConfidence = Readonly<Record<string, number>>;

/**
 * MOT buc anh phieu do dau.
 *
 * `mediaType` la thu NGUOI GOI khai. Cong khong tin no: `sniffReceiptMediaType()` doc byte dau tep,
 * va mot khai bao lech bi tu choi. Mot tep `.jpg` thuc ra la HTML khong duoc di tiep den mot mo
 * hinh o xa.
 */
export interface FuelReceiptImage {
  readonly sourceRef: string;
  readonly mediaType: string;
  readonly content: Buffer;
}

/**
 * NAM ly do — va DUNG nam ly do — ma mot lan doc anh co the that bai.
 *
 * Kieu nay hep hon `FuelDocumentRejectReason` MOT CACH CO Y. Neu de nguyen ca ho, thi mot bo doc
 * anh se hop le khi tra ve `MALFORMED_XML`, va bang anh xa sang ly do quyet dinh se phai co mot
 * nhanh "khong bao gio xay ra" — dung cai nhanh se xay ra vao mot ngay nao do. Thu hep o day lam
 * cho trinh bien dich, chu khong phai mot bai test, la thu giu bat bien nay.
 */
export const RECEIPT_REJECT_REASONS = [
  'EMPTY',
  'TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'EXTRACTION_UNAVAILABLE',
  'EXTRACTION_MALFORMED_OUTPUT',
] as const satisfies readonly FuelDocumentRejectReason[];
export type ReceiptRejectReason = (typeof RECEIPT_REJECT_REASONS)[number];

export type FuelReceiptExtractionResult =
  | {
      readonly ok: true;
      readonly invoice: ParsedInvoice;
      readonly confidence: ExtractionConfidence;
      /** Mo hinh THAT da chay, de telemetry khoi phai doan (cung ly le voi `OrderParser.model`). */
      readonly model: string;
    }
  | { readonly ok: false; readonly reason: ReceiptRejectReason };

/**
 * CONG. Mot phuong thuc, bat dong bo, khong biet gi ve nghiep vu — y het `FuelInvoiceSource`.
 *
 * No KHONG tra ve `supplierId`, khong nhan ra cay xang, khong doi don vi. No tra ve nhung gi doc
 * duoc tren buc anh, kem muc tin. Viec noi voi danh muc cua khach la cua service.
 */
export abstract class FuelReceiptExtractionPort {
  abstract extract(image: FuelReceiptImage): Promise<FuelReceiptExtractionResult>;
}
