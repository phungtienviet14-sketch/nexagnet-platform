/**
 * NEN TANG TEP — danh tinh, vong doi, lien ket nghiep vu. `#287` P1/P2/P3.
 *
 * ============================================================================================
 * MOT MA DUC, va do la ca hop dong
 * ============================================================================================
 *
 * `#287` P1 doi mot ma ON DINH *"independent of bucket/path/object key"*. Nen `id` la mot cuid do
 * CSDL sinh, va `storageKey` — cho byte that su nam — la mot chi tiet hien thuc RIENG TU:
 *
 *   · no khong co mat trong `FileDescriptor` (ban cong khai), va co mot bai test doc chinh ma
 *     nguon de giu dieu do;
 *   · khong mot tuyen HTTP nao nhan no tu than yeu cau;
 *   · khong mot dong log/loi nao mang no ra ngoai.
 *
 * Vi sao phai gat den the: mot dinh vi tho lot ra ngoai la mot duong di VONG QUA vong doi. Ai cam
 * duoc `media/2026/09/<...>.jpg` thi doc duoc byte do mai mai, ke ca sau khi tep da bi rut, bi cach
 * ly, hay het han luu tru — va khong mot cong nghiep vu nao chan lai duoc.
 *
 * ============================================================================================
 * `knowing File ID != permission to read File` — `#287` P2
 * ============================================================================================
 *
 * Mot ma tep KHONG phai mot quyen. Moi duong doc/rut deu phai di qua `FileAuthorizationService`,
 * va cong do hoi lai chinh MIEN so huu doi tuong nghiep vu ma tep dang gan vao. Mot tep khong gan
 * vao dau ca thi chi nguoi tao doc duoc no.
 *
 * ============================================================================================
 * PHAM VI KHACH den tu SILO DANG CHAY, khong tu than yeu cau
 * ============================================================================================
 *
 * `#287` P1: *"Do not introduce caller-supplied tenant IDs or shared-DB multi-tenancy as a side
 * effect."* Nen KHONG co truong `tenantId` o day. Mot ban chay phuc vu mot khach, va Postgres cua
 * ban do la ranh gioi — dung ranh gioi ma ca nen tang nay da dung tu dau (Quyet dinh kien truc #6).
 */

/**
 * VONG DOI cua mot tep — `#287` P3.
 *
 *     STAGED -> ACTIVE -> WITHDRAWN / QUARANTINED -> PURGED
 *
 * `STAGED` co mat chu khong phai thua: byte da nam trong kho nhung tep CHUA phai bang chung cua ai.
 * Giua hai buoc do la cho dat phep kiem noi dung va (khi bat) phep quet virus — `#287` P5 doi rang
 * *"unscanned file cannot become normal ACTIVE evidence"*, va dieu do chi phat bieu duoc neu co mot
 * trang thai TRUOC `ACTIVE`.
 *
 * `PURGED` la trang thai cua BYTE, khong phai cua dong metadata: hang van o lai mang gio va ten
 * nguoi rut. `#287` P3 bat bien 1 — *"metadata/history is not hard-deleted before business
 * withdrawal"* — va o day thi khong hard-delete ke ca SAU do.
 */
export const FILE_STATES = ['STAGED', 'ACTIVE', 'WITHDRAWN', 'QUARANTINED', 'PURGED'] as const;
export type FileState = (typeof FILE_STATES)[number];

/**
 * TRANG THAI QUET — `#287` P5.
 *
 * `NOT_SCANNED` va `FAILED` la HAI dieu khac han nhau, va gop chung lai la mot lo hong: khi cau
 * hinh dat quet o muc BAT BUOC thi `NOT_SCANNED` nghia la "chua ai nhin", con `FAILED` nghia la
 * "da nhin va khong ket luan duoc". Ca hai deu chan `ACTIVE`, nhung nguoi van hanh phai phan biet
 * duoc de biet minh dang thieu mot lan quet hay dang co mot may quet hong.
 */
export const FILE_SCAN_STATES = ['NOT_SCANNED', 'PENDING', 'CLEAN', 'INFECTED', 'FAILED'] as const;
export type FileScanState = (typeof FILE_SCAN_STATES)[number];

/**
 * NHA CUNG CAP LUU TRU — `#287` P4.
 *
 * `#223` (ban sua doi duoc `#287` nhac lai o dau hop dong): *"GCS is NOT the architectural
 * default. It is one provider."* Nen danh sach nay xep theo dung thu tu do, va `NONE` dung dau —
 * mac dinh cua demo/CI la KHONG luu gi ca, giong `MEDIA_STORE=none` cua nen tang anh.
 *
 * Luu NHA CUNG CAP vao tung hang chu khong doc tu bien moi truong luc chay: mot ban da doi
 * `MEDIA_STORE` van phai doc lai duoc nhung tep ghi truoc do, va phai noi duoc chung nam o dau.
 */
export const FILE_STORAGE_PROVIDERS = ['NONE', 'LOCAL', 'S3', 'GCS'] as const;
export type FileStorageProvider = (typeof FILE_STORAGE_PROVIDERS)[number];

/** Vong doi cua mot LIEN KET nghiep vu. Mot lien ket go ra van o lai — xem `FileLink`. */
export const FILE_LINK_STATES = ['ACTIVE', 'WITHDRAWN'] as const;
export type FileLinkState = (typeof FILE_LINK_STATES)[number];

