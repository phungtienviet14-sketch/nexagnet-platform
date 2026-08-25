'use client';

import { useState } from 'react';
import type { DebugTurn, DebugWorkflowRun, OrderDebugView } from '@netviet/shared';
import { fetchOrderDebug } from '../../lib/api';
import { clockOf, durationLines, technicalFacts } from '../../lib/order-debug';
import { TraceViewer } from './TraceViewer';

/**
 * MAN HINH "LUONG XU LY" cua mot don.
 *
 * ---------------------------------------------------------------------------
 * NGUYEN TAC TRINH BAY — thu tu doc phai la thu tu nguoi ta hoi:
 *
 *   1. Chuyen gi da xay ra?      cac luot, theo thoi gian, ten kenh bang tieng Viet
 *   2. Co viec nao dang cho?     workflow, ten nghiep vu truoc, khoa may sau
 *   3. Mat bao lau?              hai con so, moi con so mot cau giai thich
 *   4. Tra cuu o dau?            neo ky thuat, nam duoi mot cong tac
 *
 * TEN NGHIEP VU DUNG TRUOC, KHOA MAY DUNG SAU va nho hon. Nguoi dung khong can biet Hatchet ton
 * tai truoc khi hieu "dang cho den han nhac"; nguoi debug thi can dan `sales-handoff-followup.v1`
 * vao o tim cua engine. Hien ca hai, khong chon mot.
 *
 * Component nay CO Y "cam": moi nhan tieng Viet, moi phep gom va moi phep dinh dang deu da lam o
 * cho khac (`order-debug.builder.ts` o API, `lib/order-debug.ts` o day). O day khong co mot cau
 * chu nao duoc sinh ra tu du lieu.
 */

/** Trang thai cua panel. Khong co `empty`: don cu khong con luot van la mot cau tra loi hop le. */
type PanelState = 'idle' | 'loading' | 'ready' | 'error';

function useOrderFlow(orderId: string) {
  const [view, setView] = useState<OrderDebugView | null>(null);
  const [state, setState] = useState<PanelState>('idle');

  const open = async (): Promise<void> => {
    setState('loading');
    try {
      setView(await fetchOrderDebug(orderId));
      setState('ready');
    } catch {
      // Quan sat hong KHONG duoc lam hong man hinh nghiep vu — cung tinh than fail-open voi
      // tang telemetry o API.
      setState('error');
    }
  };

  const close = (): void => {
    setView(null);
    setState('idle');
  };

  return { view, state, open, close };
}

function TurnBlock({ turn, index }: { turn: DebugTurn; index: number }) {
  return (
    <li className="of-turn">
      <div className="of-turn-head">
        <span className="of-turn-time">{clockOf(turn.startedAt)}</span>
        <b className="of-turn-channel">{turn.channelLabel}</b>
        {turn.channel && <code className="tv-code">{turn.channel}</code>}
        {turn.derived && (
          <span className="of-badge" title="Lượt này do một lượt khác gây ra">
            lượt tiếp nối
          </span>
        )}
      </div>
      {/*
        Dung lai `TraceViewer` cho tung luot thay vi ve lai cay: cay do da co cong tac an/hien chi
        tiet ky thuat va da to mau theo ket cuc. Hai ban cua cung mot cay se troi khoi nhau.
      */}
      <TraceViewer trace={turn.view} label={`Lượt ${index + 1}`} />
    </li>
  );
}

function WorkflowBlock({ run }: { run: DebugWorkflowRun }) {
  return (
    <li className="of-wf">
      <div className="of-wf-head">
        <div className="of-wf-name">
          <b>{run.displayName}</b>
          <code className="tv-code">{run.engineName}</code>
        </div>
        <span className="of-badge">{run.handoffStatusLabel}</span>
      </div>

      {run.description && <p className="of-wf-desc">{run.description}</p>}

      {run.engineStatusLabel && (
        <div className="of-wf-line">
          <span>Trạng thái ở engine:</span> <b>{run.engineStatusLabel}</b>
          <code className="tv-code">{run.engineStatus}</code>
        </div>
      )}

      {/*
        NGUON GOC cua con so "Thời gian workflow" o dau man hinh. Hien hai moc canh nhau de nguoi
        doc KIEM DUOC phep tru do — mot con so thoi luong khong kem moc thi khong ai bac bo duoc,
        va chinh cho khong bac bo duoc la cho mot con so sai song lau.
      */}
      {run.engineStartedAt && (
        <div className="of-wf-line">
          <span>Engine chạy:</span>{' '}
          <b>
            {clockOf(run.engineStartedAt)}
            {run.engineFinishedAt ? ` → ${clockOf(run.engineFinishedAt)}` : ' → (chưa kết thúc)'}
          </b>
        </div>
      )}

      {run.attempts > 1 && (
        <div className="of-wf-line of-warn">Đã thử bàn giao {run.attempts} lần.</div>
      )}
      {run.lastError && <div className="of-wf-line of-warn">Lỗi gần nhất: {run.lastError}</div>}

      <ol className="of-steps">
        {run.steps.map((step) => (
          <li className="of-step" key={step.key}>
            <div className="of-step-head">
              <b>{step.label}</b>
              <code className="tv-code">{step.key}</code>
            </div>
            {step.description && <p className="of-step-desc">{step.description}</p>}
          </li>
        ))}
      </ol>

      {run.dashboardUrl && (
        <a
          className="btn btn-ghost of-wf-link"
          href={run.dashboardUrl}
          target="_blank"
          rel="noreferrer noopener"
        >
          Mở trong engine
        </a>
      )}
    </li>
  );
}

