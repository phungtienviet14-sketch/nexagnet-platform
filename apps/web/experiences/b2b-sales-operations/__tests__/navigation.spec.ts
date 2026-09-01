import type { CapabilityId } from '@netviet/tenant';
import { describe, expect, it } from 'vitest';
import {
  B2B_SECTIONS,
  buildSectionUrl,
  canNavigateTo,
  isSectionEnabled,
  navigationGroups,
  parseSectionFromSearch,
  parseSelectionFromSearch,
  resolveNavigation,
  resolveSection,
  visibleSections,
  type NavigationInput,
} from '../navigation';

/** Bo nang luc TOI THIEU ma experience doi — trung voi `EXPERIENCE_REQUIREMENTS`. */
const MINIMUM: readonly CapabilityId[] = [
  'knowledge',
  'messaging',
  'turn-processing',
  'sales-order',
  'operations',
];
const FULL: readonly CapabilityId[] = [...MINIMUM, 'campaign', 'notifications'];

const asInput = (
  capabilities: readonly CapabilityId[],
  role: NavigationInput['role'],
): NavigationInput => ({ capabilities, role });

const labelsOf = (input: NavigationInput): string[] =>
  visibleSections(input).map((section) => section.label);

describe('hop dong thong tin kien truc (Issue #107 §3)', () => {
  it('dung DUNG cac muc, dung nhom va dung thu tu ma hop dong ghi', () => {
    expect(navigationGroups(asInput(FULL, null))).toEqual([
      {
        group: { id: 'root', label: '' },
        sections: [expect.objectContaining({ label: 'Tổng quan' })],
      },
      {
        group: { id: 'sales', label: 'BÁN HÀNG' },
        sections: [
          expect.objectContaining({ label: 'Hội thoại' }),
          expect.objectContaining({ label: 'Duyệt & gửi' }),
          expect.objectContaining({ label: 'Đơn hàng' }),
          expect.objectContaining({ label: 'Đại lý & khách hàng' }),
        ],
      },
      {
        group: { id: 'care', label: 'CHĂM SÓC' },
        sections: [
          expect.objectContaining({ label: 'Chăm sóc khách hàng' }),
          expect.objectContaining({ label: 'Lịch & chiến dịch' }),
        ],
      },
      {
        group: { id: 'ai-operations', label: 'VẬN HÀNH AI' },
        sections: [
          expect.objectContaining({ label: 'Cảnh báo' }),
          expect.objectContaining({ label: 'Dữ liệu & kiến thức' }),
          expect.objectContaining({ label: 'Chính sách & bảng giá' }),
        ],
      },
      {
        group: { id: 'administration', label: 'QUẢN TRỊ' },
        sections: [
          expect.objectContaining({ label: 'Người dùng & phân quyền' }),
          expect.objectContaining({ label: 'Nhật ký hoạt động' }),
          expect.objectContaining({ label: 'Cài đặt' }),
        ],
      },
    ]);
  });

  it('khong nhac mot khai niem ky thuat nao trong nhan va mo ta dieu huong', () => {
    const surface = B2B_SECTIONS.map((section) => `${section.label} ${section.summary}`)
      .join(' ')
      .toLowerCase();
    for (const forbidden of ['trace', 'span', 'workflow', 'prompt', 'llm', 'json', 'sha', 'agent']) {
      expect(surface).not.toContain(forbidden);
    }
  });
});

describe('loc theo nang luc goi khach', () => {
  it('khach khong mua cham soc thi khong thay muc cham soc va chien dich', () => {
    const labels = labelsOf(asInput([...MINIMUM, 'notifications'], null));
    expect(labels).not.toContain('Chăm sóc khách hàng');
    expect(labels).not.toContain('Lịch & chiến dịch');
    expect(labels).toContain('Đơn hàng');
  });

  it('khach khong bat thong bao thi khong thay muc canh bao', () => {
    expect(labelsOf(asInput([...MINIMUM, 'campaign'], null))).not.toContain('Cảnh báo');
  });

  it('bo nang luc toi thieu van dung duoc — khong nhom nao rong ma con tieu de treo', () => {
    for (const entry of navigationGroups(asInput(MINIMUM, null))) {
      expect(entry.sections.length).toBeGreaterThan(0);
    }
  });
});

