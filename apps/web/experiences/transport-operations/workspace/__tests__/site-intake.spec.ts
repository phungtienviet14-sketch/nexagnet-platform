import { describe, expect, it } from 'vitest';
import type { SiteIntakeProposal } from '../../transport-types';
import { toSiteIntakeScreen, SITE_INTAKE_LOCATION_HINTS } from '../site-intake';

/**
 * MAN HINH NHAN VIEC TAI A — `#267` H6.
 *
 * Man hinh nay quyet dinh MOT dieu: lai xe nhin thay nut gi. Ba lua chon, va chung loai tru nhau:
 *
 *   `Tao chuyen`             — dung mot dia diem, chac chan, va chua co chuyen nao dang chay;
 *   chon trong danh sach     — nhieu dia diem hop ly, hoac mot dia diem chi "co the";
 *   `Ghi nhan da den`        — da co chuyen chua ket thuc.
 *
 * Ep ba thu do vao mot ham THUAN, tach khoi React: mot bai kiem doc duoc bang chu la cach duy nhat
 * de "khong bao gio tu tao" con doc duoc sau ba lan sua giao dien.
 */

const proposal = (over: Partial<SiteIntakeProposal> = {}): SiteIntakeProposal => ({
  outcome: 'NO_MATCH',
  locationUnusable: null,
  candidates: [],
  truncated: false,
  locationTrust: 'DRIVER_REPORTED',
  openRuns: [],
  canCreate: false,
  ...over,
});

const site = (id: string, name: string, company = 'Cong ty ABC') => ({
  siteId: id,
  siteName: name,
  address: 'KCN Dinh Vu',
  counterpartyId: `${id}-party`,
  counterpartyName: company,
  distanceMetres: 42,
  confidence: 'INSIDE' as const,
});

