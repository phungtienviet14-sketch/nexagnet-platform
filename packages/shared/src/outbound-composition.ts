/**
 * SOAN TIN GUI RA THEO KHOI CO KIEU — hinh dang du lieu, dung chung API + console.
 *
 * ---------------------------------------------------------------------------------------------
 * VI SAO TEP NAY TON TAI (Issue #189).
 *
 * `outbound-authority.ts` tra loi cau "ban nhap nay co du tham quyen khong?" bang cach DOC VAN BAN:
 * tim vat mang tien / chinh sach / cam ket don roi doi chieu voi grant. Ban #187 lam bo trich do
 * rong hon nhieu, nhung nhanh cuoi cung van la:
 *
 *     khong trich duoc gi  =>  CHO GUI  (`NO_CONSEQUENTIAL_CLAIM`)
 *
 * Tuc: mot cach dien dat NGOAI tam bo trich van ra ngoai. Do khong phai mot lo hong cua bo trich —
 * do la dac tinh cua MOI bo trich huu han tren mot ngon ngu vo han. Khong the vá bang tu dien to hon.
 *
 * DAO CHIEU: van ban den tay khach THOI KHONG CON la payload cua model.
 *
 *     model  ->  KE HOACH co kieu (xin khoi nao, viet loi nhan)     <- KHONG mang tham quyen
 *     nguon tat dinh -> DU KIEN co kieu (gia, chinh sach, trang thai)
 *     BO SOAN tat dinh -> render TUNG KHOI tu du kien
 *
 * Model XIN mot khoi; no khong bao gio cap duoc GIA TRI, LOAI CHINH SACH hay MUC CAM KET cho khoi
 * do. Thieu du kien thi khoi BI BO (kem ly do co ma) — khong bao gio hoi model dien vao.
 *
 * ---------------------------------------------------------------------------------------------
 * BA TINH CHAT LA CHO DUA CUA CA THIET KE:
 *
 *  1. Khoi nghiep vu KHONG BAO GIO la ky tu cua model. `ComposedBlock.lines` do bo soan viet tu
 *     `TurnBusinessFacts`. Mot bo trich bo sot khong con bien mot khang dinh khong tham quyen
 *     thanh mot tin gui duoc, vi khong co duong nao render no ca.
 *  2. Thieu du kien -> BO KHOI, khong thay the. Xem `OutboundOmissionReason`.
 *  3. CHE DO SOAN do HE THONG quyet dinh tu tham quyen THUC SU thu duoc, khong phai tu nhan model
 *     tu dat (muc 3 hop dong: "a type tag chosen by the same model is not business authority").
 *     Model gan nhan `narrative` cho mot cau he qua -> luot do van la `narrative_only`, ma che do
 *     do render DUNG KHONG khoi nghiep vu nao.
 */
import type { OutboundAuthoritySource, OutboundClaimClass } from './outbound-authority.js';

/**
 * CAC LOAI KHOI NGHIEP VU ma mot ke hoach duoc phep XIN. Dong lai co y.
 *
 * `promotion` va `approval` nam trong danh sach du repo CHUA co nguon tat dinh nao cho chung
 * (muc 10 hop dong loai tru promotion engine). Do la co chu dich: model VAN xin duoc, va bo soan
 * VAN bo chung voi `NO_AUTHORITY_SOURCE`. Bo hai muc nay ra khoi kieu se lam mat dung cai bang
 * chung can co — rang mot khoi khong co nguon thi khong render ra gi.
 */
export const OUTBOUND_BLOCK_KINDS = [
  /** Don gia hien hanh theo cap nguoi hoi (bang gia -> `rules.quote`). */
  'price_quote',
  /** Don da tinh: don gia, thanh tien, tam tinh, cuoc, COD, VAT, tong (`priceOrder()`). */
  'order_pricing',
  /** Dieu khoan thanh toan/cong no cua dai ly da map. */
  'payment_policy',
  /** Cau CHINH SACH ve VAT / COD / cuoc van chuyen cua chinh don da tinh. */
  'vat_cod_shipping',
  /** Quyen huong khuyen mai/qua tang — CHUA co nguon tat dinh trong repo. */
  'promotion',
  /** Muc cam ket cua don da ben vung (da ghi nhan / da chot / da gui). */
  'order_commitment',
  /** Cau phe duyet/uy quyen — CHUA co nguon tat dinh trong repo. */
  'approval',
] as const;
export type OutboundBlockKind = (typeof OUTBOUND_BLOCK_KINDS)[number];

