import { describe, expect, it } from 'vitest';
import {
  createButtonInHeader,
  resolvePriceFocus,
  type PriceFocusInput,
  type PriceFocusView,
} from './price-focus';

function focus(overrides: Partial<PriceFocusInput> = {}): PriceFocusView {
  return resolvePriceFocus({
    wizardOpen: false,
    workflowMode: 'read-only',
    hasSelection: true,
    canConfigure: true,
    ...overrides,
  });
}

/** Moi trang thai man hinh co the vao duoc — dung de kiem cac bat bien "dung MOT" ben duoi. */
const EVERY_STATE: readonly PriceFocusInput[] = [
  { wizardOpen: false, workflowMode: 'read-only', hasSelection: false, canConfigure: true },
  { wizardOpen: false, workflowMode: 'read-only', hasSelection: false, canConfigure: false },
  { wizardOpen: true, workflowMode: 'read-only', hasSelection: false, canConfigure: true },
  { wizardOpen: true, workflowMode: 'edit', hasSelection: true, canConfigure: true },
  { wizardOpen: false, workflowMode: 'edit', hasSelection: true, canConfigure: true },
  { wizardOpen: false, workflowMode: 'review', hasSelection: true, canConfigure: true },
  { wizardOpen: false, workflowMode: 'read-only', hasSelection: true, canConfigure: true },
  { wizardOpen: false, workflowMode: 'read-only', hasSelection: true, canConfigure: false },
];

describe('resolvePriceFocus', () => {
  it('không có việc nào đang làm thì việc cần làm là BẮT ĐẦU', () => {
    const view = focus({ hasSelection: false });
    expect(view.stage).toBe('idle');
    expect(view.dominantRegion).toBe('start');
    expect(view.primaryAction).toBe('create');
    expect(view.createButton).toBe('start-primary');
    // #144 §1: trang thai thang hien tai lui ve mot dai TOM TAT, de loi moi bat dau la thu noi
    // nhat man hinh — nhung the do van giu duong vao ky dang ap dung.
    expect(view.contextDensity).toBe('compact');
    expect(view.contextActions).toBe(true);
  });

  it('trình tạo mở thì nó sở hữu cả trang, kể cả khi đang có một bản nháp mở sẵn', () => {
    // Day la ca de lot nhat: truoc #144, trinh tao va khong gian lam viec cung hien mot luc, moi
    // ben mot nut chinh — nguoi dung phai tu doan dang lam viec nao.
    const view = focus({ wizardOpen: true, workflowMode: 'edit', hasSelection: true });
    expect(view.stage).toBe('wizard');
    expect(view.dominantRegion).toBe('wizard');
    expect(view.primaryAction).toBe('wizard-continue');
    expect(view.createButton).toBe('hidden');
  });

  it('đang sửa bản nháp: khối làm việc chiếm ưu thế, nút chính là Kiểm tra & tiếp tục', () => {
    const view = focus({ workflowMode: 'edit' });
    expect(view.stage).toBe('edit');
    expect(view.dominantRegion).toBe('work');
    expect(view.primaryAction).toBe('check-continue');
    // Van vao tao duoc ky khac, nhung KHONG duoc ngang hang voi viec dang lam.
    expect(view.createButton).toBe('header-quiet');
    expect(view.contextDensity).toBe('compact');
  });

  it('màn Xem lại là một quyết định: nút chính là Kích hoạt, không phải tạo mới', () => {
    const view = focus({ workflowMode: 'review' });
    expect(view.stage).toBe('review');
    expect(view.dominantRegion).toBe('work');
    expect(view.primaryAction).toBe('activate');
    expect(view.createButton).toBe('header-quiet');
  });

  it('thẻ ngữ cảnh vẫn giữ đường vào khi không có việc nào đang làm', () => {
    // Ky dang ap dung khong nam trong muc lich su, nen bo nut "Xem chi tiết" o hai trang thai
    // nay la cat han duong vao no.
    expect(focus({ hasSelection: false }).contextActions).toBe(true);
    expect(focus({ workflowMode: 'read-only' }).contextActions).toBe(true);
    expect(focus({ workflowMode: 'edit' }).contextActions).toBe(false);
    expect(focus({ workflowMode: 'review' }).contextActions).toBe(false);
    expect(focus({ wizardOpen: true }).contextActions).toBe(false);
  });

  it('kỳ chỉ đọc: trạng thái là thứ chính, và tạo bản nháp mới là nút chính', () => {
    const view = focus({ workflowMode: 'read-only' });
    expect(view.stage).toBe('settled');
    expect(view.dominantRegion).toBe('status');
    expect(view.primaryAction).toBe('create');
    expect(view.createButton).toBe('header-primary');
    expect(view.contextDensity).toBe('full');
  });

  it('vai trò chỉ đọc không có nút tạo nào ở bất kỳ trạng thái nào', () => {
    for (const input of EVERY_STATE.filter((state) => !state.canConfigure)) {
      const view = resolvePriceFocus(input);
      expect(view.createButton).toBe('hidden');
      expect(view.primaryAction).toBe('none');
    }
  });

  it('mọi trạng thái đều có ĐÚNG MỘT khối chiếm ưu thế', () => {
    for (const input of EVERY_STATE) {
      const view = resolvePriceFocus(input);
      expect(['start', 'wizard', 'work', 'status']).toContain(view.dominantRegion);
    }
  });

  it('không trạng thái nào có hai nút chính: nút tạo chỉ là nút chính khi không có nút chính khác', () => {
    for (const input of EVERY_STATE) {
      const view = resolvePriceFocus(input);
      const createIsPrimary =
        view.createButton === 'start-primary' || view.createButton === 'header-primary';
      // Neu trang thai da co nut chinh rieng (tiep tuc / kiem tra / kich hoat) thi nut tao PHAI
      // lui xuong hang hai hoac bien mat.
      if (view.primaryAction !== 'create' && view.primaryAction !== 'none') {
        expect(createIsPrimary).toBe(false);
      }
      if (createIsPrimary) {
        expect(view.primaryAction).toBe('create');
      }
    }
  });

  it('chỉ màn trạng thái chỉ đọc mới giữ nguyên trọng lượng của nội dung nền', () => {
    // `settled` la trang thai duy nhat ma TRANG THAI chinh no la noi dung chinh (#144 §7).
    expect(focus({ workflowMode: 'read-only' }).backgroundContent).toBe(false);
    expect(focus({ hasSelection: false }).backgroundContent).toBe(true);
    expect(focus({ workflowMode: 'edit' }).backgroundContent).toBe(true);
    expect(focus({ workflowMode: 'review' }).backgroundContent).toBe(true);
    expect(focus({ wizardOpen: true }).backgroundContent).toBe(true);
  });

  it('ngữ cảnh thu gọn đi kèm với nội dung nền lùi lại — hai thứ đó luôn cùng nhịp', () => {
    for (const input of EVERY_STATE) {
      const view = resolvePriceFocus(input);
      expect(view.contextDensity === 'compact').toBe(view.backgroundContent);
    }
  });
});

describe('createButtonInHeader', () => {
  it('chỉ đúng khi nút tạo thật sự nằm ở dải tiêu đề', () => {
    expect(createButtonInHeader(focus({ workflowMode: 'read-only' }))).toBe(true);
    expect(createButtonInHeader(focus({ workflowMode: 'edit' }))).toBe(true);
    expect(createButtonInHeader(focus({ hasSelection: false }))).toBe(false);
    expect(createButtonInHeader(focus({ wizardOpen: true }))).toBe(false);
  });
});
