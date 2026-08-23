import { describe, expect, it } from 'vitest';
import {
  WORKFLOW_DISPATCH_FAILURES,
  WORKFLOW_DISPATCH_FAILURE_LABELS,
  classifyDispatchFailure,
  formatDispatchFailure,
} from './workflow-dispatch-failures.js';

/**
 * W11 — mot cong nghiep vu co N duong hong thi phai PHAN BIET duoc N ly do.
 *
 * Cac chuoi loi duoi day KHONG bia ra: chung lay tu loi THAT bat duoc luc chay engine that
 * (`workflow-recovery.int.spec.ts`, 23/08/2026). Mot bo phan loai duoc kiem bang cac chuoi tu
 * nghi ra se xanh tren giay va vo dung luc 3 gio sang.
 */
describe('phan loai loi gui sang engine', () => {
  it('moi ma deu co nhan tieng Viet — khong ma nao lot ra ngoai bang', () => {
    for (const reason of WORKFLOW_DISPATCH_FAILURES) {
      expect(WORKFLOW_DISPATCH_FAILURE_LABELS[reason]).toBeTruthy();
    }
    expect(Object.keys(WORKFLOW_DISPATCH_FAILURE_LABELS).sort()).toEqual(
      [...WORKFLOW_DISPATCH_FAILURES].sort(),
    );
  });

  it('engine dang tat -> ENGINE_UNAVAILABLE, thu lai duoc', () => {
    // Chuoi that, sao nguyen tu log cua `docker compose stop hatchet-engine`.
    const real =
      '/WorkflowService/TriggerWorkflow UNAVAILABLE: No connection established. ' +
      'Last error: Error: connect ECONNREFUSED ::1:7744.';
    const classified = classifyDispatchFailure(new Error(real));
    expect(classified.reason).toBe('ENGINE_UNAVAILABLE');
    expect(classified.retryable).toBe(true);
  });

  it('het gio SAU khi gui -> ENGINE_TRIGGER_AMBIGUOUS, tach rieng khoi "khong noi duoc"', () => {
    // Khac biet nay khong phai chuyen chu nghia: o `ENGINE_UNAVAILABLE` thi chac chan engine
    // chua nhan; o day thi CO THE da nhan, va thu lai se tao run thu hai. Da do duoc dieu do.
    const classified = classifyDispatchFailure(
      new Error('14 DEADLINE_EXCEEDED: Deadline exceeded'),
    );
    expect(classified.reason).toBe('ENGINE_TRIGGER_AMBIGUOUS');
    expect(classified.retryable).toBe(true);
  });

  it('token sai -> ENGINE_AUTH_REJECTED, va KHONG thu lai', () => {
    const classified = classifyDispatchFailure(new Error('16 UNAUTHENTICATED: invalid token'));
    expect(classified.reason).toBe('ENGINE_AUTH_REJECTED');
    // Thu lai mot token sai la lang phi vong lap va lam nhieu log — no se sai y het o lan sau.
    expect(classified.retryable).toBe(false);
  });

  it('engine chua biet ten workflow -> WORKFLOW_VERSION_UNAVAILABLE, khong bi nham thanh mat ket noi', () => {
    // Bay: thong bao nay co the kem ca chu UNAVAILABLE. Thu tu kiem phai dat no TRUOC.
    const classified = classifyDispatchFailure(
      new Error('could not find workflow integration-handoff.v3: UNAVAILABLE'),
    );
    expect(classified.reason).toBe('WORKFLOW_VERSION_UNAVAILABLE');
  });

  it('loi la -> ENGINE_TRIGGER_FAILED va van thu lai', () => {
    const classified = classifyDispatchFailure(new Error('mot chuyen chua tung thay'));
    expect(classified.reason).toBe('ENGINE_TRIGGER_FAILED');
    // Doan sai theo huong "thu lai" ton mot vong lap; doan sai theo huong "bo" lam MAT mot don.
    expect(classified.retryable).toBe(true);
  });

  it('gia tri khong phai Error van phan loai duoc, khong nem', () => {
    expect(classifyDispatchFailure('ECONNREFUSED').reason).toBe('ENGINE_UNAVAILABLE');
    expect(classifyDispatchFailure(undefined).reason).toBe('ENGINE_TRIGGER_FAILED');
  });

  it('chuoi ghi vao lastError dat MA len dau — de loc duoc bang mot cau SELECT', () => {
    const line = formatDispatchFailure(
      classifyDispatchFailure(new Error('ECONNREFUSED 127.0.0.1')),
    );
    expect(line.startsWith('ENGINE_UNAVAILABLE:')).toBe(true);
    // Van ban goc van con: ma tra loi "loai gi", van ban tra loi "cu the chuyen gi".
    expect(line).toContain('ECONNREFUSED');
  });

  it('thong bao dai bi cat — mot stack trace khong lam nguoi doc hieu hon, chi lam bang phinh ra', () => {
    const classified = classifyDispatchFailure(new Error('x'.repeat(5_000)));
    expect(classified.detail.length).toBeLessThanOrEqual(500);
  });
});
