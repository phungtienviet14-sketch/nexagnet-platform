'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { CommandPanel, DataTable, StatusBadge } from '../components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../components/SectionState';
import {
  TOLL_PROVIDER_LABEL,
  TOLL_SOURCE_KIND_LABEL,
  TOLL_TRANSACTION_KIND_LABEL,
  formatBusinessDate,
  formatCount,
  formatInstant,
} from '../customer-view';
import { readUploadAsBase64 } from '../file-base64';
import { toSectionQuery, useTollImports } from '../hooks/useTransportWorkspace';
import type { NavigationInput } from '../navigation';
import { transportApi } from '../transport-api';
import {
  TOLL_FILE_FORMATS,
  TOLL_PROVIDERS,
  TOLL_TRANSACTION_KINDS,
  type ManualTollRowInput,
  type TollFileFormat,
  type TollImport as TollImportRecord,
  type TollProvider,
  type TollProviderReadiness,
  type TollTransactionKind,
} from '../transport-types';
import { toTollPreviewModel, type TollPreviewModel } from '../workspace/toll';
import {
  applyTollRowKind,
  bindTollPreview,
  buildTollImportRequest,
  commitableTollRequest,
  EMPTY_MANUAL_TOLL_ROW,
  tollFileToken,
  tollImportReady,
  tollPreviewStale,
  tollRowCarriesVehicle,
  type TollImportDraft,
  type TollImportMode,
  type TollImportPreviewBinding,
} from '../workspace/toll-import';

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
  onShowRows,
}: {
  readonly navigation: NavigationInput;
  readonly readiness: readonly TollProviderReadiness[];
  readonly canImport: boolean;
  /** `#314` — mo hang cho doi soat, loc dung cac dong cua lan nap nay. Vang = vai khong doc hang cho. */
  readonly onShowRows?: (entry: TollImportRecord) => void;
}) {
  return (
    <>
      {canImport ? <TollImportForm readiness={readiness} /> : null}
      <TollImportHistory navigation={navigation} onShowRows={onShowRows} />
    </>
  );
}

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
  const [rows, setRows] = useState<readonly ManualTollRowInput[]>([EMPTY_MANUAL_TOLL_ROW]);
  const [binding, setBinding] = useState<TollImportPreviewBinding | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [committed, setCommitted] = useState<string | null>(null);

  const statementReady =
    readiness.find((entry) => entry.provider === provider)?.statementReady ?? false;

  /*
   * BAN NHAP la mot GIA TRI, khong phai tam bien roi rac.
   *
   * Gom lai de mot ham THUAN cham duoc *"ban nhap hien tai co con la ban nhap da doc thu khong"*.
   * Chung nao con nam roi rac trong `useState`, cau hoi do chi tra loi duoc bang mat nguoi doc.
   */
  const draft: TollImportDraft = {
    provider,
    mode,
    sourceLabel,
    periodStart,
    periodEnd,
    format,
    fileToken: file === null ? null : tollFileToken(file),
    rows,
  };

  /*
   * NAP THAT GUI DI `binding.request` — dung bo byte da duoc doc thu, khong phai mot bo moi dung
   * lai tu bieu nhap. `null` = bieu nhap da doi ke tu lan doc thu.
   */
  const commitable = commitableTollRequest(binding, draft);
  const stale = tollPreviewStale(binding, draft);

  const runPreview = useMutation({
    mutationFn: async () => {
      const request = buildTollImportRequest(
        draft,
        mode === 'STATEMENT_FILE' && file !== null ? await readUploadAsBase64(file) : null,
      );
      return { request, preview: await transportApi.toll.previewImport(request) };
    },
    onSuccess: ({ request, preview }) => {
      setFailure(null);
      setCommitted(null);
      // Ket qua doc thu duoc BUOC vao dung than yeu cau da sinh ra no.
      setBinding(bindTollPreview(request, draft, toTollPreviewModel(preview)));
    },
    onError: (error: Error) => {
      setBinding(null);
      setFailure(error.message);
    },
  });

  const runCommit = useMutation({
    mutationFn: async () => {
      // Doc lai qua `commitableTollRequest` ngay tai day: giua luc ve nut va luc bam, ban nhap co
      // the da doi. Mot cai nut bi khoa la mot loi moi, khong phai mot bao dam.
      const request = commitableTollRequest(binding, draft);
      if (request === null) {
        throw new Error('Biểu nhập đã đổi kể từ lần đọc thử. Hãy đọc thử lại trước khi nạp.');
      }
      return transportApi.toll.commitImport(request);
    },
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

  const ready = tollImportReady(draft, statementReady);

  return (
    /*
     * NGAN DONG SAN — cung ly le voi `StatementImport`.
     *
     * Nap bang ke ETC la viec theo KY, con man `Phí đường bộ` duoc mo hang ngay de nhin hang cho
     * doi soat. Mot bieu nhap co the bung ra thanh mot bang go tay nhieu dong khong duoc dung
     * truoc cai hang cho do.
     */
    <CommandPanel
      title="Nạp bảng kê phí đường bộ"
      /* Cung ly do voi `StatementImport`: nut gui ten `Nạp bảng kê`, nen nut mo phai mang ten khac. */
      openLabel="Mở biểu nhập"
      hint="Xem trước không ghi gì. Nạp thật sẽ sinh các dòng vào hàng chờ đối soát — không có đường xoá, nên hãy xem trước đã."
    >
      {failure === null ? null : <ErrorState message={failure} />}
      {!stale ? null : (
        <p className="tx-note" role="status">
          Biểu nhập đã đổi kể từ lần đọc thử. Hãy đọc thử lại — nút nạp chỉ mở cho đúng bộ dữ liệu
          đã được đọc thử.
        </p>
      )}
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
          disabled={commitable === null || runCommit.isPending}
          onClick={() => runCommit.mutate()}
          title={
            commitable === null
              ? stale
                ? 'Biểu nhập đã đổi kể từ lần đọc thử — đọc thử lại đã.'
                : 'Xem trước trước đã.'
              : undefined
          }
        >
          {runCommit.isPending ? 'Đang nạp…' : 'Nạp bảng kê'}
        </button>
      </div>

      {binding === null ? null : <PreviewPanel model={binding.model} stale={stale} />}
    </CommandPanel>
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
 *
 * ==============================================================================================
 * LOAI GIAO DICH LA MOT O NHAP, KHONG PHAI MOT HANG SO
 * ==============================================================================================
 *
 * Ban truoc dong cung moi dong thanh `TOLL_PASS`, trong khi chinh cau huong dan ngay tren lai noi
 * *"de trong bien so neu la nap tien / phi tai khoan"*. Tuc man hinh MOI nguoi van hanh nhap mot
 * dong nap tien roi gui no di duoi danh nghia mot luot qua tram — va tu do khoan tien do nam sai
 * cho trong moi bao cao.
 *
 * Doi loai sang mot loai KHONG mang xe thi ba o cua xe duoc don va khoa lai (`applyTollRowKind`):
 * de lai gia tri cu se gui di mot dong `TOP_UP` mang bien so, va may chu khong tu choi dong do.
 */
function ManualRows({
  rows,
  onChange,
}: {
  readonly rows: readonly ManualTollRowInput[];
  readonly onChange: (rows: readonly ManualTollRowInput[]) => void;
}) {
  const replace = (index: number, next: ManualTollRowInput) => {
    onChange(rows.map((row, position) => (position === index ? next : row)));
  };

  const patch = (index: number, change: Partial<ManualTollRowInput>) => {
    onChange(rows.map((row, position) => (position === index ? { ...row, ...change } : row)));
  };

  return (
    <div className="tx-detail__block">
      <h3>Các dòng nhập tay</h3>
      <p className="tx-panel__lead">
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
            <span>Loại</span>
            <select
              aria-label={`Loại giao dịch dòng ${String(index + 1)}`}
              value={row.kind}
              onChange={(event) =>
                // KHONG `patch(index, { kind })`: doi loai con phai DON theo cac o cua xe.
                replace(index, applyTollRowKind(row, event.target.value as TollTransactionKind))
              }
            >
              {TOLL_TRANSACTION_KINDS.map((value) => (
                <option key={value} value={value}>
                  {TOLL_TRANSACTION_KIND_LABEL[value]}
                </option>
              ))}
            </select>
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
              disabled={!tollRowCarriesVehicle(row.kind)}
              title={
                tollRowCarriesVehicle(row.kind)
                  ? undefined
                  : 'Dòng nạp tiền / phí tài khoản không thuộc về một chiếc xe.'
              }
              onChange={(event) => patch(index, { vehiclePlate: orNull(event.target.value) })}
            />
          </label>
          <label className="tx-field">
            <span>Trạm</span>
            <input
              value={row.station ?? ''}
              disabled={!tollRowCarriesVehicle(row.kind)}
              onChange={(event) => patch(index, { station: orNull(event.target.value) })}
            />
          </label>
          <label className="tx-field">
            <span>Thời điểm qua trạm</span>
            <input
              value={row.passedAt ?? ''}
              placeholder="31/08/2026 23:40"
              disabled={!tollRowCarriesVehicle(row.kind)}
              onChange={(event) => patch(index, { passedAt: orNull(event.target.value) })}
            />
          </label>
          <div className="tx-detail__actions">
            <button
              type="button"
              className="tx-btn tx-btn--small"
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
          className="tx-btn tx-btn--small"
          onClick={() => onChange([...rows, EMPTY_MANUAL_TOLL_ROW])}
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
function PreviewPanel({
  model,
  stale,
}: {
  readonly model: TollPreviewModel;
  readonly stale: boolean;
}) {
  return (
    <div className="tx-detail__block">
      <h3>Kết quả đọc thử</h3>

      {/*
        Ban doc thu KHONG bi go xuong khi bieu nhap doi — no van la mot ket qua that, va nguoi van
        hanh can nhin no de biet minh vua sua gi. Cai phai doi la CAU no dang noi: tu "day la thu
        sap duoc ghi" thanh "day la thu cua ban nhap TRUOC do".
      */}
      {!stale ? null : (
        <p className="tx-note" role="status">
          Kết quả này thuộc về biểu nhập <strong>trước khi bạn sửa</strong>. Đọc thử lại để nó nói
          về bộ dữ liệu hiện tại.
        </p>
      )}

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
          <p className="tx-panel__lead">{model.sampleNotice}</p>
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
function TollImportHistory({
  navigation,
  onShowRows,
}: {
  readonly navigation: NavigationInput;
  readonly onShowRows?: (entry: TollImportRecord) => void;
}) {
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
      {/*
        `#314` — "PARSED_IMPLIES_ACCOUNTED=NO" noi bang CHU, ngay canh bang: mot lan nap thanh cong
        chi dua cac dong vao hang cho. Khong cot nao o day noi "da doi soat" hay "da thanh toan".
      */}
      <p className="tx-panel__lead">
        Nạp xong nghĩa là các dòng đã vào hàng chờ đối soát — chưa phải đã đối soát, càng không phải
        đã thanh toán.
      </p>

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
            ...(onShowRows === undefined
              ? []
              : [
                  {
                    key: 'rows-in-queue',
                    header: 'Dòng trong hàng chờ',
                    render: (row: TollImportRecord) => (
                      <button
                        type="button"
                        className="tx-btn tx-btn--small"
                        aria-label={`Xem các dòng của lần nạp ${row.sourceLabel}`}
                        onClick={() => onShowRows(row)}
                      >
                        Xem các dòng
                      </button>
                    ),
                  },
                ]),
          ]}
        />
      )}
    </section>
  );
}
