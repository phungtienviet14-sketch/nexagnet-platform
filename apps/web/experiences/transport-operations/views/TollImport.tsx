'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { DataTable, StatusBadge } from '../components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../components/SectionState';
import {
  TOLL_PROVIDER_LABEL,
  TOLL_SOURCE_KIND_LABEL,
  formatBusinessDate,
  formatCount,
  formatInstant,
} from '../customer-view';
import { readUploadAsBase64 } from '../file-base64';
import { toSectionQuery, useTollImports } from '../hooks/useTransportWorkspace';
import type { NavigationInput } from '../navigation';
import { transportApi, type TollImportInput } from '../transport-api';
import {
  TOLL_FILE_FORMATS,
  TOLL_PROVIDERS,
  type ManualTollRowInput,
  type TollFileFormat,
  type TollImport as TollImportRecord,
  type TollProvider,
  type TollProviderReadiness,
} from '../transport-types';
import { toTollPreviewModel, type TollPreviewModel } from '../workspace/toll';

/**
 * NAP BANG KE PHI DUONG BO (ETC) — doc thu roi moi ghi.
 *
 * ==============================================================================================
 * HAI DUONG NAP, VA CHUNG KHONG THAY THE NHAU
 * ==============================================================================================
 *
 * `STATEMENT_FILE` chi chay duoc khi goi khach DA khai bo cot cho nha cung cap do. Do lai 08/09/2026
 * thi CHUA nha cung cap nao co bo cot — tuc mot man hinh chi co duong nap tep se la mot man hinh
 * khong lam gi duoc, va no se noi doi bang chinh su ton tai cua no.
 *
 * Nen `MANUAL` luon mo. Do la duong THAT SU dung duoc hom nay: nguoi van hanh go tay tung dong tu
 * bang ke giay/PDF. Bieu nhap la CUA TA, khong phai dinh dang cua nha cung cap nao — nen no khong
 * phu thuoc vao mot bo cot chua ai khai.
 *
 * Do san sang cua tung nha cung cap duoc doc thang tu may chu (`readiness`) va hien ngay canh o
 * chon: nguoi dung thay TRUOC khi chon tep rang duong do dang dong, thay vi sau mot lan tai tep
 * len va mot thong bao loi.
 *
 * ==============================================================================================
 * XEM TRUOC KHONG GHI MOT HANG NAO — VA DO LA CA LY DO NO LA MOT BUOC RIENG
 * ==============================================================================================
 *
 * `POST /imports` GHI THAT: no tao lan nap va sinh cac dong ung vien cho hang cho doi soat. Mot tep
 * sai cot se de lai mot lo dong rac ma nguoi ta phai di don, va khong co duong `DELETE` nao (mot lan
 * nap la mot su kien da xay ra). `POST /imports/preview` chay dung phep anh xa do nhung khong ghi,
 * nen nut nap that chi mo ra sau khi da co ket qua doc thu.
 *
 * `alreadyImportedId !== null` nghia la DUNG bo byte nay da duoc nap: man hinh phai noi ra rang nap
 * lai KHONG tao them nghia vu nao — neu khong, nguoi van hanh se tuong minh vua lam doi so tien len.
 */
export function TollImport({
  navigation,
  readiness,
  canImport,
}: {
  readonly navigation: NavigationInput;
  readonly readiness: readonly TollProviderReadiness[];
  readonly canImport: boolean;
}) {
  return (
    <>
      {canImport ? <TollImportForm readiness={readiness} /> : null}
      <TollImportHistory navigation={navigation} />
    </>
  );
}

type TollImportMode = 'STATEMENT_FILE' | 'MANUAL';

const EMPTY_MANUAL_ROW: ManualTollRowInput = {
  accountNo: '',
  kind: 'TOLL_PASS',
  vehiclePlate: null,
  passedAt: null,
  businessDate: null,
  amount: '',
  station: null,
  providerRef: null,
};

/** Chuoi rong tu mot o nhap la "khong co", khong phai mot gia tri. */
const orNull = (value: string): string | null => (value.trim() === '' ? null : value.trim());