describe('hop dong vai tro -> dieu huong (Issue #107 §8)', () => {
  it('Sale khong duoc dan vao quan tri nguoi dung hay nhat ky', () => {
    const labels = labelsOf(asInput(FULL, 'SALE'));
    expect(labels).toContain('Duyệt & gửi');
    expect(labels).not.toContain('Người dùng & phân quyền');
    expect(labels).not.toContain('Nhật ký hoạt động');
  });

  /*
   * DOI TU U-UI0 SANG U-UI1, CO CHU DICH.
   *
   * O U-UI0, "Cảnh báo" con la mot ranh gioi trang nen de cho quan ly la du. Tu U-UI1 no doc ra
   * HANG VIEC THAT — "cần duyệt" va "cần nhập đơn" chinh la viec cua Sale. Giau no khoi Sale
   * khong bao ve duoc gi: ba nguon phia sau (`/messages`, `/settings/readiness`,
   * `/settings/summary`) deu da cho ca bon vai tro DOC, va thanh dieu huong khong phai mot o
   * khoa (xem `NAVIGATION_ENFORCEMENT_NOTE`). Xem lai `alerts` trong `navigation.ts`.
   */
  it('Sale VA Ke toan deu duoc dan toi Canh bao — do la hang viec cua ho', () => {
    expect(labelsOf(asInput(FULL, 'SALE'))).toContain('Cảnh báo');
    expect(labelsOf(asInput(FULL, 'ACCOUNTING'))).toContain('Cảnh báo');
  });

  it('Ke toan thay so sach va tham chieu, khong thay hang viec hoi thoai', () => {
    expect(labelsOf(asInput(FULL, 'ACCOUNTING'))).toEqual([
      'Tổng quan',
      'Đơn hàng',
      'Đại lý & khách hàng',
      'Cảnh báo',
      'Dữ liệu & kiến thức',
      'Chính sách & bảng giá',
      'Cài đặt',
    ]);
    // Van KHONG dan ke toan vao hang viec dieu hanh hoi thoai.
    expect(labelsOf(asInput(FULL, 'ACCOUNTING'))).not.toContain('Duyệt & gửi');
    expect(labelsOf(asInput(FULL, 'ACCOUNTING'))).not.toContain('Hội thoại');
  });

  it('Quan ly thay moi thu tru quan tri nguoi dung — dung nhu @Roles cua API', () => {
    const labels = labelsOf(asInput(FULL, 'MANAGER'));
    expect(labels).toContain('Cảnh báo');
    expect(labels).toContain('Nhật ký hoạt động');
    expect(labels).not.toContain('Người dùng & phân quyền');
  });

  it('Admin thay tat ca', () => {
    expect(visibleSections(asInput(FULL, 'ADMIN'))).toHaveLength(B2B_SECTIONS.length);
  });

  it('chua biet vai tro (che do khong phien) thi khong giau mot muc nao', () => {
    expect(visibleSections(asInput(FULL, null))).toHaveLength(B2B_SECTIONS.length);
  });
});

describe('duong dan luu lai duoc', () => {
  it('muc mac dinh cho ra duong dan sach, muc khac deo tham so', () => {
    expect(buildSectionUrl('overview')).toBe('/');
    expect(buildSectionUrl('approvals')).toBe('/?section=approvals');
  });

  it('doc lai dung muc tu thanh dia chi', () => {
    expect(parseSectionFromSearch('?section=orders', asInput(FULL, null))).toBe('orders');
  });

  it('duong dan la hoac khong con dung nua thi roi ve Tong quan, khong render trang trong', () => {
    expect(parseSectionFromSearch('?section=khong-ton-tai', asInput(FULL, null))).toBe('overview');
    // Muc that, nhung khach da tat nang luc cham soc.
    expect(resolveSection('campaigns', asInput(MINIMUM, null))).toBe('overview');
    // Muc that, nhung nguoi mo link la Sale.
    expect(resolveSection('users', asInput(FULL, 'SALE'))).toBe('overview');
  });
});

describe('duong dan toi MOT THU dang mo (Issue #110 §deep-link)', () => {
  it('deo them lua chon vao duong dan cua muc', () => {
    expect(buildSectionUrl('orders', 'ord-123')).toBe('/?section=orders&selected=ord-123');
  });

  it('muc mac dinh van deo duoc lua chon ma khong deo tham so muc', () => {
    expect(buildSectionUrl('overview', 'ord-123')).toBe('/?selected=ord-123');
  });

  it('khong chon gi thi duong dan sach y nhu truoc — hop dong cu khong doi', () => {
    expect(buildSectionUrl('overview')).toBe('/');
    expect(buildSectionUrl('overview', null)).toBe('/');
    expect(buildSectionUrl('approvals', null)).toBe('/?section=approvals');
  });

  it('ma hoa an toan cho ten nhom co dau va khoang trang', () => {
    const url = buildSectionUrl('conversations', 'Nhóm đại lý Hà Nội');
    expect(parseSelectionFromSearch(url.slice(url.indexOf('?')))).toBe('Nhóm đại lý Hà Nội');
  });

  it('doc lai dung lua chon tu thanh dia chi', () => {
    expect(parseSelectionFromSearch('?section=orders&selected=ord-9')).toBe('ord-9');
  });

  it('khong co hoac RONG deu doc thanh "chua chon gi"', () => {
    expect(parseSelectionFromSearch('?section=orders')).toBeNull();
    expect(parseSelectionFromSearch('?selected=')).toBeNull();
    expect(parseSelectionFromSearch('?selected=%20%20')).toBeNull();
    expect(parseSelectionFromSearch('')).toBeNull();
  });
});

