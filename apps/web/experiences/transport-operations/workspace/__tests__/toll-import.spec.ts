import { describe, expect, it } from 'vitest';
import type { ManualTollRowInput, TollTransactionKind } from '../../transport-types';
import type { TollPreviewModel } from '../toll';
import {
  applyTollRowKind,
  bindTollPreview,
  buildTollImportRequest,
  commitableTollRequest,
  EMPTY_MANUAL_TOLL_ROW,
  tollFileToken,
  tollImportFingerprint,
  tollImportReady,
  tollPreviewStale,
  tollRowCarriesVehicle,
  type TollImportDraft,
} from '../toll-import';

/**
 * HOI QUY — soat doc lap 13/09/2026 (comment 5652336290), finding 1 va finding 2.
 *
 * Ca hai deu kiem duoc bang ham thuan, va do chinh la ly do phan quyet dinh da duoc keo ra khoi
 * `TollImport.tsx`: bo bai web chay o moi truong `node` va khong dung mot cay DOM nao, nen mot
 * quyet dinh con nam trong JSX la mot quyet dinh khong ai khoa duoc.
 */

const MANUAL_ROW: ManualTollRowInput = {
  ...EMPTY_MANUAL_TOLL_ROW,
  accountNo: 'TK-001',
  amount: '-52.000',
};

const draft = (overrides: Partial<TollImportDraft> = {}): TollImportDraft => ({
  provider: 'VETC',
  mode: 'MANUAL',
  sourceLabel: 'VETC tháng 8',
  periodStart: '2026-08-01',
  periodEnd: '2026-08-31',
  format: 'CSV',
  fileToken: null,
  rows: [MANUAL_ROW],
  ...overrides,
});

const fileDraft = (overrides: Partial<TollImportDraft> = {}): TollImportDraft =>
  draft({
    mode: 'STATEMENT_FILE',
    fileToken: tollFileToken({ name: 'vetc-08.csv', size: 2048, lastModified: 1_756_000_000_000 }),
    ...overrides,
  });

/** Ban doc thu thu gon — bo bai nay khong quan tam noi dung, chi quan tam no bi BUOC vao cai gi. */
const PREVIEW = { rowCountLabel: '12' } as unknown as TollPreviewModel;

const previewOf = (source: TollImportDraft, contentBase64: string | null = null) =>
  bindTollPreview(buildTollImportRequest(source, contentBase64), source, PREVIEW);

/* ================================================================== *
 * FINDING 1 — GHI DUNG CAI DA DOC THU
 * ================================================================== */

