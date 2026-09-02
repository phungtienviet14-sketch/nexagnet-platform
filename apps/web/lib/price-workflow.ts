import { skusMissingWholesale } from './price-rows';
import {
  TEST_ONLY_MAX_ROWS,
  TEST_ONLY_MIN_ROWS,
  classifyPricePeriod,
  isTestOnlyPeriod,
  type PricePeriodKind,
  type PricePeriodPurpose,
} from './price-period-view';
import { formatMonth } from './settings-overview';
import type { PricePeriod, PricePeriodPrice, PricePeriodValidation } from './settings';

/**
 * May trang thai cua MOT viec: ra duoc mot bang gia dung, theo dung thu tu.
 *
 * `SUA -> LUU+KIEM -> XEM LAI -> KICH HOAT -> CHI DOC`
 *
 * Vi sao phai co tep nay, thay vi vai bien `useState` trong component:
 *
 * 1. Ban cu bay "Lưu bản nháp" va "Kiểm tra bảng giá" canh nhau nhu hai viec ngang hang. Nguoi
 *    van hanh bam Kiem truoc — va `validate()` phia may chu doc DONG DA LUU, tuc doc mot ban nhap
 *    con 0 dong trong khi tren man hinh da co 19 dong. Ket qua: mot cau tu choi vo ly ("Thiếu giá
 *    cho SKU: …") cho mot bang gia nhin thay ro rang la day du. Khong the sua bang cach doi chu
 *    tren nut: chung nao con hai nut thi con bam duoc sai thu tu. Nen o day chi con MOT nut
 *    `Kiểm tra & tiếp tục`, va no LUU TRUOC roi moi KIEM — xem `persistRequired`.
 *
 * 2. "Da kiem tra xong" khong duoc phep la mot `boolean` nho trong component. Mot `boolean` nhu
 *    vay song sot qua moi lan go phim, nen nguoi ta kiem xong, sua lai gia, roi van thay nut Kich
 *    hoat — va kich hoat mot noi dung CHUA TUNG duoc kiem. O day ket qua kiem tra duoc dong dau
 *    bang `fingerprintRows()` cua chinh noi dung da kiem; sua mot chu so la dau khong con khop va
 *    trang thai TU DONG roi ve `edit`. Khong co duong nao quen xoa co.
 *
 * 3. Day KHONG phai nguon su that thu hai ve tinh hop le. `check` chi la BAN LUU cau tra loi cua
 *    may chu cho dung noi dung do; may chu van cham diem lai lan nua trong `activate()` duoi khoa
 *    hang va van co quyen tu choi (Issue #121/#122). Phan tinh cuc bo o day chi lam MOT viec: mo
 *    hay khoa cai nut, cho nhung loi hien nhien khong can hoi may chu.
 */

/* ------------------------------------------------------------------ *
 * Dau van tay noi dung ban nhap
 * ------------------------------------------------------------------ */

/**
 * Dau van tay ON DINH cua noi dung se gui len may chu.
 *
 * Chi gom dung nam truong ma `applyPriceImport()` gui di — `id` do may chu cap nen khong tinh.
 * Sap xep de thu tu dong khong lam doi dau: them mot mat hang roi bo di phai quay ve dung dau cu.
 */
export function fingerprintRows(rows: readonly PricePeriodPrice[]): string {
  return rows
    .map((row) =>
      [
        row.sku,
        row.wholesale,
        row.minRetailPrice ?? '',
        row.retailPrice ?? '',
        row.listPrice ?? '',
      ].join(':'),
    )
    .sort()
    .join('|');
}

/* ------------------------------------------------------------------ *
 * Loi HIEN NHIEN — khong hoi may chu moi biet
 * ------------------------------------------------------------------ */

export type PriceDraftIssueCode = 'EMPTY' | 'MISSING_WHOLESALE' | 'TEST_ONLY_TOO_MANY';

export interface PriceDraftIssue {
  readonly code: PriceDraftIssueCode;
  readonly message: string;
  /** Mat hang gay loi — de man hinh dua duoc tieu diem vao dung o can sua. */
  readonly skus: readonly string[];
}

/**
 * Chi nhung loi doc duoc NGAY tren noi dung dang soan.
 *
 * Co chu y KHONG kiem "bang gia chinh thuc phai du toan bo danh muc" o day, du may chu co luat
 * do. Danh muc la trang thai cua may chu: ban sao tren trinh duyet co the cu (them mot san pham
 * o tab khac chang han). Neu lay ban sao cu ra khoa nut, nguoi van hanh se khong bao gio den
 * duoc cho may chu noi cho ho su that. Luat do la viec cua may chu, va no hien ra o trang thai D.
 */
