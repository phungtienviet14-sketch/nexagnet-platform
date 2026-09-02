import type { PricePeriod, PricePeriodPrice, PricePeriodsView } from './settings';

/**
 * Doc mot danh sach ky gia ra thanh NGON NGU NGHIEP VU, va noi ro thao tac nao con duoc phep.
 *
 * Man cu do het moi ky vao mot cai `<select>` duy nhat, nhan la `Tháng 2026-09 · DRAFT (19 SKU)`.
 * Ba khai niem khac han nhau — bang gia CHINH THUC dang ap dung, BAN NHAP dang sua, va bang gia
 * CHI DE TEST — trong giong het nhau trong cai danh sach do. Ngay 01/09/2026 dieu do dan den mot
 * loi that: nguoi van hanh bam "Sao chép kỳ này sang nháp mới" roi kich hoat, va bang gia thang 7
 * cua khach bong tro thanh bang gia chinh thuc thang 9 — lam XANH cong san sang van hanh ma khong
 * he co van ban gia moi nao (Issue #114, #116, #117 §4).
 *
 * Nen o day ba khai niem la ba truong RIENG trong `PricePeriodBoard`, va y dinh tao ky la mot
 * lua chon TUONG MINH (`PricePeriodPurpose`) duoc dich sang loi goi API bang `planPricePeriod`,
 * chu khong phai he qua phu cua viec bam trung nut nao.
 */

/** Khop `TEST_ONLY_PRICE_PERIOD_SOURCE` phia API (`apps/api/src/knowledge/domain.ts`). */
export const TEST_ONLY_SOURCE = 'test_only';

export type PricePeriodKind = 'official' | 'test-only' | 'draft' | 'archived' | 'expired';

export function isTestOnlyPeriod(period: Pick<PricePeriod, 'source'>): boolean {
  return period.source === TEST_ONLY_SOURCE;
}

/** Ky nay do dau ma ra — doc cho nguoi khong ky thuat, khong tra ve `copy:cmt1w27ej0002o901…`. */
export function pricePeriodOrigin(period: Pick<PricePeriod, 'source'>): string {
  if (!period.source) return 'Tạo từ trước khi hệ thống ghi nguồn';
  if (period.source === TEST_ONLY_SOURCE) return 'Tạo riêng để chạy thử';
  if (period.source.startsWith('copy:')) return 'Sao chép từ một kỳ giá khác';
  return 'Người vận hành tạo mới';
}

/**
 * `currentMonth` la tuy chon nhung nen truyen: mot ky thang 8 con `status='active'` sang thang 9
 * thi KHONG con ap dung cho don nao ca — `selectCurrentPrices()` phia may chu loc dung thang hien
 * hanh. Goi no la "Bảng giá chính thức" trong man thang 9 la noi sai voi khach.
 */
export function classifyPricePeriod(period: PricePeriod, currentMonth?: string): PricePeriodKind {
  if (period.status === 'archived') return 'archived';
  if (period.status === 'draft') return 'draft';
  if (currentMonth && period.validMonth !== currentMonth) return 'expired';
  return isTestOnlyPeriod(period) ? 'test-only' : 'official';
}

export const PRICE_PERIOD_KIND_LABELS: Readonly<Record<PricePeriodKind, string>> = {
  official: 'Bảng giá chính thức',
  'test-only': 'Chỉ để chạy thử (UAT)',
  draft: 'Bản nháp',
  archived: 'Đã lưu trữ',
  expired: 'Đã hết hiệu lực',
};

/** Ky nay co dang quyet dinh gia cho don moi khong. Chi ky dung thang hien hanh moi tinh. */
export function isPeriodInEffect(period: PricePeriod, currentMonth: string): boolean {
  return period.status === 'active' && period.validMonth === currentMonth;
}

export interface PricePeriodBoard {
  readonly currentMonth: string;
  /** Ky ap dung THAT cho thang hien tai. `null` nghia la khach dang khong co bang gia chinh thuc. */
  readonly official: PricePeriod | null;
  /** Ky chay thu thang hien tai — CO gia nhung khong bao gio duoc tinh la bang gia chinh thuc. */
  readonly testOnly: PricePeriod | null;
  readonly drafts: readonly PricePeriod[];
  /** Ky dang active nhung KHONG phai thang nay — het hieu luc, giu lai de doi chieu. */
  readonly pastActive: readonly PricePeriod[];
  readonly archived: readonly PricePeriod[];
  readonly missingOfficial: boolean;
}

