import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CONFLICT_STATUSES,
  evaluateConflictResolution,
  INITIAL_CONFLICT_STATUS,
  isBlockingConflictStatus,
  type ConflictResolutionContext,
} from './conflict-lifecycle.js';

const complete: ConflictResolutionContext = {
  actor: 'product-owner',
  evidenceRef: 'mail khach 29/08/2026',
  winningFactId: 'fact-a',
  competingFactIds: ['fact-a', 'fact-b'],
};

describe('xung dot mac dinh la MO va dang chan', () => {
  it('mo ra la OPEN', () => {
    expect(INITIAL_CONFLICT_STATUS).toBe('OPEN');
    expect(isBlockingConflictStatus('OPEN')).toBe(true);
  });

  it('moi trang thai da dong thi khong con chan', () => {
    for (const status of CONFLICT_STATUSES) {
      if (status === 'OPEN') continue;
      expect(isBlockingConflictStatus(status)).toBe(false);
    }
  });
});

describe('dong xung dot phai co BANG CHUNG TUONG MINH', () => {
  it('khong biet ai chot -> tu choi', () => {
    expect(evaluateConflictResolution('OPEN', { ...complete, actor: null })).toEqual({
      allowed: false,
      reason: 'CONFLICT_ACTOR_MISSING',
    });
  });

  // Ma quan trong nhat cua tep nay: no chan hanh vi "dong xung dot cho sach bang" truoc go-live.
  it('khong co dan chung -> tu choi', () => {
    expect(evaluateConflictResolution('OPEN', { ...complete, evidenceRef: '   ' })).toEqual({
      allowed: false,
      reason: 'CONFLICT_EVIDENCE_MISSING',
    });
  });

  it('chua chi ra ben nao thang -> tu choi', () => {
    expect(evaluateConflictResolution('OPEN', { ...complete, winningFactId: null }).reason).toBe(
      'CONFLICT_WINNER_MISSING',
    );
  });

  it('chon mot ben KHONG nam trong cac ben tranh chap -> tu choi', () => {
    expect(
      evaluateConflictResolution('OPEN', { ...complete, winningFactId: 'fact-ngoai-luong' }),
    ).toEqual({ allowed: false, reason: 'CONFLICT_WINNER_NOT_COMPETING' });
  });

  it('du ca bon thi ghi nhan duoc', () => {
    expect(evaluateConflictResolution('OPEN', complete)).toEqual({
      allowed: true,
      reason: 'CONFLICT_RESOLUTION_RECORDED',
    });
  });

  it('xung dot da dong thi khong dong lai lan nua', () => {
    expect(evaluateConflictResolution('RESOLVED', complete).reason).toBe(
      'CONFLICT_ALREADY_TERMINAL',
    );
  });
});

/**
 * BON CACH CHON NGAM BI CAM.
 *
 * Bai duoi day khong khang dinh mot ket qua — no khang dinh mot CAU TRUC: ham dong xung dot
 * KHONG NHIN THAY nhung du lieu ma no co the len dua vao de tu quyet. Do la cach duy nhat kiem
 * duoc mot dieu "khong bao gio xay ra": neu chi test hanh vi, thi mot ban sau them mot nhanh
 * `if (moi hon) return thang` van xanh het moi bai o tren.
 *
 * `ConflictResolutionContext` co dung bon truong, va khong truong nao la ngay thang, tham quyen,
 * hay goi y cua he thong.
 */
describe('khong co ke thang im lang — khoa bang cau truc', () => {
  const source = readFileSync(
    fileURLToPath(new URL('./conflict-lifecycle.ts', import.meta.url)),
    'utf8',
  );
  const body = source.slice(source.indexOf('export function evaluateConflictResolution'));

  it.each([
    ['ngay thang', /\b(date|Date|receivedAt|effectiveFrom|newer|latest)\b/, 'const newer = a.receivedAt;'],
    ['tham quyen', /\b(authority|Authority|L1_|L2_)\b/, 'if (a.authority === "L1_CONTRACTUAL") return a;'],
    ['goi y cua he thong', /\b(recommend|Recommend|suggested)\w*/, 'return conflict.recommendedFactId;'],
    ['phan xu bang LLM', /\b(llm|LLM|model|prompt)\b/, 'await llm.judge(prompt);'],
  ])('than ham khong he nhac toi %s', (_label, pattern, wouldMatch) => {
    // Doi chung TRUOC: mot bai "khong khop" se xanh vinh vien neu bieu thuc bi viet hong. Dong
    // nay chung minh bieu thuc CON BAT DUOC thu no di tim, roi moi khang dinh than ham khong co.
    expect(wouldMatch).toMatch(pattern);
    expect(body).not.toMatch(pattern);
  });

  it('ngu canh quyet dinh chi co dung bon truong', () => {
    expect(Object.keys(complete).sort()).toEqual([
      'actor',
      'competingFactIds',
      'evidenceRef',
      'winningFactId',
    ]);
  });

  // Hai ban ghi CUNG NGAY (hinh dang that cua `CONFLICT-PRICE-SOURCE-001` o Ultty: hai tep gia
  // cung ngay 18/08) van phai la mot xung dot phai co nguoi chot — khong co truong nao de "ngay
  // moi hon" thang, va o day cung khong co ngay nao ca.
  it('hai ben ngang nhau van doi mot quyet dinh cua nguoi', () => {
    expect(
      evaluateConflictResolution('OPEN', {
        actor: null,
        evidenceRef: null,
        winningFactId: null,
        competingFactIds: ['gia-pdf', 'gia-sheets'],
      }).allowed,
    ).toBe(false);
  });
});