export function draftBlockingIssues(
  purpose: PricePeriodPurpose,
  rows: readonly PricePeriodPrice[],
): readonly PriceDraftIssue[] {
  if (rows.length === 0) {
    return [{ code: 'EMPTY', message: 'Thêm ít nhất một sản phẩm để tiếp tục.', skus: [] }];
  }
  const issues: PriceDraftIssue[] = [];
  if (purpose === 'test-only' && rows.length > TEST_ONLY_MAX_ROWS) {
    issues.push({
      code: 'TEST_ONLY_TOO_MANY',
      message: `Bảng giá chạy thử chỉ được ${TEST_ONLY_MIN_ROWS}–${TEST_ONLY_MAX_ROWS} mặt hàng, đang có ${rows.length}. Bỏ bớt trước khi tiếp tục.`,
      skus: rows.slice(TEST_ONLY_MAX_ROWS).map((row) => row.sku),
    });
  }
  const missing = skusMissingWholesale(rows);
  if (missing.length > 0) {
    issues.push({
      code: 'MISSING_WHOLESALE',
      message: `Chưa nhập Đơn giá CTV cho: ${missing.join(', ')}.`,
      skus: missing,
    });
  }
  return issues;
}

/* ------------------------------------------------------------------ *
 * Ket qua mot lan kiem tra
 * ------------------------------------------------------------------ */

/** Cau tra loi cua may chu, dong dau bang dau van tay cua chinh noi dung da duoc kiem. */
export interface PriceCheckSnapshot {
  readonly fingerprint: string;
  /** Dong gia DA LUU va DA KIEM — man Xem lai phai hien dung chung, khong hien `rows` hien tai. */
  readonly rows: readonly PricePeriodPrice[];
  readonly validation: PricePeriodValidation;
}

export interface PriceCheckOutcome {
  readonly validation: PricePeriodValidation;
  /**
   * `true` = ban nhap da doi SAU lan kiem nay, nen ket qua khong con noi ve noi dung hien tai.
   *
   * Van giu lai de hien: nguoi ta dang sua theo danh sach loi do, giau di ngay tu phim dau tien
   * la bat ho nho thuoc. Nhung du `stale` hay khong, nut Kich hoat deu KHONG hien — hop le chi
   * duoc suy ra tu mot lan kiem con khop.
   */
  readonly stale: boolean;
}

export function checkOutcome(
  check: PriceCheckSnapshot | null,
  rows: readonly PricePeriodPrice[],
): PriceCheckOutcome | null {
  if (!check) return null;
  return { validation: check.validation, stale: check.fingerprint !== fingerprintRows(rows) };
}

/* ------------------------------------------------------------------ *
 * Trang thai man hinh
 * ------------------------------------------------------------------ */

/** `edit` = con sua duoc · `review` = doc lai truoc khi kich hoat · `read-only` = da chot. */
export type PriceWorkflowMode = 'edit' | 'review' | 'read-only';

/** 1 Chọn sản phẩm & nhập giá · 2 Kiểm tra · 3 Kích hoạt. */
export type PriceWorkflowStep = 1 | 2 | 3;

export const PRICE_WORKFLOW_STEPS: readonly { step: PriceWorkflowStep; label: string }[] = [
  { step: 1, label: 'Chọn sản phẩm & nhập giá' },
  { step: 2, label: 'Kiểm tra' },
  { step: 3, label: 'Kích hoạt' },
];

export interface PriceWorkflowAction {
  /** `false` = KHONG render. Nut Kich hoat phai bien mat, khong phai chi mo di. */
  readonly visible: boolean;
  readonly enabled: boolean;
  readonly label: string;
  /** Vi sao dang khoa — hien ngay canh nut, khong bat nguoi ta doan. */
  readonly hint?: string;
}

/** Vi sao ky nay chi doc, va con thao tac vong doi nao. */
export interface PriceReadOnlyState {
  readonly kind: PricePeriodKind;
  readonly title: string;
  readonly detail: string;
  readonly canArchive: boolean;
  readonly canStartNewDraft: boolean;
}

export interface PriceWorkflowInput {
  readonly period: PricePeriod | null;
  readonly currentMonth: string;
  readonly canConfigure: boolean;
  /** Noi dung dang soan tren man hinh (co the chua luu). */
  readonly rows: readonly PricePeriodPrice[];
  readonly check: PriceCheckSnapshot | null;
}

export interface PriceWorkflowState {
  readonly mode: PriceWorkflowMode;
  readonly step: PriceWorkflowStep;
  readonly purpose: PricePeriodPurpose;
  readonly rowsEditable: boolean;
  readonly issues: readonly PriceDraftIssue[];
  readonly check: PriceCheckOutcome | null;
  /** Dong gia se duoc kich hoat — dung ban DA LUU + DA KIEM, khong phai `rows` hien tai. */
  readonly reviewRows: readonly PricePeriodPrice[];
  /** `Kiểm tra & tiếp tục` co phai goi luu truoc khong. Ban nhap rong thi khong co gi de luu. */
  readonly persistRequired: boolean;
  readonly saveForLater: PriceWorkflowAction;
  readonly checkAndContinue: PriceWorkflowAction;
  readonly backToEdit: PriceWorkflowAction;
  readonly activate: PriceWorkflowAction;
  readonly readOnly: PriceReadOnlyState | null;
}

const HIDDEN: PriceWorkflowAction = { visible: false, enabled: false, label: '' };

export function periodPurpose(period: Pick<PricePeriod, 'source'>): PricePeriodPurpose {
  return isTestOnlyPeriod(period) ? 'test-only' : 'official';
}