describe('toSiteIntakeScreen — `#267` H6', () => {
  it('mot dia diem chac chan -> the xac nhan, kem hai dong cong ty/kho', () => {
    const screen = toSiteIntakeScreen(
      proposal({
        outcome: 'UNIQUE',
        candidates: [site('s1', 'Kho Hai Phong')],
        canCreate: true,
      }),
    );

    expect(screen.mode).toBe('CONFIRM');
    expect(screen.headline).toBe('Bạn đang ở');
    expect(screen.candidates[0]?.companyLine).toBe('Cong ty ABC');
    expect(screen.candidates[0]?.siteLine).toBe('Kho Hai Phong');
    expect(screen.primaryLabel).toBe('Tạo chuyến');
    expect(screen.canCreate).toBe(true);
  });

  /**
   * `#267` H6: *"Never show a random first candidate as selected truth."* Nen o che do chon, KHONG
   * ung vien nao duoc danh dau san.
   */
  it('nhieu dia diem -> danh sach, va KHONG cai nao duoc chon san', () => {
    const screen = toSiteIntakeScreen(
      proposal({
        outcome: 'AMBIGUOUS',
        candidates: [site('s1', 'Kho A'), site('s2', 'Kho B')],
        canCreate: true,
      }),
    );

    expect(screen.mode).toBe('CHOOSE');
    expect(screen.headline).toBe('Bạn đang ở gần mấy nơi — chọn đúng nơi bạn đang đứng');
    expect(screen.candidates).toHaveLength(2);
    expect(screen.candidates.every((row) => row.preselected === false)).toBe(true);
  });

  it('danh sach bi cat thi NOI RA, khong im lang', () => {
    const screen = toSiteIntakeScreen(
      proposal({
        outcome: 'AMBIGUOUS',
        candidates: [site('s1', 'Kho A'), site('s2', 'Kho B')],
        truncated: true,
        canCreate: true,
      }),
    );
    expect(screen.notice).toContain('còn nơi khác');
  });

  /**
   * `#267` H3/H6 — bai quan trong nhat cua man hinh nay: da co chuyen thi KHONG hien `Tao chuyen`.
   */
  it('da co chuyen chua ket thuc -> `Ghi nhan da den`, KHONG phai `Tao chuyen`', () => {
    const screen = toSiteIntakeScreen(
      proposal({
        outcome: 'UNIQUE',
        candidates: [site('s1', 'Kho Hai Phong')],
        openRuns: [{ runId: 'r1', code: 'RUN-A260909-K3P7QM', status: 'PLANNED' }],
        canCreate: false,
      }),
    );

    expect(screen.mode).toBe('ACTIVE_RUN');
    expect(screen.primaryLabel).toBe('Ghi nhận đã đến / chụp giấy vào');
    expect(screen.canCreate).toBe(false);
    // Van noi duoc lai xe dang o dau — man hinh in ca hai dong.
    expect(screen.candidates[0]?.siteLine).toBe('Kho Hai Phong');
    expect(screen.openRuns[0]?.code).toBe('RUN-A260909-K3P7QM');
  });

  it('chuyen dang chay THANG ca khi vi tri khong nhan ra noi nao', () => {
    const screen = toSiteIntakeScreen(
      proposal({
        outcome: 'NO_MATCH',
        openRuns: [{ runId: 'r1', code: 'RUN-1', status: 'ACTIVE' }],
      }),
    );
    expect(screen.mode).toBe('ACTIVE_RUN');
  });

  it('khong nhan ra noi nao -> noi that, va khong co nut tao', () => {
    const screen = toSiteIntakeScreen(proposal({ outcome: 'NO_MATCH' }));
    expect(screen.mode).toBe('NO_MATCH');
    expect(screen.canCreate).toBe(false);
  });

  /**
   * `LOCATION_UNUSABLE` phai doc ra KHAC `NO_MATCH`. Gop hai thu se noi "khong nhan ra kho nao"
   * trong khi su that la "may chua bat dinh vi xong", va lai xe se di tim mot cai nut khong ton tai.
   */
  it.each(['COORDINATE_INVALID', 'ACCURACY_UNUSABLE', 'LOCATION_STALE'] as const)(
    'vi tri khong dung duoc (%s) doc ra khac han "khong tim thay"',
    (reason) => {
      const screen = toSiteIntakeScreen(
        proposal({ outcome: 'LOCATION_UNUSABLE', locationUnusable: reason }),
      );

      expect(screen.mode).toBe('LOCATION_UNUSABLE');
      expect(screen.notice).toBe(SITE_INTAKE_LOCATION_HINTS[reason]);
      expect(screen.notice).not.toContain('Không nhận ra');
      expect(screen.canCreate).toBe(false);
    },
  );

  /**
   * Suc nang cua vi tri phai HIEN RA. Mot lan nhan viec khong co ban dinh vi la mot su that ma
   * nguoi doi soat sau nay can doc duoc, nen man hinh noi truoc thay vi giau di.
   */
  it('nhan tin cay cua vi tri duoc noi ra tren man hinh', () => {
    const bound = toSiteIntakeScreen(
      proposal({
        outcome: 'UNIQUE',
        candidates: [site('s1', 'Kho A')],
        canCreate: true,
        locationTrust: 'SERVER_BOUND',
      }),
    );
    const reported = toSiteIntakeScreen(
      proposal({ outcome: 'UNIQUE', candidates: [site('s1', 'Kho A')], canCreate: true }),
    );

    expect(bound.trustLabel).toBe('Vị trí đã xác thực');
    expect(reported.trustLabel).toBe('Vị trí do máy bạn báo');
  });

  it('khoang cach hien ra doc duoc, khong phai mot so tho', () => {
    const screen = toSiteIntakeScreen(
      proposal({
        outcome: 'UNIQUE',
        candidates: [{ ...site('s1', 'Kho A'), distanceMetres: 1_250 }],
        canCreate: true,
      }),
    );
    expect(screen.candidates[0]?.distanceLine).toBe('cách 1,3 km');
  });

  it('ung vien "co the" duoc danh dau la chua chac', () => {
    const screen = toSiteIntakeScreen(
      proposal({
        outcome: 'AMBIGUOUS',
        candidates: [{ ...site('s1', 'Kho A'), confidence: 'NEAR' }],
        canCreate: true,
      }),
    );
    expect(screen.candidates[0]?.uncertain).toBe(true);
  });
});
