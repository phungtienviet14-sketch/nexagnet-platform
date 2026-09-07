import { describe, expect, it } from 'vitest';
import {
  assessObservationRisk,
  clockSkewSeconds,
  highestSeverity,
  type RiskAssessmentInput,
} from './risk-assessment.js';
import { DEFAULT_TRANSPORT_PROOF_POLICY } from './tracking-policy.js';

const POLICY = DEFAULT_TRANSPORT_PROOF_POLICY;
const HANOI = { latitude: 21.0285, longitude: 105.8542 };
const HAIPHONG = { latitude: 20.8449, longitude: 106.6881 };
const T0 = new Date('2026-09-07T03:00:00Z');

const at = (offsetSeconds: number): Date => new Date(T0.getTime() + offsetSeconds * 1000);

const base = (overrides: Partial<RiskAssessmentInput> = {}): RiskAssessmentInput => ({
  point: HANOI,
  accuracyMetres: 8,
  capturedAt: T0,
  receivedAt: T0,
  mockLocationReported: false,
  deviceIntegrity: 'BASIC',
  previous: null,
  ...overrides,
});

const codes = (input: RiskAssessmentInput): string[] =>
  [...assessObservationRisk(input, POLICY)].map((finding) => finding.code).sort();

/**
 * PROOF-010 — cham rui ro cho mot ban dinh vi.
 *
 * Bai dat nhat cua ca bo nay la bai "khong to oan mot chiec xe dang do". Mot he thong canh bao
 * qua nhieu KHONG an toan hon mot he canh bao it: no chi don gian la bi tat, va sau khi bi tat
 * thi no khong con phat hien duoc gi nua. Nen o day co ca cac bai kiem dieu NGUOC LAI — kiem rang
 * mot so tinh huong KHONG sinh ra co nao.
 */
