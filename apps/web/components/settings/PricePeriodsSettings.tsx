'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  PRICE_PERIOD_KIND_LABELS,
  activateConfirmation,
  archiveConfirmation,
  buildPricePeriodBoard,
  canArchivePeriod,
  classifyPricePeriod,
  isTestOnlyPeriod,
  pricePeriodOrigin,
  removeRow,
  removeRowConfirmation,
  type HighImpactConfirmation,
  type PricePeriodPlan,
} from '../../lib/price-period-view';
import { createButtonInHeader, resolvePriceFocus } from '../../lib/price-focus';
import {
  fingerprintRows,
  resolvePriceWorkflow,
  type PriceCheckSnapshot,
} from '../../lib/price-workflow';
import { formatMonth } from '../../lib/settings-overview';
import { settingsApi, type PricePeriod, type PricePeriodPrice } from '../../lib/settings';
import { ConfirmDialog } from './ConfirmDialog';
import { PriceDraftWorkspace } from './PriceDraftWorkspace';
import { PriceRowsEditor } from './PriceRowsEditor';
import { PricePeriodWizard } from './PricePeriodWizard';
import { SettingsPanelState } from './SettingsPanelState';

/**
 * Man BANG GIA — bon khoi theo dung thu tu nguoi van hanh can doc (#126, #127).
 *
 *  1. Trang thai thang hien tai — chinh thuc / chay thu, chi doc.
 *  2. Cong viec dang lam — MOT ban nhap la khong gian lam viec chinh.
 *  3. Workflow — sua -> kiem -> kich hoat, do `resolvePriceWorkflow` quyet dinh.
 *  4. Lich su & ban nhap khac — gap lai, van mo ra xem duoc.
 *
 * Ban truoc de ba khoi "chinh thuc / chay thu / ban nhap" ngang hang nhau va bay het lich su ra
 * man hinh, nen no trong nhu mot trinh duyet co so du lieu chu khong phai mot viec phai lam.
 *
 * Thu tu thao tac khong con la viec cua nguoi dung nua: khong con nut `Kiểm tra bảng giá` rieng
 * de bam truoc khi luu, va nut Kich hoat khong ton tai cho toi khi may chu da xac nhan dat.
 *
 * TAP TRUNG THEO BUOC (#144). Bon khoi tren van con day du, nhung KHONG con cung trong luong: o
 * moi trang thai chi mot khoi duoc chiem uu the thi giac (`data-price-dominant`) va chi mot nut la
 * nut chinh (`data-price-primary`). Ai quyet dinh dieu do la `resolvePriceFocus` — mot ham thuan —
 * chu khong phai vai cai class rai trong JSX. Nho vay hai bat bien do DEM DUOC trong bai kiem tra.
 *
 * Tieu diem/cuon la THEO CHUYEN TIEP, khong theo lan render: chi cac thao tac that su doi buoc moi
 * goi `requestFocus()`. Mot lan `refetch` cua React Query khong goi, nen no khong the giat con tro
 * ra khoi o nguoi dung dang go.
 */

type Props = {
  dataClassificationTest: boolean;
  canConfigure: boolean;
};

type PendingConfirmation = {
  confirmation: HighImpactConfirmation;
  tone: 'danger' | 'primary';
  run: () => Promise<unknown>;
};