describe('nap that bi BUOC vao dung than yeu cau da duoc doc thu', () => {
  it('bieu nhap khong doi -> nap di CHINH than yeu cau da doc thu', () => {
    const current = draft();
    const binding = previewOf(current);

    // Khong phai "mot than yeu cau tuong duong": dung CAI DO, theo danh tinh doi tuong.
    expect(commitableTollRequest(binding, current)).toBe(binding.request);
  });

  it('chua doc thu -> khong co gi de nap', () => {
    expect(commitableTollRequest(null, draft())).toBeNull();
  });

  /**
   * BON O MA BAN SOAT CHI DICH DANH.
   *
   * `sourceLabel`, `periodStart`, `periodEnd` va `format` truoc day KHONG lam mat hieu luc ban doc
   * thu — nen nguoi van hanh doc thu bo A, sua mot trong bon o do, roi bam nap va GHI bo B trong
   * khi man hinh van hien ket qua cua bo A.
   */
  it.each([
    ['sourceLabel', { sourceLabel: 'VETC tháng 9' }],
    ['periodStart', { periodStart: '2026-07-01' }],
    ['periodEnd', { periodEnd: '2026-09-30' }],
    ['provider', { provider: 'EPASS' as const }],
    ['mode', { mode: 'STATEMENT_FILE' as const }],
  ])('doi `%s` sau khi doc thu -> KHONG nap duoc', (_field, change) => {
    const binding = previewOf(draft());

    expect(commitableTollRequest(binding, draft(change))).toBeNull();
    expect(tollPreviewStale(binding, draft(change))).toBe(true);
  });

  it('doi `format` sau khi doc thu -> KHONG nap duoc (khong phai chuyen hinh thuc)', () => {
    const binding = previewOf(fileDraft({ format: 'CSV' }), 'YmFzZTY0');

    // `format` doi cach may chu doc tep, tuc doi luon cac dong ung vien duoc sinh ra — va khong co
    // duong `DELETE` nao cho mot lan nap.
    expect(commitableTollRequest(binding, fileDraft({ format: 'XLSX' }))).toBeNull();
  });

  it('doi TEP sau khi doc thu -> KHONG nap duoc', () => {
    const binding = previewOf(fileDraft(), 'YmFzZTY0');

    const other = fileDraft({
      fileToken: tollFileToken({
        name: 'vetc-09.csv',
        size: 4096,
        lastModified: 1_757_000_000_000,
      }),
    });

    expect(commitableTollRequest(binding, other)).toBeNull();
  });

  it('sua MOT o cua MOT dong nhap tay -> KHONG nap duoc', () => {
    const binding = previewOf(draft());

    expect(
      commitableTollRequest(binding, draft({ rows: [{ ...MANUAL_ROW, amount: '-999.000' }] })),
    ).toBeNull();
  });

  it('them mot dong sau khi doc thu -> KHONG nap duoc', () => {
    const binding = previewOf(draft());

    const added = draft({ rows: [MANUAL_ROW, { ...MANUAL_ROW, accountNo: 'TK-002' }] });

    expect(commitableTollRequest(binding, added)).toBeNull();
  });

  it('doi LOAI cua mot dong sau khi doc thu -> KHONG nap duoc', () => {
    const binding = previewOf(draft());

    const retyped = draft({ rows: [applyTollRowKind(MANUAL_ROW, 'TOP_UP')] });

    expect(commitableTollRequest(binding, retyped)).toBeNull();
  });

  it('sua roi SUA VE NHU CU -> nap lai duoc, va van la than yeu cau cu', () => {
    const binding = previewOf(draft());

    // Dau van tay do THU DI VAO MAY CHU, khong do thu tu thao tac. Bat nguoi dung doc thu lai sau
    // mot lan go nham roi sua lai la mot phien toai khong mua duoc them su that nao.
    expect(commitableTollRequest(binding, draft({ sourceLabel: 'khac' }))).toBeNull();
    expect(commitableTollRequest(binding, draft())).toBe(binding.request);
  });

  it('khoang trang thua quanh `sourceLabel` KHONG lam mat hieu luc', () => {
    const binding = previewOf(draft({ sourceLabel: 'VETC tháng 8' }));

    // Vi chinh `buildTollImportRequest` cung `trim()` — hai ban nhap nay sinh ra cung mot than yeu
    // cau, nen coi la doi se la mot canh bao sai.
    expect(commitableTollRequest(binding, draft({ sourceLabel: '  VETC tháng 8  ' }))).toBe(
      binding.request,
    );
  });

  it('dau van tay KHONG mang noi dung tep, nhung MANG danh tinh tep', () => {
    // Doc tep hai lan cho hai chuoi base64 giong nhau; dau van tay phai on dinh giua hai lan do.
    expect(tollImportFingerprint(fileDraft())).toBe(tollImportFingerprint(fileDraft()));
    expect(tollImportFingerprint(fileDraft())).toContain('vetc-08.csv');
  });

  it('than yeu cau nap tay KHONG mang `format` hay `contentBase64`', () => {
    // Gui kem se bi `zod.strict()` cua may chu tu choi — bai nay bat dieu do o phia man hinh, truoc
    // khi no thanh mot loi 400 kho hieu.
    expect(buildTollImportRequest(draft(), null)).toEqual({
      provider: 'VETC',
      sourceKind: 'MANUAL',
      sourceLabel: 'VETC tháng 8',
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      rows: [MANUAL_ROW],
    });
  });

  it('ky de trong di ra thanh `null`, khong phai chuoi rong', () => {
    const request = buildTollImportRequest(draft({ periodStart: '', periodEnd: '   ' }), null);

    expect(request.periodStart).toBeNull();
    expect(request.periodEnd).toBeNull();
  });

  it('nap tu tep ma chua doc duoc noi dung -> nem, khong gui di mot than rong', () => {
    expect(() => buildTollImportRequest(fileDraft(), null)).toThrow();
  });
});

