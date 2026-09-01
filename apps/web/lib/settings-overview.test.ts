import { describe, expect, it } from 'vitest';
import { buildPricePeriodBoard } from './price-period-view';
import {
  buildOverviewCards,
  formatMonth,
  outstandingWork,
  overviewHeadline,
} from './settings-overview';
import { parseSettingsSummary, type ReadinessView, type SettingsSummary } from './settings';

const READY_SUMMARY = parseSettingsSummary({
  channelMode: 'zca',
  zca: { state: 'ready' },
  autoSend: false,
  orderAutomation: { enabled: true, maxAutoConfirmQuantity: 50 },
  sourceTruth: { productCount: 19, dealerCount: 2 },
  groups: [
    { id: 'g1', name: 'Nhom da map', status: 'mapped', allowed: true },
    { id: 'g2', name: 'Nhom chua map', status: 'pending', allowed: true },
  ],
});

function board(periods: Parameters<typeof buildPricePeriodBoard>[0]['periods']) {
  return buildPricePeriodBoard({
    currentMonth: '2026-09',
    currentPeriodId: null,
    missingCurrentPeriod: true,
    periods,
  });
}

function overview(input: {
  summary?: SettingsSummary;
  board?: ReturnType<typeof board> | null;
  readiness?: ReadinessView | null;
  blocked?: ReadonlyArray<{ key: string; label: string; reason: string }>;
  rbacEnforced?: boolean;
}) {
  return buildOverviewCards({
    summary: input.summary ?? READY_SUMMARY,
    board: input.board ?? null,
    readiness: input.readiness ?? null,
    blockedCapabilities: input.blocked ?? [],
    canConfigure: true,
    rbacEnforced: input.rbacEnforced ?? true,
  });
}

describe('man Tong quan tra loi ba cau', () => {
  it('viec dang chan ban hang duoc dua len dau, viec on nam sau', () => {
    const cards = overview({ board: board([]) });

    expect(cards[0]?.status).toBe('blocked');
    expect(cards.at(-1)?.status).toBe('ok');
  });

  it('thieu bang gia chinh thuc la mot cau tieng Viet + mot nut dan thang toi cho sua', () => {
    const card = overview({ board: board([]) }).find((entry) => entry.key === 'price');

    expect(card?.status).toBe('blocked');
    expect(card?.title).toBe('Bảng giá tháng 09/2026');
    expect(card?.detail).toMatch(/chuyển về cho Sale/i);
    expect(card?.action).toEqual({ label: 'Thiết lập bảng giá', section: 'products-pricing' });
  });

  it('chi co bang gia chay thu thi VAN bao la chua co bang gia chinh thuc', () => {
    const card = overview({
      board: board([
        {
          id: 'test',
          validMonth: '2026-09',
          status: 'active',
          source: 'test_only',
          prices: [{ sku: 'FELIX', wholesale: 1_250_000 }],
        },
      ]),
    }).find((entry) => entry.key === 'price');

    expect(card?.status).toBe('blocked');
    expect(card?.detail).toMatch(/chỉ có một bảng giá để chạy thử/i);
  });

  it('co bang gia chinh thuc thi bao la dang ap dung', () => {
    const card = overview({
      board: board([
        {
          id: 'official',
          validMonth: '2026-09',
          status: 'active',
          source: 'operator',
          prices: [{ sku: 'FELIX', wholesale: 1_250_000 }],
        },
      ]),
    }).find((entry) => entry.key === 'price');

    expect(card?.status).toBe('ok');
    expect(card?.detail).toMatch(/1 mặt hàng/);
  });

  it('dem so nhom chua gan dai ly va dan thang toi man gan', () => {
    const card = overview({}).find((entry) => entry.key === 'groups');

    expect(card?.title).toBe('1 nhóm chưa gán đại lý');
    expect(card?.action?.section).toBe('dealers-groups');
  });

  it('tu dong gui dang tat duoc noi la trang thai an toan, khong phai loi', () => {
    const card = overview({}).find((entry) => entry.key === 'auto-send');

    expect(card?.status).toBe('off');
    expect(card?.detail).toMatch(/trạng thái an toàn/i);
    expect(outstandingWork(overview({}))).not.toContainEqual(card);
  });

  it('nang luc khach khai la chua san sang hien nguyen van ly do cua khach', () => {
    const card = overview({
      blocked: [{ key: 'cod_ship', label: 'COD và cước vận chuyển', reason: 'Chưa có bảng phí.' }],
    }).find((entry) => entry.key === 'blocked:cod_ship');

    expect(card?.title).toBe('COD và cước vận chuyển: chưa sẵn sàng');
    expect(card?.detail).toBe('Chưa có bảng phí.');
  });
});