export function buildPricePeriodBoard(view: PricePeriodsView): PricePeriodBoard {
  const { currentMonth, periods } = view;
  const isCurrent = (period: PricePeriod) => period.validMonth === currentMonth;
  const active = periods.filter((period) => period.status === 'active');
  const official = active.find((period) => isCurrent(period) && !isTestOnlyPeriod(period)) ?? null;
  const testOnly = active.find((period) => isCurrent(period) && isTestOnlyPeriod(period)) ?? null;
  return {
    currentMonth,
    official,
    testOnly,
    drafts: periods.filter((period) => period.status === 'draft'),
    pastActive: active.filter((period) => !isCurrent(period)),
    archived: periods.filter((period) => period.status === 'archived'),
    // Doc tu du lieu chu khong tin co `missingCurrentPeriod` cua API: hai nguon phai noi cung mot
    // dieu, va neu lech thi man hinh phai lech ve phia noi that la CON THIEU.
    missingOfficial: !official,
  };
}

/** Ca `active` lan `draft` deu luu tru duoc — dung nhu `PricePeriodsService.archive()` cho phep. */
export function canArchivePeriod(period: PricePeriod): boolean {
  return period.status === 'active' || period.status === 'draft';
}

/** Sua/xoa dong gia: CHI ky nhap. Ky da ap dung hay da luu tru la su that nghiep vu da chot. */
export function canEditPeriodRows(period: PricePeriod): boolean {
  return period.status === 'draft';
}

export function canActivatePeriod(period: PricePeriod): boolean {
  return period.status === 'draft';
}

export interface HighImpactConfirmation {
  readonly title: string;
  /** Bon cau tra loi bat buoc cua #117 §5 — doi gi, tu khi nao, anh huong don nao, hoan tac sao. */
  readonly whatChanges: string;
  readonly effectiveFrom: string;
  readonly affectedOrders: string;
  readonly howToUndo: string;
  readonly confirmLabel: string;
}

/**
 * Loi canh bao truoc khi LUU TRU — noi dung phu thuoc ky do co dang duoc dung hay khong.
 *
 * Luu tru mot BAN NHAP khong anh huong don nao ca; luu tru ky DANG AP DUNG thi tu giay do moi don
 * moi mat gia. Gop hai truong hop vao mot cau canh bao chung la cach lam nguoi ta hoac so vo co,
 * hoac quen so dung luc can so.
 */
export function archiveConfirmation(
  period: PricePeriod,
  board: PricePeriodBoard,
): HighImpactConfirmation {
  const month = period.validMonth ?? board.currentMonth;
  if (period.status === 'draft') {
    return {
      title: `Lưu trữ bản nháp tháng ${month}?`,
      whatChanges: 'Bản nháp này được cất đi và không sửa được nữa.',
      effectiveFrom: 'Ngay bây giờ.',
      affectedOrders: 'Không đơn nào bị ảnh hưởng — bản nháp chưa từng được áp dụng.',
      howToUndo: 'Tạo lại một bản nháp mới khi cần; lịch sử bản nháp này vẫn được giữ.',
      confirmLabel: 'Lưu trữ bản nháp',
    };
  }
  const losesCurrentPricing = period.validMonth === board.currentMonth && !isTestOnlyPeriod(period);
  return {
    title: `Lưu trữ bảng giá tháng ${month}?`,
    whatChanges: isTestOnlyPeriod(period)
      ? 'Bảng giá chạy thử này thôi áp dụng.'
      : 'Bảng giá này thôi áp dụng cho toàn hệ thống.',
    effectiveFrom: 'Ngay sau khi bấm xác nhận.',
    affectedOrders: losesCurrentPricing
      ? `Tháng ${board.currentMonth} sẽ không còn bảng giá nào. Mọi đơn và câu hỏi giá mới được chuyển về cho Sale xử lý tay cho tới khi có bảng giá mới.`
      : 'Đơn đã chốt giữ nguyên giá đã chốt. Đơn mới dùng bảng giá đang áp dụng của tháng hiện tại.',
    howToUndo:
      'Không bật lại trực tiếp được. Muốn dùng lại thì tạo bản nháp từ kỳ này rồi kích hoạt — lịch sử kỳ cũ vẫn được giữ nguyên, không có thao tác nào xóa hẳn.',
    confirmLabel: 'Lưu trữ bảng giá',
  };
}

