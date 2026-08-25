import type { OrderDebugView } from '@netviet/shared';

/**
 * TRINH BAY cua man hinh "Luong xu ly" — thuan, khong React.
 *
 * Tach khoi component vi mot ly do rat cu the: bo kiem cua `apps/web` chay o moi truong `node`
 * va chi nhan `lib/**` (`vitest.config.ts`). Logic nao dang cong nhat o day — dinh dang mot
 * khoang thoi gian, gom cac neo ky thuat — deu la logic co the SAI, nen no phai nam o cho kiem
 * duoc. Component chi con viec ve.
 *
 * NHAN o day la TIENG VIET; ma ky thuat di kem khong bao gio bi dich.
 */

/** Mot giay tinh bang mili giay — dat ten de khong co con so tran trui trong phep chia. */
const MS_PER_SECOND = 1_000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;

/**
 * Khoang thoi gian, doc len bang tieng Viet.
 *
 * ---------------------------------------------------------------------------
 * VI SAO KHONG DUNG MOT DON VI CHO MOI TRUONG HOP:
 *
 * Man hinh nay hien hai con so co do lon cach nhau ba bac: mot lan xu ly dong bo (vai chuc mili
 * giay) va mot lan cho ben vung (vai chuc giay den vai gio). In ca hai bang `ms` se lam con so
 * thu hai thanh mot day chu so khong ai doc duoc — va chinh cho do la cho ban cu doc SAI nghia.
 *
 * `0` KHONG bi doi thanh "duoi 1 giay": mot phep do ra 0 mili giay la mot cau tra loi that
 * ("nhanh hon do phan giai cua dong ho"), va lam tron no len se bia them thong tin.
 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return 'không xác định';
  if (ms < MS_PER_SECOND) return `${Math.round(ms)} ms`;

  const totalSeconds = Math.round(ms / MS_PER_SECOND);
  if (totalSeconds < SECONDS_PER_MINUTE) return `${totalSeconds} giây`;

  const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
  const seconds = totalSeconds % SECONDS_PER_MINUTE;
  if (minutes < MINUTES_PER_HOUR) {
    return seconds === 0 ? `${minutes} phút` : `${minutes} phút ${seconds} giây`;
  }

  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  const restMinutes = minutes % MINUTES_PER_HOUR;
  return restMinutes === 0 ? `${hours} giờ` : `${hours} giờ ${restMinutes} phút`;
}

/** Gio:phut:giay cua mot moc ISO. Giay CO MAT o day — man hinh nay doc thu tu trong mot phut. */
export function clockOf(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '—';
  return at.toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** Mot dong trong bang "Thong tin ky thuat": nhan nguoi doc + gia tri de dan di tra cuu. */
export interface TechnicalFact {
  readonly label: string;
  readonly value: string;
  /** `true` = chuoi dinh danh, ve bang font mono va cho copy. */
  readonly copyable: boolean;
}

/**
 * Gom cac NEO TRA CUU cua mot man hinh thanh mot bang.
 *
 * ---------------------------------------------------------------------------
 * VI SAO GOM O DAY chu khong rai trong JSX:
 *
 * Bang nay chinh la thu nguoi debug dan sang he khac — o tim cua engine, lenh grep tren may chu,
 * o loc cua ClickStack. No phai DAY DU va co thu tu on dinh. Xay no trong JSX bang mot chuoi
 * `{x && <tr>…}` se lam thu tu doi theo du lieu va lam mot truong am tham bien mat khi ai do
 * sua bo cuc.
 *
 * Truong nao khong co thi KHONG hien ra — khac han hien mot dong rong. Mot o trong doc len la
 * "gia tri la rong", con vang mat doc len la "khong co du lieu"; o man hinh nay hai chuyen do
 * dan toi hai huong tim khac nhau.
 */
export function technicalFacts(view: OrderDebugView): readonly TechnicalFact[] {
  const facts: TechnicalFact[] = [
    { label: 'Mã đơn', value: view.orderId, copyable: true },
    {
      label: 'Khách hàng · môi trường',
      value: `${view.tenant} · ${view.environment}`,
      copyable: false,
    },
  ];

  if (view.release) {
    facts.push({ label: 'Bản phát hành', value: view.release, copyable: true });
  }

  // Luot dau tien la luot GOC (khi con giu duoc) — traceId cua no la thu de tra log.
  for (const [index, turn] of view.turns.entries()) {
    facts.push({
      label: index === 0 ? 'Trace ID (lượt đầu)' : `Trace ID (lượt ${index + 1})`,
      value: turn.view.traceId,
      copyable: true,
    });
  }

  for (const workflow of view.workflows) {
    facts.push({ label: 'Operation key', value: workflow.operationKey, copyable: true });
    if (workflow.engineRunId) {
      facts.push({ label: 'Engine run ID', value: workflow.engineRunId, copyable: true });
    }
  }

  return facts;
}

/**
 * HAI CON SO THOI GIAN, kem cau giai thich nghia — khong bao gio hien mot con so tran trui.
 *
 * Day la cho ban cu noi doi: no in `totalMs` cua mot luot canh tenant/release, khong nhan, va
 * nguoi doc ket luan do la tong thoi gian xu ly cua ca don. Voi mot day nhan qua di qua mot lan
 * cho ben vung thi ket luan do lech ba bac do lon.
 */
export interface DurationLine {
  readonly label: string;
  readonly value: string;
  readonly hint: string;
}

export function durationLines(view: OrderDebugView): readonly DurationLine[] {
  const lines: DurationLine[] = [];

  if (view.durations.synchronousMs !== undefined) {
    lines.push({
      label: 'Thời gian xử lý đồng bộ',
      value: formatDuration(view.durations.synchronousMs),
      hint: 'Máy làm việc trong lượt đầu tiên. Không bao gồm thời gian chờ bền vững.',
    });
  }

  if (view.durations.causalSpanMs !== undefined) {
    lines.push({
      label: 'Khoảng từ lượt đầu tới lượt cuối',
      value: formatDuration(view.durations.causalSpanMs),
      hint: 'Có bao gồm cả lần chờ bền vững của workflow.',
    });
  }

  return lines;
}