describe('khong bay ma ly do cua may ra mat truoc', () => {
  const readiness: ReadinessView = {
    codeComplete: true,
    goLiveReady: false,
    checkedAt: '',
    reasons: [],
    checks: [
      {
        key: 'dealers.configured',
        label: 'Đại lý đã cấu hình',
        status: 'missing',
        blocking: true,
        detail: 'missing_dealers',
      },
    ],
  };

  it('ma ly do chi nam trong phan chi tiet ky thuat, khong nam o cau chinh', () => {
    const card = overview({ readiness }).find(
      (entry) => entry.key === 'readiness:dealers.configured',
    );

    expect(card?.detail).not.toMatch(/missing_dealers/);
    expect(card?.detail).toMatch(/Chưa khai đại lý nào/);
    expect(card?.technicalDetail).toMatch(/missing_dealers/);
  });

  it('khong noi hai lan ve bang gia khi da co the bang gia rieng', () => {
    const cards = overview({
      board: board([]),
      readiness: {
        ...readiness,
        checks: [
          {
            key: 'price.current_period',
            label: 'Bảng giá tháng hiện hành',
            status: 'missing',
            blocking: true,
            detail: 'missing_current_price_period',
          },
        ],
      },
    });

    expect(cards.filter((card) => card.title.startsWith('Bảng giá'))).toHaveLength(1);
  });

  it('khong anh xa duoc sang viec khach tu lam thi khong bia ra mot cai nut vo dung', () => {
    const cards = overview({
      readiness: {
        ...readiness,
        checks: [
          {
            key: 'media.production',
            label: 'Kho media production',
            status: 'missing',
            blocking: true,
            detail: 'media_not_production_ready',
          },
        ],
      },
    });

    expect(cards.some((card) => card.key.startsWith('readiness:media'))).toBe(false);
  });
});

describe('phan quyen tat la mot su that phai noi ra', () => {
  it('bao thang la may chu dang khong kiem tra quyen', () => {
    const card = overview({ rbacEnforced: false }).find((entry) => entry.key === 'rbac');

    expect(card?.status).toBe('attention');
    expect(card?.detail).toMatch(/không kiểm tra quyền/i);
  });

  it('khi da bat dang nhap thi khong con canh bao do', () => {
    expect(overview({ rbacEnforced: true }).some((card) => card.key === 'rbac')).toBe(false);
  });
});

describe('cau tra loi mot dong', () => {
  it('dem dung so viec dang chan', () => {
    const headline = overviewHeadline(overview({ board: board([]) }));

    expect(headline.tone).toBe('blocked');
    expect(headline.title).toMatch(/^Có 1 việc đang chặn bán hàng$/);
  });

  it('khong con viec nao thi noi ro la khong co viec nao', () => {
    const headline = overviewHeadline(
      overview({
        summary: parseSettingsSummary({
          channelMode: 'zca',
          zca: { state: 'ready' },
          autoSend: true,
          orderAutomation: { enabled: true, maxAutoConfirmQuantity: 50 },
          groups: [{ id: 'g1', name: 'Nhom da map', status: 'mapped', allowed: true }],
        }),
        board: board([
          {
            id: 'official',
            validMonth: '2026-09',
            status: 'active',
            source: 'operator',
            prices: [{ sku: 'FELIX', wholesale: 1_250_000 }],
          },
        ]),
      }),
    );

    expect(headline.tone).toBe('ok');
    expect(headline.title).toMatch(/hoạt động bình thường/i);
  });
});

describe('doc thang cho nguoi', () => {
  it('2026-09 doc la thang 09/2026', () => {
    expect(formatMonth('2026-09')).toBe('tháng 09/2026');
    expect(formatMonth('')).toBe('');
  });
});