describe('du dieu kien de doc thu', () => {
  it('thieu nhan nguon -> chua doc thu duoc', () => {
    expect(tollImportReady(draft({ sourceLabel: '  ' }), true)).toBe(false);
  });

  it('nhap tay: can it nhat mot dong co ca so tai khoan va so tien', () => {
    expect(tollImportReady(draft({ rows: [EMPTY_MANUAL_TOLL_ROW] }), true)).toBe(false);
    expect(tollImportReady(draft({ rows: [{ ...MANUAL_ROW, amount: '' }] }), true)).toBe(false);
    // Nhap tay KHONG phu thuoc do san sang cua nha cung cap — do la ca ly do no ton tai.
    expect(tollImportReady(draft(), false)).toBe(true);
  });

  it('nap tu tep: nha cung cap chua khai bo cot -> chua doc thu duoc du da chon tep', () => {
    expect(tollImportReady(fileDraft(), false)).toBe(false);
    expect(tollImportReady(fileDraft(), true)).toBe(true);
  });
});

/* ================================================================== *
 * FINDING 2 — LOAI GIAO DICH KHONG CON BI DONG CUNG
 * ================================================================== */

describe('mot dong nhap tay mang DUNG loai cua no', () => {
  const KINDS: readonly TollTransactionKind[] = [
    'TOLL_PASS',
    'TOP_UP',
    'ACCOUNT_FEE',
    'ADJUSTMENT',
  ];

  it('ca bon loai deu di duoc toi than yeu cau', () => {
    const rows = KINDS.map((kind) => applyTollRowKind({ ...MANUAL_ROW }, kind));

    // Truoc khi sua, ca bon dong deu di ra `TOLL_PASS` — tuc duong `MANUAL` "dung duoc" khong noi
    // duoc ba trong bon loai ma chinh mien cua no khai bao.
    expect(buildTollImportRequest(draft({ rows }), null).rows?.map((row) => row.kind)).toEqual(
      KINDS,
    );
  });

  it('`TOP_UP` va `ACCOUNT_FEE` KHONG thuoc ve mot chiec xe', () => {
    expect(tollRowCarriesVehicle('TOP_UP')).toBe(false);
    expect(tollRowCarriesVehicle('ACCOUNT_FEE')).toBe(false);
  });

  it('`TOLL_PASS` va `ADJUSTMENT` thi CO the thuoc ve mot chiec xe', () => {
    expect(tollRowCarriesVehicle('TOLL_PASS')).toBe(true);
    // Dieu chinh mot luot qua tram ghi nham la mot dieu chinh CO xe; dieu chinh so du thi khong.
    // Nen `ADJUSTMENT` giu o trang thai tuy chon.
    expect(tollRowCarriesVehicle('ADJUSTMENT')).toBe(true);
  });

  it.each([['TOP_UP'], ['ACCOUNT_FEE']] as const)(
    'doi sang `%s` thi DON luon ba o cua xe',
    (kind) => {
      const filled: ManualTollRowInput = {
        ...MANUAL_ROW,
        vehiclePlate: '29H-123.45',
        station: 'Pháp Vân',
        passedAt: '31/08/2026 23:40',
      };

      const next = applyTollRowKind(filled, kind);

      // De lai gia tri cu thi mot dong nap tien se mang bien so — may chu KHONG tu choi no (bien so
      // la truong tuy chon), nen no lang le tro thanh mot khoan tien gan vao mot chiec xe.
      expect(next.kind).toBe(kind);
      expect(next.vehiclePlate).toBeNull();
      expect(next.station).toBeNull();
      expect(next.passedAt).toBeNull();
    },
  );

  it('doi sang mot loai CO mang xe thi GIU nguyen ba o do', () => {
    const filled: ManualTollRowInput = {
      ...MANUAL_ROW,
      vehiclePlate: '29H-123.45',
      station: 'Pháp Vân',
      passedAt: '31/08/2026 23:40',
    };

    const next = applyTollRowKind(filled, 'ADJUSTMENT');

    expect(next.vehiclePlate).toBe('29H-123.45');
    expect(next.station).toBe('Pháp Vân');
    expect(next.passedAt).toBe('31/08/2026 23:40');
  });

  it('`applyTollRowKind` KHONG sua dong cu', () => {
    const original: ManualTollRowInput = { ...MANUAL_ROW, vehiclePlate: '29H-123.45' };

    applyTollRowKind(original, 'TOP_UP');

    expect(original.vehiclePlate).toBe('29H-123.45');
    expect(original.kind).toBe('TOLL_PASS');
  });

  it('so tien va so tai khoan song sot qua mot lan doi loai', () => {
    const next = applyTollRowKind(MANUAL_ROW, 'ACCOUNT_FEE');

    // Don o cua XE thi duoc; don mat so tien thi la xoa du lieu nguoi dung vua go.
    expect(next.accountNo).toBe('TK-001');
    expect(next.amount).toBe('-52.000');
  });
});
