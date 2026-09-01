import { describe, expect, it } from 'vitest';
import type { ReadinessCheckView } from '../../../../lib/settings';
import { alertsHeadline, deriveAlerts, groupAlerts, type AlertSources } from '../alerts';
import {
  ACCOUNTING,
  ADMIN,
  ANONYMOUS,
  collectKeys,
  dirtyOrder,
  ENGINEERING_ONLY_KEYS,
  MANAGER,
  SALE,
} from './fixtures';

const BLOCKED = [
  { key: 'cod_ship', label: 'COD và cước vận chuyển', reason: 'Chưa có bảng phí COD chính thức.' },
];

const CHECKS: readonly ReadinessCheckView[] = [
  {
    key: 'price.current_period',
    label: 'Bảng giá tháng hiện tại',
    status: 'missing',
    blocking: true,
    detail: 'Chưa nhập bảng giá.',
  },
  {
    key: 'nice.to.have',
    label: 'Điều kiện không bắt buộc',
    status: 'warning',
    blocking: false,
    detail: 'Không chặn chạy thật.',
  },
  {
    key: 'already.ready',
    label: 'Điều kiện đã đạt',
    status: 'ready',
    blocking: true,
    detail: 'Đã xong.',
  },
];

const EMPTY: AlertSources = {
  orders: [],
  blockedCapabilities: [],
  readinessChecks: null,
  channel: null,
  navigation: SALE,
};