function TollImportForm({ readiness }: { readonly readiness: readonly TollProviderReadiness[] }) {
  const queryClient = useQueryClient();
  const [provider, setProvider] = useState<TollProvider>('VETC');
  const [mode, setMode] = useState<TollImportMode>('MANUAL');
  const [sourceLabel, setSourceLabel] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState<TollFileFormat>('CSV');
  const [rows, setRows] = useState<readonly ManualTollRowInput[]>([EMPTY_MANUAL_ROW]);
  const [preview, setPreview] = useState<TollPreviewModel | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [committed, setCommitted] = useState<string | null>(null);

  const statementReady =
    readiness.find((entry) => entry.provider === provider)?.statementReady ?? false;

  const buildInput = async (): Promise<TollImportInput> => {
    const base = {
      provider,
      sourceLabel: sourceLabel.trim(),
      periodStart: orNull(periodStart),
      periodEnd: orNull(periodEnd),
    };
    if (mode === 'MANUAL') {
      return { ...base, sourceKind: 'MANUAL', rows };
    }
    if (file === null) throw new Error('Chưa chọn tệp bảng kê.');
    return {
      ...base,
      sourceKind: 'STATEMENT_FILE',
      format,
      contentBase64: await readUploadAsBase64(file),
    };
  };

  const runPreview = useMutation({
    mutationFn: async () => transportApi.toll.previewImport(await buildInput()),
    onSuccess: (result) => {
      setFailure(null);
      setCommitted(null);
      setPreview(toTollPreviewModel(result));
    },
    onError: (error: Error) => {
      setPreview(null);
      setFailure(error.message);
    },
  });

  const runCommit = useMutation({
    mutationFn: async () => transportApi.toll.commitImport(await buildInput()),
    onSuccess: (result) => {
      setFailure(null);
      setCommitted(
        result.replayed
          ? 'Đúng nguồn này đã được nạp trước đó. Không có dòng nào được tạo thêm.'
          : `Đã nạp ${formatCount(result.candidateCount)} dòng vào hàng chờ đối soát.`,
      );
      // Mot lan nap doi CA lich su nap VA hang cho, nen lam moi ca nhanh `toll`.
      void queryClient.invalidateQueries({ queryKey: ['transport', 'toll'] });
    },
    onError: (error: Error) => setFailure(error.message),
  });

  const ready =
    sourceLabel.trim() !== '' &&
    (mode === 'MANUAL'
      ? rows.some((row) => row.accountNo.trim() !== '' && row.amount.trim() !== '')
      : file !== null && statementReady);

  return (
    <section className="tx-panel tx-panel--form" aria-labelledby="toll-import-heading">
      <h2 id="toll-import-heading">Nạp bảng kê phí đường bộ</h2>
      <p className="tx-panel__lead">
        Xem trước không ghi gì. Nạp thật sẽ sinh các dòng vào hàng chờ đối soát — không có đường
        xoá, nên hãy xem trước đã.
      </p>

      {failure === null ? null : <ErrorState message={failure} />}
      {committed === null ? null : (
        <p className="tx-note" role="status">
          {committed}
        </p>
      )}

      <div className="tx-detail__grid">
        <label className="tx-field">
          <span>Nhà cung cấp</span>
          <select
            aria-label="Nhà cung cấp"
            value={provider}
            onChange={(event) => {
              setProvider(event.target.value as TollProvider);
              setPreview(null);
              setCommitted(null);
            }}
          >
            {TOLL_PROVIDERS.map((value) => (
              <option key={value} value={value}>
                {TOLL_PROVIDER_LABEL[value]}
              </option>
            ))}
          </select>
        </label>

        <label className="tx-field">
          <span>Nguồn</span>
          <select
            aria-label="Nguồn"
            value={mode}
            onChange={(event) => {
              setMode(event.target.value as TollImportMode);
              setPreview(null);
              setCommitted(null);
            }}
          >
            <option value="MANUAL">{TOLL_SOURCE_KIND_LABEL.MANUAL}</option>
            <option value="STATEMENT_FILE">{TOLL_SOURCE_KIND_LABEL.STATEMENT_FILE}</option>
          </select>
        </label>

        <label className="tx-field">
          <span>Nhãn nguồn</span>
          <input
            value={sourceLabel}
            placeholder="VD: VETC tháng 8"
            onChange={(event) => setSourceLabel(event.target.value)}
          />
        </label>
        <label className="tx-field">
          <span>Từ ngày</span>
          <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
        </label>
        <label className="tx-field">
          <span>Đến ngày</span>
          <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
        </label>
      </div>

      {mode === 'STATEMENT_FILE' ? (
        <FilePicker
          statementReady={statementReady}
          format={format}
          onFormat={setFormat}
          onFile={(picked) => {
            setFile(picked);
            setPreview(null);
            setCommitted(null);
            // Doan dinh dang tu duoi tep nhung VAN de sua duoc: duoi tep la mot pho doan, khong
            // phai mot su that.
            if (picked !== null) {
              setFormat(picked.name.toLowerCase().endsWith('.xlsx') ? 'XLSX' : 'CSV');
            }
          }}
        />
      ) : (
        <ManualRows
          rows={rows}
          onChange={(next) => {
            setRows(next);
            setPreview(null);
            setCommitted(null);
          }}
        />
      )}

      <div className="tx-detail__actions">
        <button
          type="button"
          className="tx-btn"
          disabled={!ready || runPreview.isPending}
          onClick={() => runPreview.mutate()}
        >
          {runPreview.isPending ? 'Đang đọc thử…' : 'Xem trước'}
        </button>
        <button
          type="button"
          className="tx-btn tx-btn--go"
          disabled={preview === null || runCommit.isPending}
          onClick={() => runCommit.mutate()}
          title={preview === null ? 'Xem trước trước đã.' : undefined}
        >
          {runCommit.isPending ? 'Đang nạp…' : 'Nạp bảng kê'}
        </button>
      </div>

      {preview === null ? null : <PreviewPanel model={preview} />}
    </section>
  );
}