/**
 * Doc trang thai man hinh tu du lieu — THUAN, khong nho gi giua hai lan goi.
 *
 * Moi thu suy ra tu `(period, rows, check)`. Khong co co "da kiem roi" nao song doc lap, nen
 * khong co duong nao de mot lan kiem cu song sot qua mot lan sua.
 */
export function resolvePriceWorkflow(input: PriceWorkflowInput): PriceWorkflowState {
  const { period, rows, currentMonth, canConfigure } = input;
  const purpose: PricePeriodPurpose = period ? periodPurpose(period) : 'official';

  if (!period || period.status !== 'draft' || !canConfigure) {
    return {
      mode: 'read-only',
      step: 1,
      purpose,
      rowsEditable: false,
      issues: [],
      check: null,
      reviewRows: rows,
      persistRequired: false,
      saveForLater: HIDDEN,
      checkAndContinue: HIDDEN,
      backToEdit: HIDDEN,
      activate: HIDDEN,
      readOnly: period ? readOnlyState(period, currentMonth, canConfigure) : null,
    };
  }

  const outcome = checkOutcome(input.check, rows);
  const issues = draftBlockingIssues(purpose, rows);
  const reviewing = outcome !== null && !outcome.stale && outcome.validation.valid;
  const month = formatMonth(period.validMonth ?? currentMonth);

  if (reviewing) {
    return {
      mode: 'review',
      step: 3,
      purpose,
      rowsEditable: false,
      issues: [],
      check: outcome,
      reviewRows: input.check?.rows ?? rows,
      persistRequired: false,
      saveForLater: HIDDEN,
      checkAndContinue: HIDDEN,
      backToEdit: { visible: true, enabled: true, label: 'Quay lại sửa' },
      activate: {
        visible: true,
        enabled: true,
        label:
          purpose === 'test-only'
            ? `Kích hoạt bảng giá chạy thử ${month}`
            : `Kích hoạt bảng giá ${month}`,
      },
      readOnly: null,
    };
  }

  const blocked = issues[0];
  return {
    mode: 'edit',
    step: issues.length === 0 ? 2 : 1,
    purpose,
    rowsEditable: true,
    issues,
    check: outcome,
    reviewRows: rows,
    persistRequired: rows.length > 0,
    saveForLater: { visible: true, enabled: true, label: 'Lưu và làm sau' },
    checkAndContinue: {
      visible: true,
      enabled: !blocked,
      label: 'Kiểm tra & tiếp tục',
      ...(blocked ? { hint: blocked.message } : {}),
    },
    backToEdit: HIDDEN,
    activate: HIDDEN,
    readOnly: null,
  };
}

function readOnlyState(
  period: PricePeriod,
  currentMonth: string,
  canConfigure: boolean,
): PriceReadOnlyState {
  const kind = classifyPricePeriod(period, currentMonth);
  const month = formatMonth(period.validMonth ?? currentMonth);
  if (kind === 'draft') {
    // Ban nhap ma khong duoc cau hinh = vai tro chi doc. Khong phai "da chot", chi la khong phai
    // viec cua nguoi dang xem — noi that thay vi hien mot workflow bam khong duoc.
    return {
      kind,
      title: `Bản nháp ${month} — chỉ xem`,
      detail: 'Bạn đang xem ở chế độ chỉ đọc nên không sửa được bản nháp này.',
      canArchive: false,
      canStartNewDraft: false,
    };
  }
  if (kind === 'archived') {
    return {
      kind,
      title: `Bảng giá ${month} đã lưu trữ — chỉ xem`,
      detail:
        'Kỳ đã lưu trữ được giữ nguyên làm lịch sử. Muốn dùng lại thì tạo một bản nháp mới từ kỳ này rồi kích hoạt.',
      canArchive: false,
      canStartNewDraft: canConfigure,
    };
  }
  if (kind === 'expired') {
    return {
      kind,
      title: `Bảng giá ${month} đã hết hiệu lực — chỉ xem`,
      detail: `Kỳ này của tháng khác nên không còn quyết định giá cho đơn mới. Hệ thống chỉ dùng bảng giá của ${formatMonth(currentMonth)}.`,
      canArchive: canConfigure,
      canStartNewDraft: canConfigure,
    };
  }
  return {
    kind,
    title:
      kind === 'test-only'
        ? `Bảng giá chạy thử ${month} đang áp dụng — chỉ xem`
        : `Bảng giá ${month} đang áp dụng — chỉ xem`,
    detail:
      kind === 'test-only'
        ? 'Đây không phải bảng giá chính thức: hệ thống vẫn báo là còn thiếu bảng giá tháng này. Kỳ đã áp dụng không sửa trực tiếp được — muốn đổi giá thì tạo một bản nháp mới rồi kích hoạt.'
        : 'Kỳ đã áp dụng không sửa trực tiếp được, để giá đã chốt của đơn cũ không bị đổi ngược. Muốn đổi giá thì tạo một bản nháp mới rồi kích hoạt.',
    canArchive: canConfigure,
    canStartNewDraft: canConfigure,
  };
}