describe('canh bao chi den tu tin hieu DA CO (Issue #110 §Cảnh báo)', () => {
  it('khong nguon nao thi khong canh bao nao — khong bia mot dong de lap cho trong', () => {
    expect(deriveAlerts(EMPTY)).toEqual([]);
    expect(alertsHeadline([])).toBe('Không có cảnh báo nào đang mở.');
  });

  it('don cho duyet va don cho nhap don vao dung hai nhom viec', () => {
    const alerts = deriveAlerts({
      ...EMPTY,
      orders: [
        dirtyOrder({ id: 'cho-duyet' }),
        dirtyOrder({
          id: 'cho-nhap',
          status: 'sent',
          salesHandoff: {
            action: 'manual_erp_entry',
            status: 'pending',
            createdAt: '2026-09-01T03:00:00.000Z',
          },
        }),
      ],
    });
    expect(alerts.map((alert) => [alert.category, alert.id])).toEqual([
      ['can_duyet', 'can_duyet:cho-duyet'],
      ['can_nhap_don', 'can_nhap_don:cho-nhap'],
    ]);
  });

  it('moi dong viec DAN toi cho lam viec do', () => {
    const [alert] = deriveAlerts({ ...EMPTY, orders: [dirtyOrder({ id: 'ord-9' })] });
    expect(alert!.link).toEqual({
      section: 'approvals',
      selection: 'ord-9',
      label: 'Mở để duyệt',
    });
  });

  it('don DA GUI XONG ma con canh bao van duoc keu — day la don khong ai tung doc', () => {
    const order = dirtyOrder({ id: 'tu-gui', status: 'sent' });
    const alerts = deriveAlerts({
      ...EMPTY,
      orders: [{ ...order, priced: { ...order.priced!, warnings: ['Tổng đơn khách ghi lệch.'] } }],
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.category).toBe('don_can_kiem_tra');
    expect(alerts[0]!.notes).toEqual(['Tổng đơn khách ghi lệch.']);
  });

  it('don DA HUY khong sinh canh bao — khong con viec gi de lam', () => {
    const order = dirtyOrder({ id: 'huy', status: 'rejected' });
    expect(
      deriveAlerts({
        ...EMPTY,
        orders: [{ ...order, priced: { ...order.priced!, warnings: ['Có cảnh báo cũ.'] } }],
      }),
    ).toEqual([]);
  });

  it('khong dem MOT don HAI lan: don dang cho nguoi chi keu o hang cho cua no', () => {
    const order = dirtyOrder({ id: 'cho-duyet' });
    const alerts = deriveAlerts({
      ...EMPTY,
      orders: [{ ...order, priced: { ...order.priced!, warnings: ['Tổng đơn khách ghi lệch.'] } }],
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.category).toBe('can_duyet');
  });
});

describe('du lieu / chinh sach chua san sang', () => {
  it('lay ca nghiep vu khach tu khai lan cong go-live BAT BUOC chua dat', () => {
    const alerts = deriveAlerts({
      ...EMPTY,
      blockedCapabilities: BLOCKED,
      readinessChecks: CHECKS,
    });
    expect(alerts.map((alert) => alert.id)).toEqual([
      'du_lieu_chinh_sach:golive:price.current_period',
      'du_lieu_chinh_sach:tenant:cod_ship',
    ]);
  });

  it('BO dieu kien khong bat buoc va dieu kien da dat', () => {
    const ids = deriveAlerts({ ...EMPTY, readinessChecks: CHECKS }).map((alert) => alert.id);
    expect(ids).not.toContain('du_lieu_chinh_sach:golive:nice.to.have');
    expect(ids).not.toContain('du_lieu_chinh_sach:golive:already.ready');
  });

  it('chua doc duoc cong go-live (`null`) KHAC voi doc duoc va khong con gi', () => {
    expect(deriveAlerts({ ...EMPTY, readinessChecks: null })).toEqual([]);
    expect(deriveAlerts({ ...EMPTY, readinessChecks: [] })).toEqual([]);
    // Nghiep vu khach tu khai van hien du chua doc duoc cong go-live.
    expect(
      deriveAlerts({ ...EMPTY, blockedCapabilities: BLOCKED, readinessChecks: null }),
    ).toHaveLength(1);
  });
});

describe('ket noi / kenh', () => {
  it('che do mock KHONG bi bao dong — do la che do chay khong ket noi, dung co chu dich', () => {
    expect(
      deriveAlerts({
        ...EMPTY,
        channel: { availability: 'available', channelMode: 'mock', zcaState: 'unavailable' },
      }),
    ).toEqual([]);
  });

  it('kenh zca mat phien thi keu, va chi cho toi cho dang nhap lai', () => {
    const alerts = deriveAlerts({
      ...EMPTY,
      channel: { availability: 'available', channelMode: 'zca', zcaState: 'logged_out' },
    });
    expect(alerts.map((alert) => alert.id)).toEqual(['ket_noi_kenh:zca']);
    expect(alerts[0]!.link?.section).toBe('settings');
  });

  it('kenh zca dang ket noi lai thi CHUA keu — do la trang thai binh thuong', () => {
    for (const zcaState of ['ready', 'connecting']) {
      expect(
        deriveAlerts({
          ...EMPTY,
          channel: { availability: 'available', channelMode: 'zca', zcaState },
        }),
      ).toEqual([]);
    }
  });

  it('cau hinh doc tu nguon du phong duoc noi ra, khong im lang', () => {
    const alerts = deriveAlerts({
      ...EMPTY,
      channel: { availability: 'fallback', channelMode: 'zca', zcaState: 'ready' },
    });
    expect(alerts.map((alert) => alert.id)).toEqual(['ket_noi_kenh:availability']);
  });
});

describe('thu tu TAT DINH va cach trinh bay', () => {
  const sources: AlertSources = {
    orders: [
      dirtyOrder({ id: 'moi', createdAt: '2026-09-01T05:00:00.000Z' }),
      dirtyOrder({ id: 'cu', createdAt: '2026-09-01T01:00:00.000Z' }),
    ],
    blockedCapabilities: BLOCKED,
    readinessChecks: CHECKS,
    channel: { availability: 'available', channelMode: 'zca', zcaState: 'logged_out' },
    navigation: SALE,
  };

  it('cung mot bo nguon cho ra cung mot danh sach, cung thu tu — moi lan goi', () => {
    expect(deriveAlerts(sources)).toEqual(deriveAlerts(sources));
  });

  it('viec cua nguoi len truoc, va trong nhom thi thu doi lau nhat nam tren', () => {
    expect(deriveAlerts(sources).map((alert) => alert.id)).toEqual([
      'can_duyet:cu',
      'can_duyet:moi',
      'du_lieu_chinh_sach:golive:price.current_period',
      'du_lieu_chinh_sach:tenant:cod_ship',
      'ket_noi_kenh:zca',
    ]);
  });

  it('gom nhom bo han nhom rong, khong de lai tieu de treo lo lung', () => {
    expect(groupAlerts(deriveAlerts(sources)).map((group) => group.category)).toEqual([
      'can_duyet',
      'du_lieu_chinh_sach',
      'ket_noi_kenh',
    ]);
  });

  it('cau tom tat tach viec cua nguoi khoi tinh trang he thong', () => {
    expect(alertsHeadline(deriveAlerts(sources))).toBe(
      '5 cảnh báo đang mở, trong đó 2 việc cần người xử lý ngay.',
    );
    expect(
      alertsHeadline(deriveAlerts({ ...EMPTY, blockedCapabilities: BLOCKED })),
    ).toBe('1 cảnh báo đang mở.');
  });

  it('khong mang mot truong ky thuat nao vao bang canh bao', () => {
    const keys = new Set(collectKeys(deriveAlerts(sources)));
    for (const forbidden of ENGINEERING_ONLY_KEYS) {
      expect(keys.has(forbidden), `truong "${forbidden}" khong duoc co mat`).toBe(false);
    }
  });
});

/**
 * BAT BIEN DIEU HUONG THEO VAI TRO — bai kiem tra chan hoi quy cho PR #111.
 *
 * Khiem khuyet goc: `Cảnh báo` mo cho `ACCOUNTING`, nhung canh bao "Cần duyệt" van deo mot duong
 * dan toi `approvals` — muc ma chinh vai tro do khong mo duoc bang thanh dieu huong lan bang
 * bookmark. Ke toan bam vao la di thang vao mot luong viec khong phai cua ho.
 */
describe('duong dan cua canh bao phai TRUNG THUC voi vai tro dang xem (PR #111)', () => {
  const orders = [
    dirtyOrder({ id: 'cho-duyet' }),
    dirtyOrder({
      id: 'cho-nhap',
      status: 'sent',
      salesHandoff: {
        action: 'manual_erp_entry',
        status: 'pending',
        createdAt: '2026-09-01T03:00:00.000Z',
      },
    }),
  ];

  function alertsFor(navigation: AlertSources['navigation']) {
    return deriveAlerts({ ...EMPTY, orders, navigation });
  }

  it('KE TOAN van THAY canh bao "Cần duyệt" — do la boi canh doi soat cua ho', () => {
    const approval = alertsFor(ACCOUNTING).find((alert) => alert.category === 'can_duyet');
    expect(approval).toBeDefined();
    expect(approval!.title).toBe('Đại lý Thái Nguyên');
  });

  it('nhung KHONG duoc moi di vao Duyệt & gửi — duong dan bi bo han', () => {
    const approval = alertsFor(ACCOUNTING).find((alert) => alert.category === 'can_duyet')!;
    expect(approval.link).toBeNull();
  });

  it('ke toan VAN giu duong dan toi Đơn hàng — do la viec cua ho', () => {
    const entry = alertsFor(ACCOUNTING).find((alert) => alert.category === 'can_nhap_don')!;
    expect(entry.link).toEqual({ section: 'orders', selection: 'cho-nhap', label: 'Mở đơn' });
  });

  it('SALE / MANAGER / ADMIN van co duong dan vao Duyệt & gửi', () => {
    for (const navigation of [SALE, MANAGER, ADMIN]) {
      const approval = deriveAlerts({ ...EMPTY, orders, navigation }).find(
        (alert) => alert.category === 'can_duyet',
      )!;
      expect(approval.link).toEqual({
        section: 'approvals',
        selection: 'cho-duyet',
        label: 'Mở để duyệt',
      });
    }
  });

  it('che do khong phien (chua biet vai tro) khong giau duong dan nao', () => {
    const approval = alertsFor(ANONYMOUS).find((alert) => alert.category === 'can_duyet')!;
    expect(approval.link?.section).toBe('approvals');
  });

  it('khach TAT nang luc ban hang thi khong ai co duong dan do — ke ca Admin', () => {
    const withoutSales = deriveAlerts({
      ...EMPTY,
      orders,
      navigation: { capabilities: ['messaging', 'notifications', 'operations'], role: 'ADMIN' },
    });
    for (const alert of withoutSales) {
      expect(alert.link?.section).not.toBe('approvals');
      expect(alert.link?.section).not.toBe('orders');
    }
  });

  it('bo duong dan KHONG lam doi noi dung hay thu tu — chi doi mot truong', () => {
    const asSale = alertsFor(SALE);
    const asAccounting = alertsFor(ACCOUNTING);
    expect(asAccounting.map((alert) => alert.id)).toEqual(asSale.map((alert) => alert.id));
    expect(asAccounting.map((alert) => alert.title)).toEqual(asSale.map((alert) => alert.title));
  });
});