/**
 * O CHON TEP — kem cau tra loi ve do san sang NGAY TAI DAY.
 *
 * `statementReady === false` khong duoc viet thanh "sắp có": no la mot ket qua da do (goi khach chua
 * khai bo cot cho nha cung cap nay), va cau chu phai noi ro AI PHAI LAM GI — xin mot tep mau — thay
 * vi de nguoi ta ngoi cho mot duong tu dong khong ton tai.
 */
function FilePicker({
  statementReady,
  format,
  onFormat,
  onFile,
}: {
  readonly statementReady: boolean;
  readonly format: TollFileFormat;
  readonly onFormat: (value: TollFileFormat) => void;
  readonly onFile: (file: File | null) => void;
}) {
  return (
    <div className="tx-detail__block">
      {statementReady ? null : (
        <EmptyState
          title="Chưa đọc được bảng kê của nhà cung cấp này — cần một tệp mẫu để khai bộ cột."
          nextAction="Trong lúc chờ, chọn nguồn “Nhập tay” và gõ từng dòng từ bảng kê giấy."
        />
      )}
      <div className="tx-detail__grid">
        <label className="tx-field">
          <span>Định dạng</span>
          <select
            aria-label="Định dạng"
            value={format}
            disabled={!statementReady}
            onChange={(event) => onFormat(event.target.value as TollFileFormat)}
          >
            {TOLL_FILE_FORMATS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="tx-field">
          <span>Tệp bảng kê</span>
          <input
            type="file"
            accept=".csv,.xlsx,text/csv"
            disabled={!statementReady}
            onChange={(event) => onFile(event.target.files?.[0] ?? null)}
          />
        </label>
      </div>
    </div>
  );
}

/**
 * BIEU NHAP TAY — duong THAT SU dung duoc hom nay.
 *
 * Bieu nay la CUA TA, khong phai dinh dang cua nha cung cap nao, nen no khong phu thuoc mot bo cot
 * chua ai khai. Hai o BAT BUOC la so tai khoan va so tien: may chu doc so tien tu CHUOI (quy uoc
 * phan cach hang nghin duoc giai o mot cho duy nhat), nen o day khong ep kieu `number`.
 *
 * Bien so de trong la HOP LE, va do la co y: mot dong nap tien hay phi tai khoan khong gan vao
 * chiec xe nao. Ep mot bien so vao day se tao ra mot lien he khong co that roi no di tiep vao moi
 * bao cao theo xe.
 */
function ManualRows({
  rows,
  onChange,
}: {
  readonly rows: readonly ManualTollRowInput[];
  readonly onChange: (rows: readonly ManualTollRowInput[]) => void;
}) {
  const patch = (index: number, change: Partial<ManualTollRowInput>) => {
    onChange(rows.map((row, position) => (position === index ? { ...row, ...change } : row)));
  };

  return (
    <div className="tx-detail__block">
      <h3>Các dòng nhập tay</h3>
      <p className="tx-panel__hint">
        Số tài khoản và số tiền là bắt buộc. Để trống biển số nếu dòng đó không thuộc về một chiếc
        xe (nạp tiền, phí tài khoản).
      </p>

      {rows.map((row, index) => (
        <div className="tx-detail__grid" key={`manual-${String(index)}`}>
          <label className="tx-field">
            <span>Số tài khoản</span>
            <input
              value={row.accountNo}
              onChange={(event) => patch(index, { accountNo: event.target.value })}
            />
          </label>
          <label className="tx-field">
            <span>Số tiền</span>
            <input
              value={row.amount}
              placeholder="-52.000"
              onChange={(event) => patch(index, { amount: event.target.value })}
            />
          </label>
          <label className="tx-field">
            <span>Biển số</span>
            <input
              value={row.vehiclePlate ?? ''}
              onChange={(event) => patch(index, { vehiclePlate: orNull(event.target.value) })}
            />
          </label>
          <label className="tx-field">
            <span>Trạm</span>
            <input
              value={row.station ?? ''}
              onChange={(event) => patch(index, { station: orNull(event.target.value) })}
            />
          </label>
          <label className="tx-field">
            <span>Thời điểm qua trạm</span>
            <input
              value={row.passedAt ?? ''}
              placeholder="31/08/2026 23:40"
              onChange={(event) => patch(index, { passedAt: orNull(event.target.value) })}
            />
          </label>
          <div className="tx-detail__actions">
            <button
              type="button"
              className="tx-button tx-button--quiet"
              disabled={rows.length === 1}
              onClick={() => onChange(rows.filter((_, position) => position !== index))}
            >
              Bỏ dòng
            </button>
          </div>
        </div>
      ))}

      <div className="tx-detail__actions">
        <button
          type="button"
          className="tx-button tx-button--quiet"
          onClick={() => onChange([...rows, EMPTY_MANUAL_ROW])}
        >
          Thêm dòng
        </button>
      </div>
    </div>
  );
}

/**
 * KET QUA DOC THU.
 *
 * Con so quan trong nhat KHONG phai tong so dong ma la so dong BI LOAI: mot bang ke nap vao voi mot
 * nua so dong bi loai se sinh ra mot hang cho lech tran lan, va cho re nhat de phat hien dieu do la
 * o day — truoc khi ghi, va truoc khi khong con duong xoa.
 */
function PreviewPanel({ model }: { readonly model: TollPreviewModel }) {
  return (
    <div className="tx-detail__block">
      <h3>Kết quả đọc thử</h3>

      {model.replayNotice === null ? null : (
        <p className="tx-note" role="status">
          {model.replayNotice}
        </p>
      )}

      <dl className="tx-detail__grid">
        <div className="tx-detailrow">
          <dt>Nhà cung cấp</dt>
          <dd>{model.providerLabel}</dd>
        </div>
        <div className="tx-detailrow">
          <dt>Nguồn</dt>
          <dd>{model.sourceKindLabel}</dd>
        </div>
        <div className="tx-detailrow">
          <dt>Tổng số dòng</dt>
          <dd>{model.rowCountLabel}</dd>
        </div>
        <div className="tx-detailrow">
          <dt>Đọc được</dt>
          <dd>{model.acceptedCountLabel}</dd>
        </div>
        <div className="tx-detailrow">
          <dt>Bị loại</dt>
          <dd>{model.rejectedCountLabel}</dd>
        </div>
      </dl>

      {model.rejections.length === 0 ? null : (
        <ul className="tx-detail__reasons">
          {model.rejections.map((row) => (
            <li key={row.reasonLabel}>
              {row.reasonLabel}: {row.countLabel} dòng
            </li>
          ))}
        </ul>
      )}

      {model.matchStateCounts.length === 0 ? null : (
        <ul className="tx-detail__reasons">
          {model.matchStateCounts.map((row) => (
            <li key={row.reasonLabel}>
              {row.reasonLabel}: {row.countLabel} dòng
            </li>
          ))}
        </ul>
      )}

      {model.sample.length === 0 ? null : (
        <>
          <p className="tx-panel__hint">{model.sampleNotice}</p>
          <DataTable
            caption="Các dòng đọc thử được từ nguồn"
            rows={model.sample}
            rowKey={(row) => String(row.rowNumber)}
            columns={[
              {
                key: 'row',
                header: 'Dòng',
                isRowHeader: true,
                // KHONG tien to "#": be mat khach chan moi khuon `#<hai chu so tro len>`.
                render: (row) => String(row.rowNumber),
              },
              { key: 'kind', header: 'Loại', render: (row) => row.kindLabel },
              { key: 'plate', header: 'Biển số', render: (row) => row.vehiclePlateRaw },
              { key: 'date', header: 'Ngày', render: (row) => row.businessDateLabel },
              {
                key: 'amount',
                header: 'Số tiền',
                isNumeric: true,
                render: (row) => row.amountLabel,
              },
              { key: 'station', header: 'Trạm', render: (row) => row.stationLabel },
              {
                key: 'status',
                header: 'Kết quả',
                render: (row) => <StatusBadge label={row.statusLabel} tone={row.statusTone} />,
              },
              {
                key: 'reason',
                header: 'Lý do bỏ qua',
                render: (row) => row.rejectReasonLabel ?? '—',
              },
              {
                key: 'match',
                header: 'Khớp xe',
                render: (row) =>
                  row.matchStateLabel === null || row.matchStateTone === null ? (
                    '—'
                  ) : (
                    <StatusBadge label={row.matchStateLabel} tone={row.matchStateTone} />
                  ),
              },
            ]}
          />
        </>
      )}
    </div>
  );
}

/**
 * LICH SU CAC LAN NAP — nguon cua moi dong trong hang cho.
 *
 * Ton tai vi `#295` phan C doi mot be mat "statement/import history", va vi mot ly do van hanh cu
 * the: khi mot dong trong hang cho sai, cau hoi dau tien la *"no den tu tep nao, ai nap, luc nao"*.
 * Khong co bang nay thi cau do khong tra loi duoc tu giao dien, va nguoi ta phai di hoi nhau.
 *
 * `sourceDigest` duoc cat con muoi hai ky tu: du de doi chieu hai lan nap co cung mot bo byte hay
 * khong, va khong bien mot bang thanh mot buc tuong chu.
 */
function TollImportHistory({ navigation }: { readonly navigation: NavigationInput }) {
  const imports = toSectionQuery(useTollImports(navigation));

  if (imports.isBlocked) return null;
  if (imports.isLoading) return <LoadingState label="Đang tải lịch sử nạp…" />;
  if (imports.errorMessage !== null) {
    return <ErrorState message={imports.errorMessage} onRetry={imports.refetch} />;
  }

  const rows = imports.data ?? [];

  return (
    <section className="tx-panel" aria-labelledby="toll-imports-heading">
      <h2 id="toll-imports-heading">Lịch sử nạp bảng kê</h2>

      {rows.length === 0 ? (
        <EmptyState title="Chưa nạp bảng kê nào." />
      ) : (
        <DataTable<TollImportRecord>
          caption="Các lần nạp bảng kê phí đường bộ"
          rows={rows}
          rowKey={(row) => row.id}
          columns={[
            {
              key: 'label',
              header: 'Nguồn',
              isRowHeader: true,
              render: (row) => row.sourceLabel,
            },
            {
              key: 'provider',
              header: 'Nhà cung cấp',
              render: (row) => TOLL_PROVIDER_LABEL[row.provider],
            },
            {
              key: 'kind',
              header: 'Đường nạp',
              render: (row) => TOLL_SOURCE_KIND_LABEL[row.sourceKind],
            },
            {
              key: 'period',
              header: 'Kỳ',
              render: (row) =>
                row.periodStart === null || row.periodEnd === null
                  ? '—'
                  : `${formatBusinessDate(row.periodStart)} – ${formatBusinessDate(row.periodEnd)}`,
            },
            {
              key: 'rows',
              header: 'Số dòng',
              isNumeric: true,
              render: (row) => formatCount(row.rowCount),
            },
            {
              key: 'accepted',
              header: 'Đọc được',
              isNumeric: true,
              render: (row) => formatCount(row.acceptedCount),
            },
            {
              key: 'rejected',
              header: 'Bị loại',
              isNumeric: true,
              render: (row) => formatCount(row.rejectedCount),
            },
            { key: 'at', header: 'Lúc', render: (row) => formatInstant(row.importedAt) },
            { key: 'by', header: 'Người nạp', render: (row) => row.importedBy },
            {
              key: 'digest',
              header: 'Dấu nguồn',
              // Muoi hai ky tu dau la du de doi chieu hai lan nap; ca chuoi SHA-256 thi khong.
              render: (row) => row.sourceDigest.slice(0, 12),
            },
          ]}
        />
      )}
    </section>
  );
}
