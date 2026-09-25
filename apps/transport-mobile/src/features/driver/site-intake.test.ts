import { describe, expect, it } from 'vitest';
import {
  distanceLine,
  intakeResultLines,
  intakeTarget,
  siteLocationInput,
  toSiteIntakeScreen,
} from './site-intake';
import type { SiteCandidateView, SiteIntakeProposal } from './types';

const SITE: SiteCandidateView = {
  siteId: 's1',
  siteName: 'Kho số 2',
  address: 'Khu công nghiệp',
  counterpartyName: 'Công ty A',
  distanceMetres: 42,
  confidence: 'INSIDE',
};

function proposal(overrides: Partial<SiteIntakeProposal> = {}): SiteIntakeProposal {
  return {
    outcome: 'UNIQUE',
    locationUnusable: null,
    candidates: [SITE],
    truncated: false,
    locationTrust: 'DRIVER_REPORTED',
    openRuns: [],
    canCreate: true,
    ...overrides,
  };
}

describe('toSiteIntakeScreen — thu tu kiem la hop dong', () => {
  it('da co chuyen chua ket thuc thang ca mot kho chac chan', () => {
    const screen = toSiteIntakeScreen(
      proposal({ openRuns: [{ runId: 'r', code: 'VX-1', status: 'ACTIVE' }] }),
    );
    expect(screen.mode).toBe('ACTIVE_RUN');
    expect(screen.canCreate).toBe(false);
  });

  it('vi tri khong dung duoc noi KHAC khong tim thay', () => {
    const screen = toSiteIntakeScreen(
      proposal({
        outcome: 'LOCATION_UNUSABLE',
        locationUnusable: 'ACCURACY_UNUSABLE',
        candidates: [],
      }),
    );
    expect(screen.mode).toBe('LOCATION_UNUSABLE');
    expect(screen.notice).toContain('quá thô');
  });

  it('khong ung vien -> NO_MATCH', () => {
    expect(toSiteIntakeScreen(proposal({ outcome: 'NO_MATCH', candidates: [] })).mode).toBe(
      'NO_MATCH',
    );
  });

  it('mot kho chac chan -> CONFIRM, nhan do tin vi tri', () => {
    const screen = toSiteIntakeScreen(proposal());
    expect(screen.mode).toBe('CONFIRM');
    expect(screen.trustLabel).toBe('Vị trí do máy bạn báo');
    expect(intakeTarget(screen, null)).toBe('s1');
  });

  it('nhieu kho -> CHOOSE, KHONG kho nao chon san', () => {
    const screen = toSiteIntakeScreen(
      proposal({
        outcome: 'AMBIGUOUS',
        candidates: [SITE, { ...SITE, siteId: 's2', confidence: 'NEAR', distanceMetres: 1_250 }],
        truncated: true,
      }),
    );
    expect(screen.mode).toBe('CHOOSE');
    expect(screen.candidates.every((row) => row.preselected === false)).toBe(true);
    expect(screen.candidates[1]).toMatchObject({ uncertain: true, distanceLine: 'cách 1,3 km' });
    expect(intakeTarget(screen, null)).toBeNull();
    expect(intakeTarget(screen, 's2')).toBe('s2');
    expect(intakeTarget(screen, 'khac')).toBeNull();
    expect(screen.notice).not.toBeNull();
  });
});

describe('siteLocationInput — toa do ca hai hoac khong gi', () => {
  it('khong co ban dinh vi -> {}', () => {
    expect(siteLocationInput(null)).toEqual({});
  });
  it('Null Island va toa do hong -> {}', () => {
    expect(siteLocationInput({ latitude: 0, longitude: 0, accuracyMetres: 5 })).toEqual({});
    expect(siteLocationInput({ latitude: Number.NaN, longitude: 105, accuracyMetres: 5 })).toEqual(
      {},
    );
  });
  it('toa do tot -> gui kem sai so', () => {
    expect(siteLocationInput({ latitude: 21, longitude: 105, accuracyMetres: 12 })).toEqual({
      latitude: 21,
      longitude: 105,
      accuracyMetres: 12,
    });
  });
});

describe('ket qua', () => {
  it('diem giao chua biet va vi tri do may bao duoc noi thang; lan phat lai noi ro', () => {
    const lines = intakeResultLines({
      runId: 'r',
      runCode: 'VX-9',
      siteName: 'Kho',
      counterpartyName: 'A',
      locationTrust: 'DRIVER_REPORTED',
      destinationPending: true,
      replayed: true,
    });
    expect(lines.destination).toBe('Chưa xác định — văn phòng bổ sung sau');
    expect(lines.trust).toBe('Do máy bạn báo — chưa có bản định vị làm chứng');
    expect(lines.replay).toBe(
      'Lần bấm này gửi lại đúng lệnh cũ — không có chuyến thứ hai nào được tạo.',
    );
  });
  it('khoang cach doc duoc', () => {
    expect(distanceLine(42.4)).toBe('cách 42 m');
  });
});