function TechnicalBlock({ view }: { view: OrderDebugView }) {
  const [open, setOpen] = useState(false);
  const facts = technicalFacts(view);

  return (
    <div className="of-tech">
      <button type="button" className="tv-toggle" onClick={() => setOpen((value) => !value)}>
        {open ? 'Ẩn thông tin kỹ thuật' : `Thông tin kỹ thuật (${facts.length} mục)`}
      </button>
      {open && (
        <dl className="of-tech-list">
          {facts.map((fact) => (
            <div className="of-tech-row" key={`${fact.label}-${fact.value}`}>
              <dt>{fact.label}</dt>
              <dd className={fact.copyable ? 'mono' : ''}>{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function FlowView({ view, onClose }: { view: OrderDebugView; onClose: () => void }) {
  const durations = durationLines(view);

  return (
    <div className="of" role="region" aria-label="Luồng xử lý đơn">
      <div className="of-head">
        <b>Luồng xử lý đơn</b>
        <button type="button" className="reply-copy" onClick={onClose}>
          Đóng
        </button>
      </div>

      {durations.length > 0 && (
        <div className="of-durations">
          {durations.map((line) => (
            <div className="of-duration" key={line.label}>
              <span className="of-duration-label">{line.label}</span>
              <b className="of-duration-value">{line.value}</b>
              {/* Cau giai thich di LIEN voi con so, khong nam trong tooltip: dung cai nghia nay
                  la thu ban cu lam nguoi doc hieu sai, nen no khong duoc phep an di. */}
              <span className="of-duration-hint">{line.hint}</span>
            </div>
          ))}
        </div>
      )}

      {view.turns.length > 0 ? (
        <ol className="of-turns">
          {view.turns.map((turn, index) => (
            <TurnBlock key={turn.view.traceId} turn={turn} index={index} />
          ))}
        </ol>
      ) : (
        <p className="of-empty">Chưa có dữ liệu lượt xử lý cho đơn này.</p>
      )}

      {view.workflows.length > 0 && (
        <>
          <h4 className="of-section">Quy trình bền vững đang theo đơn này</h4>
          <ol className="of-wfs">
            {view.workflows.map((run) => (
              <WorkflowBlock key={run.operationKey} run={run} />
            ))}
          </ol>
        </>
      )}

      {view.notes.length > 0 && (
        <ul className="of-notes">
          {view.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}

      <TechnicalBlock view={view} />
    </div>
  );
}

/**
 * Nut "Xem luong xu ly" + panel ket qua.
 *
 * TACH KHOI khoi hanh dong nghiep vu co chu y: xem luong la viec CHAN DOAN, khong phai mot buoc
 * trong quy trinh cua Sale. De lan vao cung hang voi "Duyet & gui" se lam mot nut vo hai trong
 * giong mot nut co hau qua.
 */
export function OrderFlowPanel({ orderId }: { orderId: string }) {
  const flow = useOrderFlow(orderId);

  if (flow.view) return <FlowView view={flow.view} onClose={flow.close} />;

  return (
    <div className="oc-trace-cta">
      <button
        type="button"
        className="btn btn-ghost"
        disabled={flow.state === 'loading'}
        onClick={() => void flow.open()}
      >
        {flow.state === 'loading' ? 'Đang tải luồng…' : 'Xem luồng xử lý'}
      </button>
      {flow.state === 'error' && (
        <span className="oc-trace-note">Không đọc được luồng xử lý lúc này.</span>
      )}
    </div>
  );
}
