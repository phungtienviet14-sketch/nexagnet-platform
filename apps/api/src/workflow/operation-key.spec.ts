import { describe, expect, it } from 'vitest';
import {
  UnsafeExecution,
  assertExecutionAuthorized,
  authorizeExecution,
  buildOperationKey,
  type OperationIdentity,
} from './operation-key.js';

const identity: OperationIdentity = {
  tenant: 'tenant-alpha',
  environment: 'gd1-test',
  workflowKey: 'integration-handoff',
  operationVersion: 1,
  entityType: 'order',
  entityId: 'ord_test_1',
  operation: 'create',
  destination: 'erp-primary',
};

describe('buildOperationKey — on dinh va phan biet duoc', () => {
  it('cung mot thao tac thi cung mot khoa, moi lan goi', () => {
    expect(buildOperationKey(identity)).toBe(buildOperationKey({ ...identity }));
  });

  it('khoa la chuoi doc duoc, khong phai bam', () => {
    expect(buildOperationKey(identity)).toBe(
      'tenant-alpha:gd1-test:integration-handoff:v1:order:ord_test_1:create:erp-primary',
    );
  });

  it.each([
    ['tenant', { tenant: 'tenant-beta' }],
    ['environment', { environment: 'pilot' }],
    ['workflowKey', { workflowKey: 'campaign-dispatch' }],
    ['operationVersion', { operationVersion: 2 }],
    ['entityType', { entityType: 'campaign' }],
    ['entityId', { entityId: 'ord_test_2' }],
    ['operation', { operation: 'cancel' }],
    ['destination', { destination: 'erp-secondary' }],
  ])('doi %s thi khoa phai khac', (_field, patch) => {
    expect(buildOperationKey({ ...identity, ...patch })).not.toBe(buildOperationKey(identity));
  });

  it('tu choi doan chua dau phan cach — neu khong hai thao tac khac nhau se trung khoa', () => {
    expect(() => buildOperationKey({ ...identity, entityId: 'ord:1' })).toThrow(TypeError);
  });

  it('tu choi doan rong — khoa thieu mot chieu la khoa sai', () => {
    expect(() => buildOperationKey({ ...identity, destination: '' })).toThrow(TypeError);
  });
});

describe('authorizeExecution — RETRY khac REPLAY khac CHAY LAI NGHIEP VU', () => {
  it('lan chay dau luon duoc phep', () => {
    expect(authorizeExecution({ cause: 'initial', support: 'none' }).verdict).toBe('ALLOWED');
  });

  it('engine retry duoc phep khi he ngoai co khoa idempotency', () => {
    expect(authorizeExecution({ cause: 'engine_retry', support: 'key' }).verdict).toBe('ALLOWED');
  });

  it('engine retry van chay khi he ngoai KHONG co idempotency, nhung phai noi ro rui ro trung', () => {
    // Chan retry o day chi lam run mac ket; engine se retry bat ke ta noi gi. Trung thuc hon la
    // cho chay va DAT TEN cho rui ro, de nguoi van hanh doc duoc no.
    expect(authorizeExecution({ cause: 'engine_retry', support: 'none' }).verdict).toBe(
      'ALLOWED_WITH_DUPLICATE_RISK',
    );
  });

  it('operator replay an toan khi he ngoai nhan khoa idempotency', () => {
    expect(authorizeExecution({ cause: 'operator_replay', support: 'key' }).verdict).toBe('ALLOWED');
  });

  it('operator replay phai KIEM TRUOC khi he ngoai chi tra cuu duoc', () => {
    expect(authorizeExecution({ cause: 'operator_replay', support: 'lookup' }).verdict).toBe(
      'REQUIRES_VERIFICATION',
    );
    expect(
      authorizeExecution({ cause: 'operator_replay', support: 'lookup', verified: true }).verdict,
    ).toBe('ALLOWED');
  });

  it('operator replay bi CHAN khi he ngoai khong co idempotency — tu xac nhan khong qua duoc', () => {
    expect(authorizeExecution({ cause: 'operator_replay', support: 'none' }).verdict).toBe(
      'BLOCKED',
    );
    expect(
      authorizeExecution({ cause: 'operator_replay', support: 'none', verified: true }).verdict,
    ).toBe('BLOCKED');
  });

  it('chay lai nghiep vu doi KHOA MOI — no la thao tac khac, khong phai lan hai cua cai cu', () => {
    expect(authorizeExecution({ cause: 'business_reexecution', support: 'key' }).verdict).toBe(
      'REQUIRES_NEW_OPERATION_KEY',
    );
  });

  it('moi phan xu deu kem mot ma ly do doc duoc', () => {
    expect(authorizeExecution({ cause: 'operator_replay', support: 'none' }).reason).toBe(
      'DESTINATION_HAS_NO_IDEMPOTENCY',
    );
  });
});

describe('assertExecutionAuthorized', () => {
  it('im lang khi duoc phep', () => {
    expect(() =>
      assertExecutionAuthorized({ cause: 'operator_replay', support: 'key' }, identity),
    ).not.toThrow();
  });

  it('im lang khi duoc phep kem rui ro — canh bao khong phai la chan', () => {
    expect(() =>
      assertExecutionAuthorized({ cause: 'engine_retry', support: 'none' }, identity),
    ).not.toThrow();
  });

  it('nem kem khoa thao tac khi bi chan — de nguoi van hanh tra cuu duoc ngay', () => {
    let thrown: unknown;
    try {
      assertExecutionAuthorized({ cause: 'operator_replay', support: 'none' }, identity);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(UnsafeExecution);
    expect((thrown as UnsafeExecution).reason).toBe('DESTINATION_HAS_NO_IDEMPOTENCY');
    expect((thrown as UnsafeExecution).operationKey).toBe(buildOperationKey(identity));
  });

  it('nem khi replay can kiem ma chua ai kiem', () => {
    expect(() =>
      assertExecutionAuthorized({ cause: 'operator_replay', support: 'lookup' }, identity),
    ).toThrow(UnsafeExecution);
  });
});