/**
 * MUC DICH cua mot tep — `#287` P5 *"bounded max size by purpose/category; MIME allow-list by
 * purpose"*.
 *
 * BA gia tri, va tat ca deu la DANH MUC TEP chu khong ten mien. `OPERATIONAL_DOCUMENT` la "mot to
 * giay van hanh duoc chup lai" — van tai co, kho co, xay dung co. Dat `TRANSPORT_DELIVERY_RECEIPT`
 * vao day se keo taxonomy cua Lane O vao nen tang, tuc dung dieu `#287` cam o P11
 * (*"business taxonomy remains Lane O"*) va Quyet dinh kien truc #6 cam o muc rong hon.
 *
 * `GENERIC_ATTACHMENT` la duong thoat de danh sach nay khong dai them mot gia tri cho moi mien
 * moi — cung ly le voi `OTHER` cua Lane O.
 */
export const FILE_PURPOSES = [
  'OPERATIONAL_DOCUMENT',
  'FINANCIAL_EVIDENCE',
  'GENERIC_ATTACHMENT',
] as const;
export type FilePurpose = (typeof FILE_PURPOSES)[number];

/** HANH DONG mot nguoi goi muon lam voi mot tep. Cong quyen tra loi TUNG hanh dong mot. */
export const FILE_ACTIONS = ['READ', 'ATTACH', 'WITHDRAW'] as const;
export type FileAction = (typeof FILE_ACTIONS)[number];

/**
 * MOT TEP, nhin tu BEN TRONG nen tang.
 *
 * Kieu nay KHONG duoc di ra ngoai bien HTTP: no mang `storageKey`. Ban cong khai la
 * `FileDescriptor` (xem `file.dto.ts`), va `file-public-surface.spec.ts` doc chinh ma nguon de
 * chac hai kieu do khong bao gio hoa lam mot.
 */
export interface FileRecord {
  readonly id: string;
  readonly purpose: FilePurpose;
  /** Ten nguoi dung gui len — du lieu BEN NGOAI, khong bao gio dung de dung duong dan. */
  readonly originalFilename: string;
  /** Ten da chuan hoa de hien thi va de tai ve. Xem `safeFilename()`. */
  readonly safeFilename: string;
  readonly declaredMimeType: string;
  /** Suy tu BYTE DAU TEP khi nhan dang duoc. `null` = khong co khuon nao khop. */
  readonly detectedMimeType: string | null;
  readonly byteSize: number;
  readonly sha256: string;
  readonly storageProvider: FileStorageProvider;
  /** RIENG TU. Khong ra khoi tang nay. Xem khoi chu thich dau tep. */
  readonly storageKey: string;
  readonly createdBy: string;
  readonly state: FileState;
  readonly scanState: FileScanState;
  readonly scannedAt: Date | null;
  /** Khong duoc don byte truoc moc nay — `#287` P8. */
  readonly retainUntil: Date | null;
  /** Giu theo lenh phap ly: chan don byte VO THOI HAN. */
  readonly legalHold: boolean;
  /**
   * SU TICH lan ghi nhan, mo va khong dinh kieu theo mien — `#287` P1 *"extensible
   * capture/provenance metadata without hard-coding Transport/GPS policy"*.
   *
   * Nen tang KHONG doc truong nao trong day va khong quyet dinh gi tu no. Dat mot khoa `gps` vao
   * day khong lam nen tang biet gi ve GPS; mien nao ghi thi mien do doc.
   */
  readonly captureMetadata: Readonly<Record<string, unknown>> | null;
  readonly createdAt: Date;
  readonly activatedAt: Date | null;
  readonly withdrawnAt: Date | null;
  readonly withdrawnBy: string | null;
  readonly quarantinedAt: Date | null;
  readonly purgeRequestedAt: Date | null;
  readonly purgedAt: Date | null;
  readonly purgeAttempts: number;
  readonly purgeFailedAt: Date | null;
  /** Ma loi CO KIEU cua lan don byte hong — de nguoi van hanh loc duoc. Khong phai cau van. */
  readonly purgeFailureCode: string | null;
}

/**
 * MOT LIEN KET NGHIEP VU — `#287` P2.
 *
 * Tach danh tinh VAT LY cua tep khoi Y NGHIA nghiep vu cua no. Cung mot tam anh co the la "bien
 * nhan giao hang cua chang X" hom nay va se duoc mot mien khac tro toi ngay mai; hai su that do
 * khong duoc nhet chung vao mot hang.
 *
 * `businessOwnerType` la mot CHUOI chu khong mot enum, va do la co y: nen tang nay khong duoc biet
 * ten mot mien nao. Mien nao gan thi mien do khai ten cua chinh no, va `FileAuthorizationService`
 * tra loi bang dung cai ten do. Mot ten khong ai dang ky = TU CHOI (`#287` P6, fail closed).
 */
export interface FileLink {
  readonly id: string;
  readonly fileId: string;
  readonly businessOwnerType: string;
  readonly businessOwnerId: string;
  /** Y nghia cua lan gan nay trong mien do, vd `DELIVERY_RECEIPT`. Nen tang khong doc no. */
  readonly purpose: string;
  readonly state: FileLinkState;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly withdrawnBy: string | null;
  readonly withdrawnAt: Date | null;
}

/** Lenh dat mot tep vao kho. Byte + khai bao cua nguoi gui; chua phai bang chung cua ai. */
export interface StageFileCommand {
  readonly bytes: Buffer;
  readonly purpose: FilePurpose;
  readonly originalFilename: string;
  readonly declaredMimeType: string;
  readonly createdBy: string;
  readonly captureMetadata?: Readonly<Record<string, unknown>>;
}

/** Lenh gan mot tep vao mot doi tuong nghiep vu. */
export interface LinkFileCommand {
  readonly fileId: string;
  readonly businessOwnerType: string;
  readonly businessOwnerId: string;
  readonly purpose: string;
  readonly authUserId: string;
}