export const OUTBOUND_BLOCK_KIND_LABELS: Record<OutboundBlockKind, string> = {
  price_quote: 'Báo giá',
  order_pricing: 'Chi tiết tiền của đơn',
  payment_policy: 'Chính sách thanh toán/công nợ',
  vat_cod_shipping: 'VAT / COD / cước vận chuyển',
  promotion: 'Khuyến mãi / quà tặng',
  order_commitment: 'Trạng thái cam kết đơn',
  approval: 'Phê duyệt / uỷ quyền',
};

/** Y DINH cua luot, do model de xuat. Chi dinh huong cach viet — khong cap tham quyen gi. */
export const OUTBOUND_PLAN_KINDS = ['faq', 'product_advice', 'order_status', 'handoff'] as const;
export type OutboundPlanKind = (typeof OUTBOUND_PLAN_KINDS)[number];

/**
 * KE HOACH TRA LOI cua model — vat the KHONG MANG THAM QUYEN.
 *
 * Doc ky ba truong: khong truong nao chua mot GIA TRI nghiep vu. `requestedBlocks` la danh sach
 * LOAI khoi, khong phai noi dung khoi; `narrative` la loi nhan thuong, va no phai qua hop dong
 * neo nguon (`outbound-narrative.ts`) truoc khi duoc nhan.
 */
export interface OutboundPlan {
  readonly kind: OutboundPlanKind;
  readonly requestedBlocks: readonly OutboundBlockKind[];
  readonly narrative: string;
}

/** Ke hoach IT DAC QUYEN NHAT — dung khi model khong de xuat ke hoach nao. */
export function narrativeOnlyPlan(narrative: string): OutboundPlan {
  return { kind: 'faq', requestedBlocks: [], narrative };
}

/**
 * MOT KHANG DINH ma mot khoi da render thuc su mang.
 *
 * Tach ra khoi `ComposedBlock` vi mot khoi co the mang NHIEU lop: `order_pricing` vua noi tien
 * (`financial`) vua noi loai chinh sach cua don (`policy`). Gop lam mot truong `claim` se buoc
 * mot trong hai lop di ra ngoai vong doi chieu — dung kieu lo hong tep nay sinh ra de chan.
 */
export interface ComposedBlockClaim {
  readonly claim: OutboundClaimClass;
  readonly source: OutboundAuthoritySource;
  /** Gia tri/ma da chuan hoa ma khoi nay noi ra — doi chieu 1-1 voi `OutboundAuthorityGrant`. */
  readonly authorized: readonly string[];
}

/** MOT KHOI DA RENDER. `lines` do bo soan tat dinh viet, khong phai model. */
export interface ComposedBlock {
  readonly kind: OutboundBlockKind;
  readonly claims: readonly ComposedBlockClaim[];
  readonly lines: readonly string[];
}

/**
 * VI SAO MOT KHOI DUOC XIN LAI KHONG XUAT HIEN. Co ma, vi ba nguyen nhan nay doi ba hanh dong
 * khac han nhau tu nguoi truc.
 */
export const OUTBOUND_OMISSION_REASONS = [
  /** He thong CHUA CO nguon tat dinh nao cho loai khoi nay (khuyen mai, phe duyet). */
  'NO_AUTHORITY_SOURCE',
  /** Co nguon, nhung luot nay khong tra cuu duoc du kien nao. */
  'FACT_MISSING',
  /** Co du kien nhung thieu truong bat buoc de render (vd don khong bat VAT/COD/cuoc). */
  'FACT_INCOMPLETE',
  /** Co don, nhung trang thai cua no khong uy quyen bat ky muc cam ket nao (draft/rejected). */
  'COMMITMENT_LEVEL_UNAVAILABLE',
] as const;
export type OutboundOmissionReason = (typeof OUTBOUND_OMISSION_REASONS)[number];

export const OUTBOUND_OMISSION_REASON_LABELS: Record<OutboundOmissionReason, string> = {
  NO_AUTHORITY_SOURCE: 'Hệ thống chưa có nguồn tất định cho khối này',
  FACT_MISSING: 'Lượt này không tra cứu được dữ kiện cho khối',
  FACT_INCOMPLETE: 'Dữ kiện thiếu trường bắt buộc để dựng khối',
  COMMITMENT_LEVEL_UNAVAILABLE: 'Trạng thái đơn không uỷ quyền mức cam kết nào',
};

export interface OmittedBlock {
  readonly kind: OutboundBlockKind;
  readonly reason: OutboundOmissionReason;
}

/**
 * VI SAO MOT LOI NHAN BI TU CHOI. Hop dong neo nguon o `apps/api/src/outbound/outbound-narrative.ts`.
 *
 * G1/G2/G3 la ba dieu kien DOC LAP, nen chung co ba ma rieng: mot luot bi tu choi vi "khong co
 * tai lieu duyet nao" doi mot hanh dong khac han mot luot bi tu choi vi "co con so khong truy
 * nguyen duoc".
 */