describe('Cham rui ro mot ban dinh vi — PROOF-010', () => {
  it('mot ban dinh vi sach thi KHONG sinh co nao', () => {
    expect(assessObservationRisk(base(), POLICY)).toEqual([]);
    expect(highestSeverity([])).toBeNull();
  });

  it('sai so lon thi ghi INFO, khong lam phien nguoi truc', () => {
    const findings = assessObservationRisk(base({ accuracyMetres: 450 }), POLICY);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe('ACCURACY_POOR');
    expect(findings[0]?.severity).toBe('INFO');
  });

  it('khong bao sai so la mot co RIENG — cau hoi ve ung dung, khong ve bau troi', () => {
    expect(codes(base({ accuracyMetres: null }))).toEqual(['ACCURACY_UNKNOWN']);
  });

  it('thiet bi TU BAO vi tri gia lap thi day len REVIEW', () => {
    const findings = assessObservationRisk(base({ mockLocationReported: true }), POLICY);
    expect(findings[0]?.code).toBe('MOCK_LOCATION_REPORTED');
    expect(findings[0]?.severity).toBe('REVIEW');
  });

  it('KHONG co co gia lap thi khong chung minh dieu gi — va cung khong sinh co nao', () => {
    expect(codes(base({ mockLocationReported: null }))).toEqual([]);
    expect(codes(base({ mockLocationReported: false }))).toEqual([]);
  });

  it('toan ven thiet bi khong chung minh duoc chi la INFO — nhieu may that cung vay', () => {
    const findings = assessObservationRisk(base({ deviceIntegrity: 'UNVERIFIED' }), POLICY);
    expect(findings[0]?.code).toBe('DEVICE_INTEGRITY_UNVERIFIED');
    expect(findings[0]?.severity).toBe('INFO');
  });

  it('CHUA HOI toan ven (`UNKNOWN`) khong phai la mot co', () => {
    expect(codes(base({ deviceIntegrity: 'UNKNOWN' }))).toEqual([]);
  });

  it('lech dong ho lon duoc GHI chu khong tu choi — thuong chi la may vua offline', () => {
    const findings = assessObservationRisk(
      base({ capturedAt: at(-4 * 3600), receivedAt: T0 }),
      POLICY,
    );
    expect(findings[0]?.code).toBe('CLOCK_SKEW_EXCEEDED');
    expect(findings[0]?.severity).toBe('INFO');
    expect(findings[0]?.detail.clockSkewSeconds).toBe(-14_400);
  });

  it('lech dong ho theo chieu TUONG LAI cung bi bat', () => {
    expect(codes(base({ capturedAt: at(3600), receivedAt: T0 }))).toContain('CLOCK_SKEW_EXCEEDED');
  });

  it('lech nho hon nguong thi im lang', () => {
    expect(codes(base({ capturedAt: at(-120), receivedAt: T0 }))).toEqual([]);
  });

  it('XE DANG DO voi tin hieu nhieu KHONG bi to la dich chuyen tuc thoi', () => {
    const drifted = { latitude: HANOI.latitude + 0.00054, longitude: HANOI.longitude };
    const findings = assessObservationRisk(
      base({
        point: drifted,
        accuracyMetres: 40,
        capturedAt: at(0.5),
        receivedAt: at(0.5),
        previous: { point: HANOI, accuracyMetres: 40, capturedAt: T0 },
      }),
      POLICY,
    );
    expect(findings).toEqual([]);
  });

  it('dich chuyen THAT thi len REVIEW, vi no song sot qua phep tru sai so', () => {
    const findings = assessObservationRisk(
      base({
        point: HAIPHONG,
        accuracyMetres: 100,
        capturedAt: at(60),
        receivedAt: at(60),
        previous: { point: HANOI, accuracyMetres: 100, capturedAt: T0 },
      }),
      POLICY,
    );
    const speed = findings.find((finding) => finding.code === 'IMPLAUSIBLE_SPEED');
    expect(speed?.severity).toBe('REVIEW');
    expect(speed?.detail.effectiveDistanceMetres).toBeGreaterThan(80_000);
  });

  it('khoang trong dai la INFO — mat song la chuyen thuong', () => {
    const findings = assessObservationRisk(
      base({
        point: HAIPHONG,
        capturedAt: at(20_000),
        receivedAt: at(20_000),
        previous: { point: HANOI, accuracyMetres: 8, capturedAt: T0 },
      }),
      POLICY,
    );
    const gap = findings.find((finding) => finding.code === 'LARGE_TIME_GAP');
    expect(gap?.severity).toBe('INFO');
    expect(findings.map((finding) => finding.code)).not.toContain('IMPLAUSIBLE_SPEED');
  });

  it('dau thoi gian khong tien len duoc ghi rieng', () => {
    expect(
      codes(
        base({
          point: HAIPHONG,
          previous: { point: HANOI, accuracyMetres: 8, capturedAt: T0 },
        }),
      ),
    ).toContain('TIMESTAMP_NOT_ADVANCING');
  });

  it('toa do ngoai khung hoat dong len REVIEW', () => {
    const findings = assessObservationRisk(
      base({ point: { latitude: 38.5, longitude: -98.0 } }),
      POLICY,
    );
    const outside = findings.find((finding) => finding.code === 'OUTSIDE_OPERATING_AREA');
    expect(outside?.severity).toBe('REVIEW');
  });

  it('nhieu van de cung luc thi GHI HET, khong nuot ma nao', () => {
    const found = codes(
      base({
        point: { latitude: 38.5, longitude: -98.0 },
        accuracyMetres: null,
        mockLocationReported: true,
        deviceIntegrity: 'UNVERIFIED',
        capturedAt: at(-9_000),
        receivedAt: T0,
      }),
    );
    expect(found).toEqual([
      'ACCURACY_UNKNOWN',
      'CLOCK_SKEW_EXCEEDED',
      'DEVICE_INTEGRITY_UNVERIFIED',
      'MOCK_LOCATION_REPORTED',
      'OUTSIDE_OPERATING_AREA',
    ]);
  });

  it('muc cao nhat lay REVIEW khi co it nhat mot REVIEW', () => {
    expect(highestSeverity([{ code: 'ACCURACY_POOR', severity: 'INFO', detail: {} }])).toBe('INFO');
    expect(
      highestSeverity([
        { code: 'ACCURACY_POOR', severity: 'INFO', detail: {} },
        { code: 'IMPLAUSIBLE_SPEED', severity: 'REVIEW', detail: {} },
      ]),
    ).toBe('REVIEW');
  });
});

describe('Lech dong ho — PROOF-011', () => {
  it('am khi may khach cham hon may chu', () => {
    expect(clockSkewSeconds(at(-90), T0)).toBe(-90);
  });

  it('duong khi may khach nhanh hon may chu', () => {
    expect(clockSkewSeconds(at(90), T0)).toBe(90);
  });

  it('bang 0 khi hai dong ho khop', () => {
    expect(clockSkewSeconds(T0, T0)).toBe(0);
  });
});
