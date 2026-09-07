import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ACCURACY_POLICY,
  gradeAccuracy,
  isEvidenceGradeAccuracy,
} from './location-quality.js';

/**
 * GEO-040 — phan hang do chinh xac.
 *
 * `UNKNOWN` KHONG duoc gop vao `POOR`. Hai thu do dan toi hai viec khac han: `POOR` la mot cau
 * hoi ve BAU TROI (di ra cho thoang, cho mot lat); `UNKNOWN` la mot cau hoi ve UNG DUNG (phien
 * ban nao, sao no khong gui truong nay?). Gop lai thi mot ung dung bi sua de bo truong `accuracy`
 * se trong y het mot chiec xe dang do trong ham.
 */
describe('Phan hang do chinh xac — GEO-040', () => {
  it('cac moc cua thang do', () => {
    expect(gradeAccuracy(3)).toBe('FINE');
    expect(gradeAccuracy(25)).toBe('FINE');
    expect(gradeAccuracy(25.1)).toBe('COARSE');
    expect(gradeAccuracy(100)).toBe('COARSE');
    expect(gradeAccuracy(100.1)).toBe('POOR');
    expect(gradeAccuracy(2_000)).toBe('POOR');
  });

  it('khong bao thi la UNKNOWN, khong phai POOR', () => {
    expect(gradeAccuracy(null)).toBe('UNKNOWN');
    expect(gradeAccuracy(undefined)).toBe('UNKNOWN');
    expect(gradeAccuracy(Number.NaN)).toBe('UNKNOWN');
  });

  it('sai so AM la mot con so vo nghia — UNKNOWN, khong phai FINE', () => {
    expect(gradeAccuracy(-1)).toBe('UNKNOWN');
  });

  it('nguong doi duoc theo khach ma khong dong vao thang do', () => {
    const strict = { fineMaxMetres: 10, coarseMaxMetres: 30 };
    expect(gradeAccuracy(20, strict)).toBe('COARSE');
    expect(gradeAccuracy(20, DEFAULT_ACCURACY_POLICY)).toBe('FINE');
  });

  it('chi FINE va COARSE moi dung lam bang chung', () => {
    expect(isEvidenceGradeAccuracy('FINE')).toBe(true);
    expect(isEvidenceGradeAccuracy('COARSE')).toBe(true);
    expect(isEvidenceGradeAccuracy('POOR')).toBe(false);
    expect(isEvidenceGradeAccuracy('UNKNOWN')).toBe(false);
  });
});