export const NARRATIVE_REJECTIONS = [
  /** G1 — luot nay khong tra cuu duoc nguon he thong nao, nen khong co gi de ke. */
  'NO_SYSTEM_SOURCE',
  /*
   * G5 — LOI NHAN NOI MOT DIEU KHONG NGUON NAO CUA LUOT NOI.
   *
   * G1 chi hoi "co nguon nao khong", va review doc lap (05/09/2026) cho thay do la mot cong hong
   * mo: mot cau MO TA SAN PHAM khong lien quan van du de mo duong cho mot loi hua thanh toan bia
   * ("bên em cho mình khất tiền hàng tới khi bán xong") — cau do khong chu so nen G2 khong xet,
   * ngoai `POLICY_SURFACES` nen G3 khong xet, khong grant nen G4 khong xet.
   *
   * G5 doi hoi manh hon HAN: TUNG TU NGU NOI DUNG cua loi nhan phai co mat trong nguon he thong
   * cua chinh luot nay, hoac phai la mot tu chuc nang trong `CONVERSATIONAL_ENVELOPE`. Do la mot
   * danh sach CHO, nen mot cach dien dat MOI bi chan vi no moi — khong phai vi ai do kip liet ke.
   */
  'NARRATIVE_NOT_SOURCE_BACKED',
  /*
   * G6 — LOI NHAN GHEP LAI TU NGU CUA NGUON THANH MOT MENH DE KHAC (Issue #200).
   *
   * G5 dong cong TU VUNG, khong dong cong NGHIA. Review doc lap 05/09/2026 do duoc dieu do tren
   * chinh `main`: nguon noi "Khách hàng thanh toán ngay khi nhận hàng. Hàng bán xong không được
   * đổi trả.", model viet "Khách hàng thanh toán khi bán xong." — moi tu deu cua nguon, ky han
   * thanh toan thi doi han. Va vi `không/có/được/khi` deu nam trong vo hoi thoai, model con dao
   * nguoc duoc mot cau nguon ma khong can them mot chu nao.
   *
   * G6 doi hoi TUNG DOAN cua loi nhan, sau khi cat tu xung ho/le phep o hai dau, phai TRUNG TRON
   * VEN mot MENH DE cua nguon — va van ban phat ra la ky tu cua NGUON, khong phai cua model.
   * Xem `apps/api/src/outbound/outbound-proposition.ts`.
   */
  'NARRATIVE_NOT_SOURCE_BOUND',
  /*
   * G7 - LOI NHAN TRON PHAM VI CUA HAI SAN PHAM (Issue #205).
   *
   * Mot luot tra cuu tai lieu cua nhieu SKU thi menh de cua ca hai deu chon duoc, va mot cau
   * ghep chung lai doc len nhu mot khang dinh ve mot san pham. Ma nay tach khoi
   * `NARRATIVE_NOT_SOURCE_BOUND` vi hai thu doi hai hanh dong khac nhau: cau kia la model
   * ghep chu, cau nay la model tra loi dung chu nhung sai san pham.
   */
  'NARRATIVE_SCOPE_CONFLICT',
  /** G2 — mot con so trong loi nhan khong truy nguyen duoc ve nguon/grant/tin khach. */
  'NUMERAL_NOT_GROUNDED',
  /** G3 — mot ma chinh sach trong loi nhan khong duoc cap va khong co trong nguon. */
  'POLICY_CARRIER_NOT_GROUNDED',
  /** G3 — mot muc cam ket don trong loi nhan khong duoc cap va khong co trong nguon. */
  'COMMITMENT_CARRIER_NOT_GROUNDED',
  /*
   * G4 — TIEN/CHINH SACH/CAM KET DA CO THAM QUYEN THI PHAI DI QUA KHOI, KHONG QUA VAN XUOI.
   *
   * Ba ma duoi day chan mot lop tinh vi hon G2/G3, va no la lop cuoi cung con lai cua muc 2 hop
   * dong ("no consequence-bearing customer-visible text may originate as unconstrained raw LLM
   * prose"). Mot con so DA duoc uy quyen thi khong phai bia — nhung CACH DAT no vao cau van thi
   * van la cua model: "đơn giá 990.000đ" va "giá tham khảo tối thiểu 990.000đ" mang cung mot con
   * so va noi hai dieu khac han nhau ve mat cam ket. Cau qualifier do thuoc ve bo soan.
   *
   * Nen: con so nam trong grant tien -> loi nhan bi tu choi, model phai xin `bao_gia`/`tinh_don`.
   * Con so chi neo nguon vao TAI LIEU (9700 lít/phút, bảo hành 7 ngày) thi van viet thoai mai —
   * do la du kien ky thuat, khong phai cam ket nghiep vu.
   */
  'FINANCIAL_VALUE_IN_NARRATIVE',
  'POLICY_STATEMENT_IN_NARRATIVE',
  'ORDER_COMMITMENT_IN_NARRATIVE',
  /** Model khong viet loi nhan nao. */
  'EMPTY',
] as const;
export type NarrativeRejection = (typeof NARRATIVE_REJECTIONS)[number];

