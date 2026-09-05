/**
 * THAM QUYEN CUA MOT TIN GUI RA — hinh dang du lieu, dung chung API + console.
 *
 * ---------------------------------------------------------------------------------------------
 * BAT BIEN (CLAUDE.md quyet dinh #5, mo rong): LLM duoc PHAN LOAI, TRICH XUAT, TOM TAT, SOAN va
 * DE XUAT. LLM KHONG phai tham quyen cho tien, VAT/COD/cuoc, dieu khoan cong no/thanh toan, quyen
 * huong khuyen mai, phe duyet, hay bat ky cau noi nao ham y mot trang thai nghiep vu da xay ra.
 *
 * Truoc ban nay, co SENDABLE cua mot ban tu van (`ProductAdviceResult.ready`) duoc suy ra tu
 * `!reply.handoff` — tuc tu CHINH LOI TU KHAI CUA LLM. Mot luot `intent=khac`, `priced=null`,
 * `sales=skipped`, `policy_finance=skipped` van co the ra `ready=true` trong khi ban nhap chua
 * don gia, tong tien, chinh sach cong no va cau "da ghi nhan don". Thu duy nhat chan lai la
 * heuristic do tin cay cua vai Giam sat — mot bo loc, khong phai mot ranh gioi tham quyen.
 *
 * ---------------------------------------------------------------------------------------------
 * KIEU NAY LA HOP DONG, KHONG PHAI MOT BO LOC VAN BAN.
 *
 * Grant chi den tu NGUON TAT DINH (rules engine gia, bang gia hien hanh, cap dai ly da map,
 * trang thai don da ben vung). Khong mot duong nao cho phep LLM tu cap tham quyen cho chinh no.
 * Viec doc van ban de nhan ra BE MAT khang dinh la bang chung fail-closed: no chi lam GIAM kha
 * nang gui, khong bao gio cap phep.
 */

/**
 * BA LOP KHANG DINH CO HE QUA. Dong lai co y — them mot lop la mot quyet dinh kien truc, khong
 * phai mot lan them chuoi.
 */
export const OUTBOUND_CLAIM_CLASSES = ['financial', 'policy', 'order_commitment'] as const;
export type OutboundClaimClass = (typeof OUTBOUND_CLAIM_CLASSES)[number];

export const OUTBOUND_CLAIM_CLASS_LABELS: Record<OutboundClaimClass, string> = {
  financial: 'Tiền (đơn giá, thành tiền, tổng đơn, VAT, COD, cước, khuyến mãi quy ra tiền)',
  policy: 'Chính sách (công nợ/thanh toán, VAT/COD/vận chuyển, quà tặng, phê duyệt)',
  order_commitment: 'Cam kết đơn (đã ghi nhận/chốt/tạo đơn)',
};

/**
 * NGUON CAP THAM QUYEN — dong lai, va MOI muc deu la mot bo phan TAT DINH.
 *
 * Khong co muc nao ten `llm`, `advisor` hay `model`. Do la ca dinh nghia cua tep nay: neu mot
 * ngay nao do can them mot nguon, no phai tu chung minh duoc tinh tat dinh truoc khi co ten o day.
 */
export const OUTBOUND_AUTHORITY_SOURCES = [
  /** `priceOrder()` — rules engine tinh don. */
  'rules.pricing',
  /** Bang gia hien hanh tra qua rules (bao gia, khong phai don). */
  'rules.quote',
  /** Cap dai ly da map -> chinh sach mac dinh cua ho. */
  'rules.policy',
  /** Trang thai don DA BEN VUNG trong kho nghiep vu. */
  'order.state',
] as const;
export type OutboundAuthoritySource = (typeof OUTBOUND_AUTHORITY_SOURCES)[number];

/**
 * MUC CAM KET DON — thang bac, khong phai mot cai gat dau duy nhat.
 *
 * REVIEW DOC LAP 04/09/2026 (B3) chi ra: khi moi cau "da ghi nhan / da chot / da gui" cung quy ve
 * MOT the, thi mot don moi o `needs_edit` van cap phep cho cau "da chot don" — tuc uy quyen mot
 * trang thai chua xay ra. Ba muc duoi day tang dan, va grant la CONG DON: `approved` cap ca
 * `recorded` lan `confirmed`, nhung khong cap `fulfilled`.
 */
export const OUTBOUND_COMMITMENT_LEVELS = ['recorded', 'confirmed', 'fulfilled'] as const;
export type OutboundCommitmentLevel = (typeof OUTBOUND_COMMITMENT_LEVELS)[number];

