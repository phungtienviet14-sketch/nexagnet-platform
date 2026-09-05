import { describe, expect, it } from 'vitest';
import {
  discrepancyResolutionOptions,
  toFuelEntryRows,
  toReconciliationRows,
  toReconciliationWorkspace,
  toStatementLineRows,
} from '../fuel';
import { discrepancy, fuelEntry, reconciliation, statementLine, workspace } from './fixtures';

const suppliers = [{ id: 'sup-1', name: 'Cây xăng Petrolimex 12' }];

describe('phieu dau — HAI truc doc lap, khong gop', () => {
  it('mot phieu co the vua da xac thuc vua chua khop, va do la binh thuong', () => {
    const row = toFuelEntryRows(
      [fuelEntry({ verificationStatus: 'VERIFIED', reconciliationStatus: 'UNMATCHED' })],
      suppliers,
      'ADMIN',
    )[0]!;
    expect(row.verificationLabel).toBe('Đã xác thực');
    expect(row.reconciliationLabel).toBe('Chưa khớp');
  });

  it('so lit va muc tieu thu chia dung 1000', () => {
    const row = toFuelEntryRows([fuelEntry()], suppliers, 'ADMIN')[0]!;
    expect(row.litersLabel).toBe('200,000 L');
    expect(row.consumptionLabel).toBe('40,000 L/100km');
  });

  it('doc ra TEN cay xang, khong ra id', () => {
    expect(toFuelEntryRows([fuelEntry()], suppliers, 'ADMIN')[0]!.supplierLabel).toBe(
      'Cây xăng Petrolimex 12',
    );
    expect(toFuelEntryRows([fuelEntry()], [], 'ADMIN')[0]!.supplierLabel).toBe(
      'Cây xăng chưa đọc được tên',
    );
  });

  it('phieu moi khai thi xac thuc/tu choi/sua duoc', () => {
    const row = toFuelEntryRows([fuelEntry()], suppliers, 'ADMIN')[0]!;
    expect(row.canVerify).toBe(true);
    expect(row.canReject).toBe(true);
    expect(row.canAmend).toBe(true);
    expect(row.amendBlockedReason).toBeNull();
  });

  it('hai duong chan sua phieu noi HAI cau khac nhau, vi nguoi dung phai lam hai viec khac nhau', () => {
    const trusted = toFuelEntryRows(
      [fuelEntry({ verificationStatus: 'VERIFIED' })],
      suppliers,
      'ADMIN',
    )[0]!;
    const locked = toFuelEntryRows(
      [fuelEntry({ reconciliationStatus: 'SETTLED' })],
      suppliers,
      'ADMIN',
    )[0]!;
    expect(trusted.amendBlockedReason).toContain('đã được xác thực');
    expect(locked.amendBlockedReason).toContain('kỳ đối soát đã chốt');
    expect(trusted.amendBlockedReason).not.toBe(locked.amendBlockedReason);
  });

  it('phieu bi tu choi la duong cut hom nay, va man hinh phai noi that', () => {
    const row = toFuelEntryRows(
      [fuelEntry({ verificationStatus: 'REJECTED' })],
      suppliers,
      'ADMIN',
    )[0]!;
    expect(row.canResubmit).toBe(true);
    expect(row.rejectedNote).not.toContain('Máy chủ');
    expect(row.canVerify).toBe(false);
  });

  it('khong co quyen xac thuc thi khong bay nut nao', () => {
    const row = toFuelEntryRows([fuelEntry()], suppliers, 'MANAGER')[0]!;
    expect(row.canVerify).toBe(false);
    expect(row.canAmend).toBe(false);
  });
});

describe('danh sach ky doi soat', () => {
  it('KHONG bia so chenh lech cho tung dong — danh sach cua API khong tra con so do', () => {
    const rows = toReconciliationRows([reconciliation()], suppliers);
    expect(rows[0]!.pendingCount).toBeNull();
    expect(rows[0]!.supplierLabel).toBe('Cây xăng Petrolimex 12');
    expect(rows[0]!.periodLabel).toBe('01/09/2026 – 30/09/2026');
  });
});

describe('dong bang ke', () => {
  it('dong bi tu choi hien ly do bang tieng Viet', () => {
    const rows = toStatementLineRows([
      statementLine({ status: 'REJECTED', rejectReason: 'UNKNOWN_VEHICLE' }),
    ]);
    expect(rows[0]!.rejectLabel).toBe('Không nhận ra biển số');
    expect(rows[0]!.isAccepted).toBe(false);
  });

  it('dong duoc nhan thi khong co ly do tu choi', () => {
    expect(toStatementLineRows([statementLine()])[0]!.rejectLabel).toBeNull();
  });
});