export function activateConfirmation(
  period: PricePeriod,
  rows: readonly PricePeriodPrice[],
  board: PricePeriodBoard,
): HighImpactConfirmation {
  const month = period.validMonth ?? board.currentMonth;
  const testOnly = isTestOnlyPeriod(period);
  return {
    title: testOnly
      ? `Kích hoạt bảng giá CHẠY THỬ tháng ${month}?`
      : `Kích hoạt bảng giá chính thức tháng ${month}?`,
    whatChanges: testOnly
      ? `${rows.length} mặt hàng có giá để chạy thử. Đây KHÔNG phải bảng giá chính thức và không làm hệ thống được coi là đủ điều kiện chạy thật.`
      : `${rows.length} mặt hàng sẽ dùng giá trong bảng này.`,
    effectiveFrom: `Ngay lập tức, cho mọi đơn và báo giá mới của tháng ${month}.`,
    affectedOrders: 'Đơn đã chốt trước đó giữ nguyên giá cũ. Chỉ đơn mới dùng giá này.',
    howToUndo: board.official
      ? 'Lưu trữ kỳ này để quay lại trạng thái không có bảng giá, rồi kích hoạt kỳ đúng.'
      : 'Lưu trữ kỳ này nếu kích hoạt nhầm; lịch sử được giữ, không có thao tác xóa hẳn.',
    confirmLabel: testOnly ? 'Kích hoạt bảng giá chạy thử' : 'Kích hoạt bảng giá chính thức',
  };
}

export function removeRowConfirmation(sku: string, remaining: number): HighImpactConfirmation {
  return {
    title: `Xóa ${sku} khỏi bản nháp?`,
    whatChanges: `Mặt hàng ${sku} bị bỏ khỏi bản nháp này. Còn lại ${remaining} mặt hàng.`,
    effectiveFrom: 'Ngay bây giờ, và được lưu lại luôn.',
    affectedOrders: 'Không đơn nào bị ảnh hưởng — bản nháp chưa được áp dụng.',
    howToUndo: 'Thêm lại mặt hàng này vào bản nháp trước khi kích hoạt.',
    confirmLabel: 'Xóa khỏi bản nháp',
  };
}

/* ------------------------------------------------------------------ *
 * Luong TAO ky gia co dan duong
 * ------------------------------------------------------------------ */

export type PricePeriodPurpose = 'official' | 'copy-previous' | 'test-only';

export interface PricePeriodPurposeOption {
  readonly purpose: PricePeriodPurpose;
  readonly label: string;
  readonly summary: string;
  readonly consequence: string;
  readonly available: boolean;
  readonly unavailableReason?: string;
}

/**
 * Ba muc dich, moi muc noi ro HE QUA — chu khong phai ba cai nut ten gan giong nhau canh nhau.
 *
 * Muc `test-only` chi mo khi moi truong duoc danh dau la du lieu TEST, vi API tu choi kich hoat ky
 * `test_only` ngoai moi truong do. Hien mot lua chon chac chan se bi tu choi la day nguoi dung vao
 * mot ngo cut.
 */
export function pricePeriodPurposeOptions(input: {
  readonly dataClassificationTest: boolean;
  readonly hasPeriodToCopy: boolean;
}): readonly PricePeriodPurposeOption[] {
  return [
    {
      purpose: 'official',
      label: 'Tạo bảng giá chính thức',
      summary: 'Nhập giá mới theo văn bản giá đã duyệt của công ty.',
      consequence: 'Khi kích hoạt, đây là giá áp dụng thật cho mọi đơn mới.',
      available: true,
    },
    {
      purpose: 'copy-previous',
      label: 'Tạo bản nháp từ một kỳ trước',
      summary: 'Chép lại toàn bộ giá của một kỳ cũ để sửa dần, rồi mới kích hoạt.',
      consequence:
        'Bản nháp chưa áp dụng gì. Chỉ kích hoạt sau khi đã sửa đúng theo văn bản giá mới — giá kỳ cũ không tự nhiên đúng cho tháng mới.',
      available: input.hasPeriodToCopy,
      ...(input.hasPeriodToCopy ? {} : { unavailableReason: 'Chưa có kỳ giá nào để chép lại.' }),
    },
    {
      purpose: 'test-only',
      label: 'Tạo bảng giá chỉ để chạy thử (UAT)',
      summary: 'Một hai mặt hàng có giá để chạy thử luồng đặt hàng.',
      consequence:
        'KHÔNG phải bảng giá chính thức: hệ thống vẫn báo là còn thiếu bảng giá tháng này, và cổng "đủ điều kiện chạy thật" vẫn đỏ.',
      available: input.dataClassificationTest,
      ...(input.dataClassificationTest
        ? {}
        : { unavailableReason: 'Chỉ dùng được trên môi trường được đánh dấu là dữ liệu thử.' }),
    },
  ];
}