export const OUTBOUND_COMMITMENT_LEVEL_LABELS: Record<OutboundCommitmentLevel, string> = {
  recorded: 'Đã ghi nhận đơn (chưa duyệt)',
  confirmed: 'Đã chốt/duyệt đơn',
  fulfilled: 'Đã gửi xác nhận / đã đồng bộ',
};

/**
 * MOT LAN CAP THAM QUYEN.
 *
 * `authorized` la tap gia tri DUOC PHEP noi ra, da chuan hoa. TUNG LOP CO MOT TU VUNG RIENG, va
 * chung khong duoc phep tron:
 *   · `financial`        -> GIA TRI VND NGUYEN dang chuoi thap phan, vd `"1150000"`. KHONG phai
 *                           "cac cach viet" cua no: mot cach viet ("1.150k", "1,15tr") duoc quy
 *                           ve dung mot gia tri roi moi so khop. Truoc ban nay o day tung chua ca
 *                           dang rut gon `"1150"`, va the la tham quyen cho 1.150.000d lam cho
 *                           "1150d" lot — review doc lap goi ten do la B2.
 *   · `policy`           -> ma CHINH XAC TUNG LOAI: `payment_policy:ky_gui`,
 *                           `payment_policy:cong_no_45`, `terms_days:45`, `vat`, `cod`, ...
 *                           Khong con mot ma chung `payment_terms` phu cho moi loai.
 *   · `order_commitment` -> `order:<muc>` theo `OUTBOUND_COMMITMENT_LEVELS`.
 *
 * Mot grant KHONG BAO GIO rong: cap mot lop ma khong cap gia tri nao la mot cai gat dau trong,
 * va no se lam cong kiem tro thanh mot phep so sanh voi tap rong — tuc luon dat.
 */
export interface OutboundAuthorityGrant {
  readonly claim: OutboundClaimClass;
  readonly source: OutboundAuthoritySource;
  readonly authorized: readonly string[];
}

/** Toan bo tham quyen ma MOT LUOT da thu thap duoc tu cac nguon tat dinh. */
export interface OutboundAuthority {
  readonly grants: readonly OutboundAuthorityGrant[];
}

/**
 * NGUON GOC cua van ban ung vien.
 *
 * `deterministic` = van ban do chinh tang tat dinh dung (van ban xac nhan don, dong bao gia rules,
 * nhan chinh sach cua cap dai ly). Gia tri trong do CHINH LA ket qua co tham quyen, nen no khong
 * phai di qua phep kiem chua — kiem no la kiem chinh minh.
 *
 * `llm_draft` = van xuoi do model viet. Khong bao gio co tham quyen tu than.
 */
export const OUTBOUND_PROVENANCES = ['deterministic', 'llm_draft'] as const;
export type OutboundProvenance = (typeof OUTBOUND_PROVENANCES)[number];