/**
 * MOT PHEP GIAI CHO MOI DUONG VAO — bat bien bi vi pham trong PR #111.
 *
 * Khiem khuyet goc khong nam o bang vai tro: bang do van dung. No nam o cho CO HAI duong vao mot
 * muc (duong dan luu san, va mot lan bam trong ung dung) ma chi MOT duong di qua phep kiem. Bo
 * duoi day khoa lai dieu ngan gon nhat co the noi ve chuyen do: chi co MOT cau tra loi, va moi
 * ben goi phai lay no tu cung mot cho.
 */
describe('mot phep giai duy nhat cho ca deep-link lan dieu huong trong ung dung (PR #111)', () => {
  it('`canNavigateTo` va `visibleSections` KHONG BAO GIO noi hai dieu khac nhau', () => {
    for (const role of [null, 'SALE', 'ACCOUNTING', 'MANAGER', 'ADMIN'] as const) {
      const input = asInput(FULL, role);
      const visible = new Set(visibleSections(input).map((section) => section.id));
      for (const section of B2B_SECTIONS) {
        expect(
          canNavigateTo(section.id, input),
          `${role ?? 'khong-phien'} / ${section.id}`,
        ).toBe(visible.has(section.id));
        expect(canNavigateTo(section.id, input)).toBe(isSectionEnabled(section, input));
      }
    }
  });

  it('`resolveSection` roi ve Tong quan dung o nhung muc `canNavigateTo` tu choi', () => {
    for (const role of [null, 'SALE', 'ACCOUNTING', 'MANAGER', 'ADMIN'] as const) {
      const input = asInput(FULL, role);
      for (const section of B2B_SECTIONS) {
        const resolved = resolveSection(section.id, input);
        expect(resolved).toBe(canNavigateTo(section.id, input) ? section.id : 'overview');
      }
    }
  });

  /*
   * Truong hop CU THE ma review chan lai. `goTo()` cua vo goi dung ham nay, nen mot lan bam trong
   * ung dung toi `approvals` duoi vai tro ke toan roi ve Tong quan y het mot bookmark.
   */
  it('KE TOAN bi cham lai o Duyệt & gửi du di bang duong nao', () => {
    const accounting = asInput(FULL, 'ACCOUNTING');
    expect(canNavigateTo('approvals', accounting)).toBe(false);
    expect(resolveSection('approvals', accounting)).toBe('overview');
    expect(parseSectionFromSearch('?section=approvals', accounting)).toBe('overview');
    // Nhung Canh bao va Don hang thi mo — do la luong viec that cua ho.
    expect(canNavigateTo('alerts', accounting)).toBe(true);
    expect(canNavigateTo('orders', accounting)).toBe(true);
  });

  it('muc khong ton tai khong bao gio di duoc, voi moi vai tro', () => {
    for (const role of [null, 'SALE', 'ACCOUNTING', 'MANAGER', 'ADMIN'] as const) {
      expect(canNavigateTo('khong-ton-tai', asInput(FULL, role))).toBe(false);
    }
  });
});

/**
 * LUAT ma `goTo()` cua vo chay — de o day chu khong nam trong mot `useCallback`, de kiem duoc.
 */
describe('mot yeu cau dieu huong duoc cham nhu the nao (PR #111)', () => {
  it('muc mo duoc thi giu nguyen ca muc lan lua chon', () => {
    expect(resolveNavigation('approvals', 'ord-1', asInput(FULL, 'SALE'))).toEqual({
      section: 'approvals',
      selection: 'ord-1',
    });
  });

  it('KE TOAN bi cham lai o Duyệt & gửi, VA lua chon di kem bi bo', () => {
    expect(resolveNavigation('approvals', 'ord-1', asInput(FULL, 'ACCOUNTING'))).toEqual({
      section: 'overview',
      selection: null,
    });
  });

  it('muc bi tat theo nang luc cung roi ve Tong quan, lua chon cung bo', () => {
    expect(resolveNavigation('campaigns', 'bat-ky', asInput(MINIMUM, 'ADMIN'))).toEqual({
      section: 'overview',
      selection: null,
    });
  });

  it('muc khong ton tai roi ve Tong quan chu khong nem', () => {
    expect(resolveNavigation('khong-ton-tai', 'x', asInput(FULL, null))).toEqual({
      section: 'overview',
      selection: null,
    });
  });

  it('cham lai mot yeu cau da hop le thi khong doi gi — tat dinh, lap lai duoc', () => {
    const input = asInput(FULL, 'SALE');
    const once = resolveNavigation('orders', 'ord-9', input);
    expect(resolveNavigation(once.section, once.selection, input)).toEqual(once);
  });
});