export interface PricePeriodPlan {
  /** `create` = ky trong (ton trong `testOnly`); `copy` = chep dong gia tu ky nguon. */
  readonly api: 'create' | 'copy';
  readonly validMonth: string;
  readonly testOnly: boolean;
  readonly sourcePeriodId?: string;
  readonly note?: string;
}

export interface PricePeriodPlanInput {
  readonly purpose: PricePeriodPurpose;
  readonly validMonth: string;
  readonly sourcePeriodId?: string;
}

/**
 * Dich MUC DICH ra loi goi API. Day la cho chan lai loi cua Issue #114.
 *
 * `copyDraft()` phia API luon dat `source = 'copy:<id>'`, nghia la ky sinh ra tu duong copy KHONG
 * BAO GIO la ky `test_only` — du nguoi dung co tick o "chi de test" hay khong. Truoc day o tick do
 * nam canh ca hai nut, nen mot ky dinh lam de chay thu de dang ra doi thanh bang gia chinh thuc.
 * O day muc dich `test-only` bi ep sang `create` + `testOnly: true`, va co bai kiem tra khoa lai.
 */
export function planPricePeriod(input: PricePeriodPlanInput): PricePeriodPlan {
  if (input.purpose === 'copy-previous') {
    if (!input.sourcePeriodId) throw new Error('Cần chọn kỳ giá nguồn để chép lại');
    return {
      api: 'copy',
      validMonth: input.validMonth,
      testOnly: false,
      sourcePeriodId: input.sourcePeriodId,
    };
  }
  const testOnly = input.purpose === 'test-only';
  return {
    api: 'create',
    validMonth: input.validMonth,
    testOnly,
    ...(testOnly ? { note: `UAT_TEST_ONLY_${input.validMonth}` } : {}),
  };
}

/** So mat hang toi da cho ky chay thu — khop `validate()` phia API ("1-2 SKU"). */
export const TEST_ONLY_MAX_ROWS = 2;
export const TEST_ONLY_MIN_ROWS = 1;

/**
 * Kiem tra TRUOC KHI GUI, bang chinh luat ma API se ap.
 *
 * Cho nguoi ta bam "Kích hoạt" roi moi bao "kỳ test-only chỉ được có 1-2 SKU" la bat ho doan xem
 * vua lam sai o buoc nao trong sau buoc.
 */
export function validatePricePeriodRows(
  purpose: PricePeriodPurpose,
  rows: readonly PricePeriodPrice[],
  catalogueSize?: number,
): readonly string[] {
  const errors: string[] = [];
  if (rows.length === 0) {
    errors.push('Bảng giá đang trống — hãy thêm ít nhất một mặt hàng.');
  }
  if (purpose === 'test-only') {
    if (rows.length > TEST_ONLY_MAX_ROWS) {
      errors.push(
        `Bảng giá chạy thử chỉ được ${TEST_ONLY_MIN_ROWS}–${TEST_ONLY_MAX_ROWS} mặt hàng, đang có ${rows.length}.`,
      );
    }
  } else if (catalogueSize !== undefined && rows.length < catalogueSize) {
    errors.push(
      `Bảng giá chính thức cần đủ ${catalogueSize} mặt hàng, đang thiếu ${catalogueSize - rows.length}.`,
    );
  }
  const missingWholesale = rows
    .filter((row) => !Number.isFinite(row.wholesale) || row.wholesale <= 0)
    .map((row) => row.sku);
  if (missingWholesale.length > 0) {
    errors.push(`Chưa nhập đơn giá CTV cho: ${missingWholesale.join(', ')}.`);
  }
  return errors;
}

/** Bo mot mat hang khoi danh sach dang soan — tra ve mang MOI, khong sua tai cho. */
export function removeRow(rows: readonly PricePeriodPrice[], sku: string): PricePeriodPrice[] {
  return rows.filter((row) => row.sku !== sku);
}

/** Them mot mat hang chua co gia. Trung ma thi giu nguyen — khong tao hai dong cung mot ma. */
export function addRow(rows: readonly PricePeriodPrice[], sku: string): PricePeriodPrice[] {
  const trimmed = sku.trim();
  if (!trimmed) return [...rows];
  if (rows.some((row) => row.sku === trimmed)) return [...rows];
  return [...rows, { sku: trimmed, wholesale: 0 }];
}