/** Ly do MOT quyet dinh tham quyen — co kieu, de loc va de khang dinh trong test. */
export const OUTBOUND_AUTHORITY_REASONS = [
  /** Van ban do tang tat dinh dung — gia tri chinh la ket qua co tham quyen. */
  'DETERMINISTIC_AUTHORITY',
  /**
   * BAN SOAN KHONG DUNG MOT KHOI NGHIEP VU NAO — tu van/FAQ thuong.
   *
   * DOI TEN tu `NO_CONSEQUENTIAL_CLAIM` o #189, va viec doi ten la MOT NUA cua ban sua. Ma cu noi
   * "bo trich khong tim thay khang dinh nao", tuc mot ket luan rut ra tu mot phep DOC VAN BAN — va
   * do chinh la duong fail-open: mot cach dien dat ngoai tam bo trich cung ra ma nay va cung duoc
   * gui. Ma moi noi mot dieu KHAC HAN, va no la mot su that ve CAU TRUC chu khong phai mot suy
   * doan ve ngon ngu: ban soan nay render ra DUNG KHONG khoi nghiep vu nao. Khong co khoi thi
   * khong co con so/chinh sach/cam ket duoc uy quyen nao trong tin, bat ke van ban viet gi.
   */
  'NARRATIVE_ONLY_COMPOSITION',
  /** Moi khang dinh he qua deu nam trong tham quyen da cap. */
  'AUTHORITY_SATISFIED',
  /** Co khang dinh tien nhung LUOT NAY khong co ket qua dinh gia tat dinh nao. */
  'FINANCIAL_AUTHORITY_MISSING',
  /** Co tham quyen tien, nhung con so viet ra KHONG nam trong tap duoc uy quyen. */
  'FINANCIAL_VALUE_NOT_AUTHORIZED',
  /** Co khang dinh chinh sach nhung khong co ket qua chinh sach co tham quyen. */
  'POLICY_AUTHORITY_MISSING',
  /** Co tham quyen chinh sach, nhung loai chinh sach viet ra khong nam trong tap duoc uy quyen. */
  'POLICY_STATEMENT_NOT_AUTHORIZED',
  /** Cau noi ham y don da duoc ghi nhan/chot, nhung khong co trang thai don nao cho phep noi vay. */
  'ORDER_COMMITMENT_NOT_AUTHORIZED',
  /**
   * Co tham quyen cam ket don, nhung ban nhap noi o MUC CAO HON trang thai that.
   *
   * Tach khoi ma tren vi hai su co khac han nhau: ma tren = "khong co don nao"; ma nay = "co don,
   * nhung no moi duoc ghi nhan chu chua duoc chot". Gop lai thi mot don `needs_edit` bi noi thanh
   * "da chot don" se hien ra y het mot luot khong co don — va nguoi truc se di tim sai cho.
   */
  'ORDER_COMMITMENT_LEVEL_NOT_AUTHORIZED',
  /**
   * KHONG CO QUYET DINH THAM QUYEN NAO di kem noi dung nay.
   *
   * Ma quan trong nhat trong bo: no la thu bien "quen quyet dinh" thanh "khong gui duoc", thay vi
   * thanh "gui thoai mai". Ban ghi cu (truoc ban nay) va moi duong soan moi quen goi cong deu roi
   * vao day.
   */
  'AUTHORITY_DECISION_ABSENT',
  /**
   * CO phan quyet, nhung no duoc cap cho MOT DOAN VAN KHAC.
   *
   * Phan quyet duoc ghim vao trace luc soan; van ban thi nam o `trace.outbound.text` va co the bi
   * sua sau do (Sale sua tay, mot buoc hau xu ly, mot ban ghi duoc dung bang tay). Neu phan quyet
   * khong gan voi CHINH doan van no da xet thi "soan mot cau vo hai -> duoc duyet -> doi noi
   * dung -> bam gui" la mot duong di vong hoan chinh. Dau van ban khoa dieu do lai.
   */
  'AUTHORITY_PAYLOAD_MISMATCH',
  /**
   * KHONG CO BAN SOAN CO KIEU nao di kem noi dung nay (Issue #189).
   *
   * Khac `AUTHORITY_DECISION_ABSENT` mot bac: ma kia noi "chua ai XET"; ma nay noi "chua ai
   * DUNG". Mot ban ghi co the mang mot phan quyet cu (soan truoc #189, hoac mot duong soan moi
   * chi goi cong tham quyen ma khong di qua bo soan) — luc do van ban van la van xuoi tu do cua
   * model, va do dung la thu #189 cam. Fail closed.
   */
  'COMPOSITION_ABSENT',
  /**
   * CO ban soan, nhung no khong con gi de gui.
   *
   * Xay ra khi moi khoi duoc xin deu bi bo (thieu du kien) VA loi nhan bi hop dong neo nguon tu
   * choi. Dung la truong hop muc 5 hop dong doi: "omit it and produce an explicit safe handoff",
   * chu khong phai nho model viet bu vao cho trong.
   */
  'COMPOSITION_EMPTY',
  /**
   * PHONG THU CHIEU SAU (muc 7): van ban cuoi mang mot vat mang khong nam trong grant VA khong
   * truy nguyen duoc ve nguon he thong cua luot.
   *
   * Bo trich vat mang cua PR #187 giu nguyen o day, nhung DOI VAI: no chi con lam GIAM kha nang
   * gui. Mot lan bo sot cua no khong cap phep cho gi ca, vi duong cho phep nay gio la cau truc
   * (co khoi render duoc hay khong), khong phai "khong trich duoc gi".
   */
  'NARRATIVE_CARRIER_NOT_GROUNDED',
  /**
   * PHONG THU CHIEU SAU (muc 7), lop thu hai: van ban cuoi chua TU NGU ma khong nguon he thong
   * nao cua luot noi, va khong khoi da render nao viet ra.
   *
   * Khac `NARRATIVE_CARRIER_NOT_GROUNDED` o cho no khong can NHAN RA mot vat mang nao: no chi hoi
   * "tung chu trong doan van sap gui den tu dau". Do la thu bat duoc mot doan van xuoi bi ghep
   * them vao `text` SAU khi ban soan da xet — chang soan chi nhin `plan.narrative`, con day nhin
   * chinh chuoi sap ra kenh.
   */
  'COMPOSITION_TEXT_NOT_SOURCE_BACKED',
  /**
   * PHONG THU CHIEU SAU (muc 7), lop thu ba — o muc MENH DE thay vi muc TU NGU (Issue #200).
   *
   * `COMPOSITION_TEXT_NOT_SOURCE_BACKED` hoi "tung chu den tu dau", nen no van cho qua mot doan
   * van ghep lai chu cua nguon thanh mot y khac. Ma nay hoi chat hon: tung menh de cua van ban
   * cuoi phai la mot dong khoi da render, hoac trung TRON VEN mot menh de nguon da duoc ghim
   * (`x:` trong `OutboundComposition.grounded`).
   */
  'COMPOSITION_TEXT_NOT_SOURCE_BOUND',
] as const;
export type OutboundAuthorityReason = (typeof OUTBOUND_AUTHORITY_REASONS)[number];