describe('chenh lech — cach xu ly hop ly theo tung loai', () => {
  it('nhieu ung vien khop thi xac nhan cap PHAI chi ro cap nao', () => {
    // Khong chi ro la 400 `FUEL_MATCH_TARGET_REQUIRED`, nen man hinh phai biet truoc de bat chon.
    const options = discrepancyResolutionOptions('AMBIGUOUS_CANDIDATES');
    const confirm = options.find((option) => option.resolution === 'MATCH_CONFIRMED');
    expect(confirm?.requiresTargets).toBe(true);
  });

  it('cac loai khac khong doi chi ro cap', () => {
    for (const kind of ['STATEMENT_LINE_ONLY', 'FUEL_ENTRY_ONLY', 'OUT_OF_TOLERANCE'] as const) {
      for (const option of discrepancyResolutionOptions(kind)) {
        expect(option.requiresTargets).toBe(false);
      }
    }
  });

  it('chi bay cach xu ly co nghia voi tung loai', () => {
    expect(
      discrepancyResolutionOptions('FUEL_ENTRY_ONLY').map((option) => option.resolution),
    ).toEqual(['ENTRY_CORRECTION_REQUIRED', 'IGNORE_WITH_REASON']);
    // Phieu sinh tu chinh bang ke thi khong con gi de "khop" nua.
    expect(
      discrepancyResolutionOptions('SELF_SOURCED_BLOCKED').map((option) => option.resolution),
    ).not.toContain('MATCH_CONFIRMED');
  });

  it('moi loai chenh lech deu co it nhat mot cach xu ly', () => {
    for (const kind of [
      'AMBIGUOUS_CANDIDATES',
      'STATEMENT_LINE_ONLY',
      'FUEL_ENTRY_ONLY',
      'OUT_OF_TOLERANCE',
      'SELF_SOURCED_BLOCKED',
    ] as const) {
      expect(discrepancyResolutionOptions(kind).length).toBeGreaterThan(0);
    }
  });
});

describe('ban lam viec doi soat', () => {
  it('con chenh lech cho xu ly thi CHUA dong duoc, va noi ro con bao nhieu', () => {
    const model = toReconciliationWorkspace(workspace(), 'ADMIN');
    expect(model.canClose).toBe(false);
    expect(model.closeBlockedReason).toContain('1 chênh lệch chưa có quyết định');
    expect(model.pendingCountLabel).toBe('1');
  });

  it('het chenh lech thi dong duoc, va khong con cau chan nao', () => {
    const model = toReconciliationWorkspace(
      workspace({
        discrepancies: [discrepancy({ status: 'RESOLVED', resolution: 'ACCEPT_SUPPLIER_AMOUNT' })],
        pendingDiscrepancyCount: 0,
      }),
      'ADMIN',
    );
    expect(model.canClose).toBe(true);
    expect(model.closeBlockedReason).toBeNull();
  });

  it('ky da dong la DONG BANG: khong so khop, khong xu ly lech nua', () => {
    const model = toReconciliationWorkspace(
      workspace({
        reconciliation: reconciliation({ state: 'CLOSED', closedAt: '2026-10-02T00:00:00.000Z' }),
        pendingDiscrepancyCount: 0,
      }),
      'ADMIN',
    );
    expect(model.isFrozen).toBe(true);
    expect(model.canRunMatching).toBe(false);
    expect(model.canClose).toBe(false);
    expect(model.discrepancyRows.every((row) => !row.canResolve)).toBe(true);
  });

  it('mo lai ky da dong la quyen RIENG cua Giam doc', () => {
    const closed = workspace({
      reconciliation: reconciliation({ state: 'CLOSED' }),
      pendingDiscrepancyCount: 0,
    });
    expect(toReconciliationWorkspace(closed, 'ACCOUNTING').canReopen).toBe(false);
    expect(toReconciliationWorkspace(closed, 'ADMIN').canReopen).toBe(true);
  });

  it('ban giao cong no doc len duoc kem so ban sua doi', () => {
    const model = toReconciliationWorkspace(
      workspace({
        handoff: {
          id: 'ho-1',
          reconciliationId: 'rc-1',
          revision: 2,
          supersedesId: 'ho-0',
          acceptedAmount: 4_200_000,
          acceptedLineCount: 1,
          acceptedLineIds: ['sl-1'],
          emittedAt: '2026-10-02T00:00:00.000Z',
        },
      }),
      'ADMIN',
    );
    expect(model.handoffSummary).toContain('bản 2');
    expect(model.handoffSummary).toContain('4.200.000');
  });

  it('chua ban giao thi khong bay dong nao ve ban giao', () => {
    expect(toReconciliationWorkspace(workspace(), 'ADMIN').handoffSummary).toBeNull();
  });
});