export function PricePeriodsSettings({ dataClassificationTest, canConfigure }: Props) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['settings-price-periods'],
    queryFn: settingsApi.pricePeriods,
  });
  const catalogueQuery = useQuery({
    queryKey: ['settings-source-truth'],
    queryFn: settingsApi.sourceTruth,
  });

  const view = query.data;
  const board = useMemo(() => (view ? buildPricePeriodBoard(view) : null), [view]);
  const products = useMemo(
    () =>
      (catalogueQuery.data ?? []).find((section) => section.resource === 'products')?.rows ?? [],
    [catalogueQuery.data],
  );
  const catalogue = useMemo(() => products.map((row) => row.code ?? row.id), [products]);
  const productNames = useMemo(
    () => new Map(products.map((row) => [row.code ?? row.id, row.label])),
    [products],
  );

  const [selectedId, setSelectedId] = useState('');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [rows, setRows] = useState<PricePeriodPrice[]>([]);
  const [check, setCheck] = useState<PriceCheckSnapshot | null>(null);
  const [notice, setNotice] = useState<string>();
  const [localError, setLocalError] = useState<string>();
  const [pending, setPending] = useState<PendingConfirmation | null>(null);
  const [removingSku, setRemovingSku] = useState<string | null>(null);
  const [importText, setImportText] = useState('[]');

  /**
   * Tieu diem THEO CHUYEN TIEP.
   *
   * `focusTick` chi tang khi nguoi dung that su doi buoc — mo trinh tao, sang buoc khac, kiem xong,
   * quay lai sua, kich hoat xong. Khoi dang chiem uu the tu danh dau tieu de cua no bang
   * `data-price-focus-target`, va o day chi co dung MOT lan `querySelector`. Vi khong co
   * `useEffect` nao phu thuoc vao du lieu tra ve, mot lan `refetch` khong bao gio cuop tieu diem
   * (#144 "focus/scroll phai theo chuyen tiep, khong theo render").
   */
  const sectionRef = useRef<HTMLElement>(null);
  const [focusTick, setFocusTick] = useState(0);
  const requestFocus = () => setFocusTick((tick) => tick + 1);

  useEffect(() => {
    // 0 = lan dung o day vi trang vua tai xong, khong phai vi nguoi dung vua lam gi.
    if (focusTick === 0) return;
    const target = sectionRef.current?.querySelector<HTMLElement>(
      '[data-price-focus-target="true"]',
    );
    if (!target) return;
    target.focus();
    // Khong dat `behavior: 'smooth'`: dung dan khong duoc phu thuoc vao hoat anh, va nguoi bat
    // `prefers-reduced-motion` van phai thay dung khoi do (CSS da khoa `scroll-behavior`).
    target.scrollIntoView({ block: 'start' });
  }, [focusTick]);

  // Ky dang mo: uu tien ky nguoi dung chon, roi den ban nhap dau tien — ban nhap la thu duy nhat
  // con sua duoc, nen mo san mot ky chi doc chi lam nguoi ta tuong minh khong sua duoc gi.
  const selected: PricePeriod | undefined = useMemo(() => {
    if (!view) return undefined;
    if (selectedId) return view.periods.find((period) => period.id === selectedId);
    return board?.drafts[0] ?? board?.official ?? view.periods[0];
  }, [board, selectedId, view]);

  const draftId = selected?.status === 'draft' ? selected.id : '';

  /**
   * Nap lai khong gian lam viec khi DOI KY — va CHI khi doi ky.
   *
   * Cai bay o day: moi lan `refresh()` chay xong, React Query tra ve mot doi tuong ky MOI, nen mot
   * `useEffect([selected])` tran se coi mot lan tai lai du lieu la mot lan doi ky. No xoa mat ket
   * qua kiem tra vua lay ve (nut Kich hoat bien mat ngay sau khi hien ra), va te hon — no ghi de
   * len nhung dong nguoi dung dang go do. Chot lai bang chinh ID cua ky.
   */
  const loadedPeriodRef = useRef('');
  useEffect(() => {
    const id = selected?.id ?? '';
    if (id === loadedPeriodRef.current) return;
    loadedPeriodRef.current = id;
    const current = selected ? selected.prices.map(({ id: _id, ...row }) => row) : [];
    setRows(current);
    setImportText(JSON.stringify(current, null, 2));
    setLocalError(undefined);
    // Ky khac la noi dung khac: mot lan kiem cua ky truoc khong duoc phep mo nut Kich hoat o day.
    setCheck(null);
  }, [selected]);

  const refresh = async () => {
    await client.invalidateQueries({ queryKey: ['settings-price-periods'] });
    await client.invalidateQueries({ queryKey: ['settings-summary'] });
    await client.invalidateQueries({ queryKey: ['settings', 'readiness'] });
  };

  const create = useMutation({
    mutationFn: (plan: PricePeriodPlan) =>
      plan.api === 'copy'
        ? settingsApi.copyPricePeriod(plan.sourcePeriodId!, plan.validMonth)
        : settingsApi.createPricePeriod(plan.validMonth, plan.note, plan.testOnly),
    onSuccess: async (period) => {
      setSelectedId(period.id);
      setWizardOpen(false);
      setNotice(
        isTestOnlyPeriod(period)
          ? `Đã tạo bản nháp CHỈ ĐỂ CHẠY THỬ cho ${formatMonth(period.validMonth ?? '')}. Bản nháp chưa áp dụng cho đơn nào.`
          : `Đã tạo bản nháp cho ${formatMonth(period.validMonth ?? '')} với ${period.prices.length} mặt hàng. Bản nháp chưa áp dụng cho đơn nào.`,
      );
      // Dua con tro SAU khi tai lai xong. Ky vua tao chua co trong danh sach da cache, nen goi
      // `requestFocus()` som hon se nham vao man hinh cua trang thai CU.
      await refresh();
      requestFocus();
    },
  });

  // `rows` di vao ham nhu THAM SO, khong doc tu closure: cai duoc LUU va cai duoc dong dau van
  // tay phai la CUNG mot mang, khong phai hai lan doc state cach nhau mot vong render.
  const apply = useMutation({
    mutationFn: (payload: readonly PricePeriodPrice[]) =>
      settingsApi.applyPriceImport(draftId, payload, true),
  });
  const validate = useMutation({ mutationFn: () => settingsApi.validatePricePeriod(draftId) });
  const activate = useMutation({
    mutationFn: (expectedFingerprint: string) =>
      settingsApi.activatePricePeriod(draftId, expectedFingerprint),
  });
  const archive = useMutation({ mutationFn: (id: string) => settingsApi.archivePricePeriod(id) });
  const removeDraftRow = useMutation({
    mutationFn: (sku: string) => settingsApi.removeDraftPriceRow(draftId, sku),
  });

  const mutationError =
    create.error ??
    apply.error ??
    validate.error ??
    activate.error ??
    archive.error ??
    removeDraftRow.error;
  const busy =
    create.isPending ||
    apply.isPending ||
    validate.isPending ||
    activate.isPending ||
    archive.isPending;

  const workflow = resolvePriceWorkflow({
    period: selected ?? null,
    currentMonth: board?.currentMonth ?? view?.currentMonth ?? '',
    canConfigure,
    rows,
    check,
  });

  const focus = resolvePriceFocus({
    wizardOpen,
    workflowMode: workflow.mode,
    hasSelection: Boolean(selected),
    canConfigure,
  });

  const openWizard = () => {
    setWizardOpen(true);
    setNotice(undefined);
    requestFocus();
  };

  const selectPeriod = (id: string) => {
    setSelectedId(id);
    requestFocus();
  };

  /**
   * Cac the ngu canh chi mang nut khi KHONG co viec nao dang lam. Dang giua mot buoc thi mot nut
   * "Xem chi tiết" o do chi la mot ngo re khoi viec — bo han khoi DOM chu khong an bang CSS, de
   * no cung khong con nam trong duong Tab.
   */
  const showContextActions = focus.contextActions;

  const askArchive = (period: PricePeriod) => {
    if (!board) return;
    setPending({
      confirmation: archiveConfirmation(period, board),
      tone: 'danger',
      run: async () => {
        await archive.mutateAsync(period.id);
        setSelectedId('');
        setNotice(
          period.status === 'draft'
            ? `Đã lưu trữ bản nháp ${formatMonth(period.validMonth ?? '')}.`
            : `Đã lưu trữ bảng giá ${formatMonth(period.validMonth ?? '')}. Kỳ này thôi áp dụng từ bây giờ.`,
        );
        await refresh();
        requestFocus();
      },
    });
  };

  const askRemoveRow = (sku: string) => {
    setPending({
      confirmation: removeRowConfirmation(sku, rows.length - 1),
      tone: 'danger',
      run: async () => {
        setRemovingSku(sku);
        try {
          await removeDraftRow.mutateAsync(sku);
          // Bo khoi state NGAY, nhung nguon su that la lan tai lai ben duoi: dong da bi xoa han
          // khoi co so du lieu chu khong chi bien khoi man hinh (Issue #116 acceptance 3-4).
          setRows((current) => removeRow(current, sku));
          setNotice(`Đã xóa ${sku} khỏi bản nháp.`);
          await refresh();
        } finally {
          setRemovingSku(null);
        }
      },
    });
  };

  const saveForLater = async () => {
    setLocalError(undefined);
    const persist = workflow.persistRequired;
    try {
      if (persist) await apply.mutateAsync(rows);
      setNotice(
        persist
          ? 'Đã lưu bản nháp. Bảng giá đang áp dụng chưa thay đổi.'
          : 'Bản nháp đang trống nên chưa có gì để lưu. Thêm mặt hàng rồi lưu lại.',
      );
      await refresh();
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Không lưu được bản nháp.');
    }
  };

  /**
   * MOT nut lam ca hai viec, dung thu tu: LUU truoc, KIEM sau.
   *
   * Day la cho sua loi goc cua #126 muc 3. `validate()` phia may chu doc dong DA LUU, nen kiem
   * truoc khi luu la kiem mot ban nhap 0 dong — va tra ve "Thiếu giá cho SKU: …" cho mot bang
   * gia dang hien day du tren man hinh. Gop hai buoc lai thi khong con thu tu nao de bam sai.
   */
  const checkAndContinue = async () => {
    setLocalError(undefined);
    setNotice(undefined);
    const snapshot = rows.map((row) => ({ ...row }));
    try {
      if (workflow.persistRequired) await apply.mutateAsync(snapshot);
      const validation = await validate.mutateAsync();
      // Man Xem lai phai dung tu DONG DA LUU do may chu tra ve, khong phai tu `snapshot` vua gui
      // len. Hai thu do co the LECH: `applyImport()` chi upsert va khong bao gio prune, nen mot
      // lan nap hang loat chi co A vao ky dang co A+B se de lai B tren may chu (Issue #132 ca A).
      // Doc lai `rows` theo may chu de cai nguoi dung doc dung la cai sap duoc kich hoat.
      const persisted = validation.rows;
      setRows(persisted.map((row) => ({ ...row })));
      setCheck({
        localFingerprint: fingerprintRows(persisted),
        serverFingerprint: validation.fingerprint,
        rows: persisted,
        validation,
      });
      // Dat thi sang man Xem lai, khong dat thi o lai buoc sua — ca hai deu la MOT chuyen tiep, va
      // ca hai deu co mot tieu de dung dan de dua con tro toi.
      requestFocus();
      await refresh();
    } catch (error) {
      setCheck(null);
      setLocalError(
        error instanceof Error ? error.message : 'Không lưu và kiểm tra được bản nháp.',
      );
    }
  };

  const askActivate = () => {
    if (!selected || !board) return;
    setPending({
      confirmation: activateConfirmation(selected, workflow.reviewRows, board),
      tone: 'primary',
      run: async () => {
        try {
          // Xuat trinh lai dung the may chu cap luc kiem. May chu doi chieu duoi khoa hang, nen
          // mot nguoi khac vua sua ban nhap thanh bo gia khac se lam buoc nay tra 409 thay vi
          // kich hoat im lang mot noi dung chua ai duyet (Issue #132 ca B).
          const activated = await activate.mutateAsync(check?.serverFingerprint ?? '');
          setNotice(
            `Đã kích hoạt bảng giá ${formatMonth(activated.validMonth ?? '')}${
              isTestOnlyPeriod(activated) ? ' (chỉ để chạy thử)' : ''
            }.`,
          );
        } finally {
          // May chu cham diem lai lan nua duoi khoa hang. No tu choi nghia la anh chup vua xem
          // khong con dung — bo ket qua kiem cu di de nguoi dung phai kiem lai tren du lieu moi.
          setCheck(null);
          // Kich hoat xong, thu chinh tren man hinh la TRANG THAI, khong phai o nhap nao ca.
          // Phai doi `refresh()` xong: truoc do ky VAN con la ban nhap trong cache, nen man hinh
          // chua chuyen sang che do chi doc va con tro se dap vao tieu de cua buoc sua.
          await refresh();
          requestFocus();
        }
      },
    });
  };

  const runPending = async () => {
    if (!pending) return;
    try {
      await pending.run();
      setPending(null);
    } catch (error) {
      setPending(null);
      setLocalError(error instanceof Error ? error.message : 'Không thực hiện được thao tác.');
    }
  };

  const loadImportText = () => {
    try {
      const parsed: unknown = JSON.parse(importText);
      if (!Array.isArray(parsed)) throw new Error('Dữ liệu phải là một danh sách.');
      setRows(parsed as PricePeriodPrice[]);
      setLocalError(undefined);
      setNotice('Đã nạp dữ liệu vào bảng. Kiểm tra lại rồi bấm Kiểm tra & tiếp tục.');
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Dữ liệu không hợp lệ.');
    }
  };

  if (query.isPending) {
    return <SettingsPanelState title="Đang tải bảng giá…" detail="Đọc các kỳ giá đã lưu." />;
  }
  if (query.error || !view || !board) {
    return (
      <SettingsPanelState
        tone="error"
        title="Không đọc được bảng giá"
        detail="Thử tải lại trang. Nếu vẫn lỗi, hệ thống vẫn an toàn: đơn được chuyển về cho Sale."
      />
    );
  }

  const otherDrafts = board.drafts.filter((draft) => draft.id !== selected?.id);
  const history = [...board.pastActive, ...board.archived];

  return (
    <section
      ref={sectionRef}
      className="settings-section-stack settings-price"
      aria-label="Bảng giá"
      data-price-stage={focus.stage}
      data-price-context={focus.contextDensity}
    >
      <header className="settings-section-heading">
        <div>
          <p className="settings-eyebrow">Giá áp dụng cho đơn mới</p>
          <h2>Bảng giá</h2>
          <p>
            Hệ thống chỉ dùng bảng giá <b>chính thức</b> của đúng tháng hiện tại. Không có bảng giá
            đó thì mọi câu hỏi giá và đơn hàng được chuyển về cho Sale.
          </p>
        </div>
        {createButtonInHeader(focus) && (
          <button
            type="button"
            className={`settings-button settings-button--${
              focus.createButton === 'header-primary' ? 'primary' : 'quiet'
            }`}
            data-price-primary={focus.createButton === 'header-primary' ? 'true' : undefined}
            onClick={openWizard}
          >
            Tạo bảng giá
          </button>
        )}
      </header>

      {notice && <SettingsPanelState tone="success" title="Đã xong" detail={notice} />}

      {wizardOpen && (
        <PricePeriodWizard
          currentMonth={board.currentMonth}
          periods={view.periods}
          dataClassificationTest={dataClassificationTest}
          pending={create.isPending}
          {...(create.error ? { error: create.error.message } : {})}
          onCancel={() => setWizardOpen(false)}
          onStepChange={requestFocus}
          onSubmit={(plan) => create.mutate(plan)}
        />
      )}

      {/* ---- 1. Trang thai thang hien tai ----------------------------------------------------
          Khi dang co mot viec (`compact`), khoi nay lui ve mot dai NGU CANH: chu nho hon, khong
          co nut, khong tranh cho voi khoi dang lam viec. Nhung SU THAT thi khong bi giau — "Chưa
          có bảng giá chính thức" va "đang có kỳ chạy thử" van doc duoc o moi trang thai (#144
          "Never hide: current official pricing truth; current UAT truth when active"). */}
      <div className="settings-price-board" data-density={focus.contextDensity}>
        <article
          className={`settings-price-card settings-price-card--${board.official ? 'official' : 'missing'}`}
        >
          <p className="settings-eyebrow">
            Bảng giá chính thức · {formatMonth(board.currentMonth)}
          </p>
          {board.official ? (
            <>
              <strong>Đang áp dụng</strong>
              <p>
                {board.official.prices.length} mặt hàng · {pricePeriodOrigin(board.official)}
              </p>
              {showContextActions && (
                <div className="settings-price-card__actions">
                  <button
                    type="button"
                    className="settings-button settings-button--quiet"
                    onClick={() => selectPeriod(board.official!.id)}
                  >
                    Xem chi tiết
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <strong>Chưa có</strong>
              <p>
                Tháng này chưa có bảng giá chính thức, nên hệ thống chưa tự báo giá hay chốt đơn
                được.
              </p>
            </>
          )}
        </article>

        {board.testOnly && (
          <article className="settings-price-card settings-price-card--test">
            <p className="settings-eyebrow">Chỉ để chạy thử (UAT)</p>
            <strong>{formatMonth(board.testOnly.validMonth ?? '')}</strong>
            <p>
              {board.testOnly.prices.length} mặt hàng có giá để chạy thử. Đây <b>không</b> phải bảng
              giá chính thức và không làm hệ thống được coi là đủ điều kiện chạy thật.
            </p>
            {showContextActions && (
              <div className="settings-price-card__actions">
                <button
                  type="button"
                  className="settings-button settings-button--quiet"
                  onClick={() => selectPeriod(board.testOnly!.id)}
                >
                  Xem chi tiết
                </button>
              </div>
            )}
          </article>
        )}
      </div>

      {/* ---- 2 + 3. Cong viec dang lam, va ba buoc de xong no --------------------------------
          Trinh tao dang mo thi khoi nay KHONG ve. Hai khong gian lam viec cung luc, moi cai mot
          nut chinh, la dung thu #144 bat bo: nguoi van hanh phai tu chon dang lam viec nao. */}
      {focus.dominantRegion === 'work' && selected && workflow.mode !== 'read-only' && (
        <PriceDraftWorkspace
          period={selected}
          state={workflow}
          rows={rows}
          onRowsChange={setRows}
          catalogue={catalogue}
          productNames={productNames}
          busy={busy}
          saving={apply.isPending && !validate.isPending}
          checking={validate.isPending}
          removingSku={removingSku}
          importText={importText}
          onImportTextChange={setImportText}
          onImportLoad={loadImportText}
          onRemoveRow={askRemoveRow}
          onArchiveDraft={() => askArchive(selected)}
          onSaveForLater={() => void saveForLater()}
          onCheckAndContinue={() => void checkAndContinue()}
          onBackToEdit={() => {
            setCheck(null);
            requestFocus();
          }}
          onActivate={askActivate}
        />
      )}

      {focus.dominantRegion === 'status' && selected && workflow.readOnly && (
        <section
          className="settings-price-work"
          aria-labelledby="settings-price-readonly-title"
          data-price-dominant="true"
        >
          <header className="settings-price-work__head">
            <p className="settings-eyebrow">
              {PRICE_PERIOD_KIND_LABELS[classifyPricePeriod(selected, board.currentMonth)]} ·{' '}
              {pricePeriodOrigin(selected)}
            </p>
            <h3 id="settings-price-readonly-title" tabIndex={-1} data-price-focus-target="true">
              {workflow.readOnly.title}
            </h3>
            <p className="settings-muted">{workflow.readOnly.detail}</p>
          </header>

          <PriceRowsEditor
            rows={rows}
            onChange={setRows}
            productNames={productNames}
            readOnly
            disabled={busy}
          />

          {/* Thao tac VONG DOI, khong phai buoc cua luong — nen o day khong co nut chinh nao.
              Duong tao ky moi da nam o dai tieu de roi; ve them mot nut "Tạo bản nháp mới" o day
              la dung hai nut chinh cho cung mot viec (#144 §7 "lifecycle actions are secondary"). */}
          <div className="settings-price-actions">
            <button
              type="button"
              className="settings-button settings-button--quiet"
              onClick={() => selectPeriod('')}
            >
              Đóng
            </button>
            <div className="settings-price-actions__primary">
              {workflow.readOnly.canArchive && canArchivePeriod(selected) && (
                <button
                  type="button"
                  className="settings-button settings-button--danger-quiet"
                  disabled={busy}
                  onClick={() => askArchive(selected)}
                >
                  Lưu trữ bảng giá
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ---- Chua co viec nao: viec can lam la BAT DAU -------------------------------------
          Khong ve mot "khong gian lam viec" rong trong nhu bam duoc. Chi mot cau noi ro dang o
          dau, va mot nut duy nhat de bat dau (#144 §1). */}
      {focus.dominantRegion === 'start' && (
        <section
          className="settings-price-start"
          aria-labelledby="settings-price-start-title"
          data-price-dominant="true"
        >
          <p className="settings-eyebrow">Việc cần làm</p>
          <h3 id="settings-price-start-title" tabIndex={-1} data-price-focus-target="true">
            {board.official ? 'Chưa có việc nào đang làm' : 'Chưa có bảng giá cho tháng này'}
          </h3>
          <p className="settings-muted">
            {board.official
              ? 'Bản nháp là nơi sửa giá an toàn — chưa ảnh hưởng đơn nào cho tới khi kích hoạt.'
              : 'Tạo một bản nháp, nhập giá, kiểm tra rồi kích hoạt. Trước bước kích hoạt cuối cùng, không đơn nào bị ảnh hưởng.'}
          </p>
          {focus.createButton === 'start-primary' && (
            <button
              type="button"
              className="settings-button settings-button--primary settings-price-start__cta"
              data-price-primary="true"
              onClick={openWizard}
            >
              Tạo bảng giá
            </button>
          )}
        </section>
      )}

      {/* ---- 4. Lich su & ban nhap khac — gap lai, khong mat duong vao ---- */}
      {(otherDrafts.length > 0 || history.length > 0) && (
        <details
          className="settings-archive-list"
          data-price-background={focus.backgroundContent ? 'true' : undefined}
        >
          <summary>Lịch sử &amp; bản nháp khác ({otherDrafts.length + history.length})</summary>
          {otherDrafts.length > 0 && (
            <ul className="settings-price-draft-list">
              {otherDrafts.map((draft) => (
                <li key={draft.id}>
                  <span>
                    <strong>{formatMonth(draft.validMonth ?? '')}</strong>
                    <small>
                      Bản nháp · {draft.prices.length} mặt hàng · {pricePeriodOrigin(draft)}
                      {isTestOnlyPeriod(draft) ? ' · chỉ để chạy thử' : ''}
                    </small>
                  </span>
                  <span className="settings-price-card__actions">
                    <button
                      type="button"
                      className="settings-button settings-button--quiet"
                      onClick={() => selectPeriod(draft.id)}
                    >
                      Mở để sửa
                    </button>
                    {canConfigure && (
                      <button
                        type="button"
                        className="settings-button settings-button--danger-quiet"
                        disabled={busy}
                        aria-label={`Lưu trữ bản nháp ${draft.validMonth ?? ''}`}
                        onClick={() => askArchive(draft)}
                      >
                        Lưu trữ bản nháp
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {history.length > 0 && (
            <ul>
              {history.map((period) => (
                <li key={period.id}>
                  <button
                    type="button"
                    className="settings-text-action"
                    onClick={() => selectPeriod(period.id)}
                  >
                    {formatMonth(period.validMonth ?? '')} ·{' '}
                    {PRICE_PERIOD_KIND_LABELS[classifyPricePeriod(period, board.currentMonth)]} ·{' '}
                    {period.prices.length} mặt hàng
                  </button>
                </li>
              ))}
            </ul>
          )}
        </details>
      )}

      {(localError || mutationError) && (
        <SettingsPanelState
          tone="error"
          title="Chưa thực hiện được"
          detail={localError ?? mutationError?.message ?? 'Lỗi không xác định.'}
        />
      )}

      {pending && (
        <ConfirmDialog
          confirmation={pending.confirmation}
          tone={pending.tone}
          pending={busy || removeDraftRow.isPending}
          onConfirm={runPending}
          onCancel={() => setPending(null)}
        />
      )}
    </section>
  );
}