export const NARRATIVE_REJECTION_LABELS: Record<NarrativeRejection, string> = {
  NO_SYSTEM_SOURCE: 'Lượt này không tra cứu được nguồn hệ thống nào',
  NARRATIVE_NOT_SOURCE_BACKED: 'Lời nhắn nói điều không nguồn hệ thống nào của lượt này nói',
  NARRATIVE_NOT_SOURCE_BOUND:
    'Lời nhắn ghép lại từ ngữ của nguồn thành một mệnh đề không nguồn nào nói',
  NARRATIVE_SCOPE_CONFLICT: 'Lời nhắn trộn mệnh đề của hai sản phẩm khác nhau',
  NUMERAL_NOT_GROUNDED: 'Lời nhắn chứa con số không truy nguyên được về nguồn',
  POLICY_CARRIER_NOT_GROUNDED: 'Lời nhắn nói chính sách không được cấp và không có trong nguồn',
  COMMITMENT_CARRIER_NOT_GROUNDED:
    'Lời nhắn nói cam kết đơn không được cấp và không có trong nguồn',
  FINANCIAL_VALUE_IN_NARRATIVE: 'Số tiền đã có thẩm quyền phải đi qua khối báo giá/tính đơn',
  POLICY_STATEMENT_IN_NARRATIVE: 'Chính sách đã có thẩm quyền phải đi qua khối chính sách',
  ORDER_COMMITMENT_IN_NARRATIVE: 'Cam kết đơn đã có thẩm quyền phải đi qua khối trạng thái đơn',
  EMPTY: 'Model không viết lời nhắn nào',
};

export type NarrativeDecision =
  | { readonly admitted: true; readonly text: string }
  | { readonly admitted: false; readonly reason: NarrativeRejection };

/**
 * CHE DO SOAN — do HE THONG quyet dinh, tu tham quyen thuc su thu duoc.
 *
 * Day la cho muc 3 hop dong duoc thi hanh: model KHONG chon duoc che do. `deterministic_business`
 * chi xuat hien khi co it nhat mot khoi da render duoc tu du kien tat dinh; `narrative_only` theo
 * dinh nghia khong co khoi nghiep vu nao, nen mot nhan `narrative` model tu gan cho mot cau he qua
 * khong cap them duoc gi.
 */
export const OUTBOUND_COMPOSITION_MODES = [
  /** Van ban do mot tang tat dinh dung tron (xac nhan don, cau hoi lai, mau chuyen Sale). */
  'deterministic_document',
  /** Co it nhat mot khoi nghiep vu render tu du kien tat dinh. */
  'deterministic_business',
  /** Khong co khoi nghiep vu nao; chi con loi nhan da qua hop dong neo nguon. */
  'narrative_only',
  /** Khong con gi de gui — fail closed. */
  'empty',
] as const;
export type OutboundCompositionMode = (typeof OUTBOUND_COMPOSITION_MODES)[number];

/**
 * KET QUA MOT LAN SOAN — thu duoc GHIM vao trace va thu ma diem nghen gui doc lai.
 *
 * `grounded` la BANG CHUNG NEO NGUON: tap ma/gia tri he thong SO HUU ma loi nhan duoc phep nhac.
 * No di theo composition de diem nghen gui KIEM LAI doc lap duoc (phong thu chieu sau, muc 7):
 * bo trich vat mang chay lai tren van ban cuoi, va lan nay no chi duoc phep LAM GIAM — moi vat
 * mang phai nam trong `grounded` hoac trong grant, nếu không thì từ chối.
 */
export interface OutboundComposition {
  readonly mode: OutboundCompositionMode;
  readonly planKind: OutboundPlanKind;
  readonly blocks: readonly ComposedBlock[];
  readonly omitted: readonly OmittedBlock[];
  readonly narrative: NarrativeDecision;
  /** Van ban CUOI CUNG den tay khach (chua ke nhan tu dong ma duong gui noi them). */
  readonly text: string;
  /** Dau cua chinh `text` — xem `outboundFingerprint()`. */
  readonly fingerprint: string;
  /** Bang chung neo nguon: gia tri so, ma chinh sach, the cam ket he thong so huu trong luot. */
  readonly grounded: readonly string[];
}