/** Ly do cho phep gui — tach ra de union verdict khong the mang nham ma tu choi. */
export type OutboundAuthorityAllowReason =
  'DETERMINISTIC_AUTHORITY' | 'NARRATIVE_ONLY_COMPOSITION' | 'AUTHORITY_SATISFIED';

/** Ly do tu choi gui. */
export type OutboundAuthorityDenyReason = Exclude<
  OutboundAuthorityReason,
  OutboundAuthorityAllowReason
>;

/**
 * KET QUA mot lan xet tham quyen — union tuong minh, khong phai mot ban ghi kem mot co.
 *
 * Ben goi muon biet "thieu gi" PHAI thu `sendable === false` truoc. Trinh bien dich thi hanh dieu
 * do, khong phai mot dong chu thich.
 */
export type OutboundAuthorityVerdict =
  | {
      readonly sendable: true;
      readonly reason: OutboundAuthorityAllowReason;
      /** Lop khang dinh he qua da duoc uy quyen trong van ban nay (co the rong). */
      readonly claims: readonly OutboundClaimClass[];
      /** Dau cua DUNG doan van da duoc xet — xem `fingerprint` ben duoi. */
      readonly fingerprint?: string;
    }
  | {
      readonly sendable: false;
      readonly reason: OutboundAuthorityDenyReason;
      /** Lop bi tu choi — de Sale/nguoi truc biet phai bo sung tham quyen nao. */
      readonly missing: readonly OutboundClaimClass[];
      readonly fingerprint?: string;
    };

export const OUTBOUND_AUTHORITY_REASON_LABELS: Record<OutboundAuthorityReason, string> = {
  DETERMINISTIC_AUTHORITY: 'Văn bản do tầng tất định dựng',
  NARRATIVE_ONLY_COMPOSITION: 'Bản soạn không dựng khối nghiệp vụ nào',
  AUTHORITY_SATISFIED: 'Mọi khẳng định hệ quả đều có thẩm quyền',
  FINANCIAL_AUTHORITY_MISSING: 'Thiếu thẩm quyền tiền — lượt này không có kết quả định giá',
  FINANCIAL_VALUE_NOT_AUTHORIZED: 'Số tiền viết ra không nằm trong kết quả tất định',
  POLICY_AUTHORITY_MISSING: 'Thiếu thẩm quyền chính sách',
  POLICY_STATEMENT_NOT_AUTHORIZED: 'Loại chính sách viết ra chưa được uỷ quyền',
  ORDER_COMMITMENT_NOT_AUTHORIZED: 'Chưa có trạng thái đơn cho phép nói đã ghi nhận/chốt',
  ORDER_COMMITMENT_LEVEL_NOT_AUTHORIZED: 'Bản nháp nói ở mức cao hơn trạng thái thật của đơn',
  AUTHORITY_DECISION_ABSENT: 'Nội dung này chưa qua cổng thẩm quyền outbound',
  AUTHORITY_PAYLOAD_MISMATCH: 'Phán quyết được cấp cho một đoạn văn khác với đoạn sắp gửi',
  COMPOSITION_ABSENT: 'Nội dung này chưa qua bộ soạn có kiểu',
  COMPOSITION_EMPTY: 'Bộ soạn không dựng được khối nào và lời nhắn bị từ chối',
  NARRATIVE_CARRIER_NOT_GROUNDED: 'Văn bản cuối mang khẳng định không truy nguyên được về nguồn',
  COMPOSITION_TEXT_NOT_SOURCE_BACKED:
    'Văn bản cuối chứa từ ngữ không nguồn hệ thống nào của lượt này nói',
  COMPOSITION_TEXT_NOT_SOURCE_BOUND:
    'Văn bản cuối chứa mệnh đề không khớp trọn vẹn nguồn nào của lượt này',
};
