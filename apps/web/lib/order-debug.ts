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
 * BA CON SO THOI GIAN, kem cau giai thich nghia — khong bao gio hien mot con so tran trui.
 *
 * ---------------------------------------------------------------------------
 * DAY LA CHO DA NOI DOI HAI LAN, va lan thu hai kho thay hon lan dau:
 *
 * ① Ban dau tien in `totalMs` cua mot luot canh tenant/release, khong nhan. Nguoi doc ket luan
 *    do la tong thoi gian xu ly cua ca don, va ket luan do lech ba bac do lon.
 *
 * ② Ban sua loi ① dan cau "Có bao gồm cả lần chờ bền vững của workflow." vao hieu timestamp giua
 *    cac LUOT. Con so thi dung, cau noi thi sai: mot lan cho ben vung KHONG SINH THEM LUOT —
 *    worker goi nguoc ve va duoc noi vao mach hoi thoai dang co. Do duoc tren gd1-test:
 *    `sales-handoff-followup.v1` cho 90 giay, chay tong 95 giay, khoang giua cac luot ra 2 giay,
 *    va man hinh in "2 giây — có bao gồm cả lần chờ bền vững".
 *
 * Nen tu day ba con so, ba nguon, ba cau hoi khac han nhau:
 *
 *   Thoi gian xu ly dong bo   tu cac BUOC trong luot goc   may lam viec bao lau
 *   Thoi gian workflow        tu MOC CUA ENGINE            ke ca lan cho ben vung
 *   Khoang giua cac luot      tu timestamp cac LUOT        cac luot con ghi lai cach nhau bao xa
 *
 * Cau "chờ bền vững" chi duoc phep dung canh con so thu hai — hoac canh con so thu nhat de noi
 * rang no KHONG bao gom. `order-debug.test.ts` khoa dieu do lai.
 */
export interface DurationLine {
  readonly label: string;
  readonly value: string;
  readonly hint: string;
}

/** Hien khi khong do duoc. KHONG phai "0", vi "0" doc len la mot phep do da xay ra. */
const UNMEASURED = 'chưa xác định';

export function durationLines(view: OrderDebugView): readonly DurationLine[] {
  const lines: DurationLine[] = [];

  if (view.durations.synchronousMs !== undefined) {
    lines.push({
      label: 'Thời gian xử lý đồng bộ',
      value: formatDuration(view.durations.synchronousMs),
      hint: 'Máy làm việc trong lượt đầu tiên. Không bao gồm thời gian chờ bền vững.',
    });
  }

  lines.push(...workflowDurationLines(view));

  if (view.durations.turnIntervalMs !== undefined) {
    lines.push({
      label: 'Khoảng giữa các lượt được ghi nhận',
      value: formatDuration(view.durations.turnIntervalMs),
      hint:
        'Đo từ lúc bắt đầu lượt đầu tới lúc bắt đầu lượt cuối còn trong dữ liệu debug. ' +
        'Không phải thời gian workflow: lượt cũ có thể đã rời bộ đệm, và một lần chờ của ' +
        'workflow không sinh thêm lượt nào.',
    });
  }

  return lines;
}

/**
 * MOT DONG CHO MOI LAN BAN GIAO. Mot don co the kich nhieu workflow, va gop chung lam mot con so
 * se tao ra dung cai sai vua sua xong: mot con so khong ung voi thu gi co that.
 *
 * NHAN PHAI DUY NHAT — component dung nhan lam khoa React, hai nhan trung nhau lam mot dong am
 * tham bien mat. Nen co tu hai workflow tro len thi nhan mang them ten nghiep vu.
 */
function workflowDurationLines(view: OrderDebugView): readonly DurationLine[] {
  const many = view.workflows.length > 1;

  return view.workflows.map((workflow) => {
    const label = many ? `Thời gian workflow · ${workflow.displayName}` : 'Thời gian workflow';

    if (workflow.engineDurationMs !== undefined) {
      return {
        label,
        value: formatDuration(workflow.engineDurationMs),
        hint:
          'Tính từ khi workflow bắt đầu tới khi engine ghi nhận hoàn tất. ' +
          'Có bao gồm thời gian chờ bền vững.',
      };
    }

    // CHUA XONG, khac han KHONG BIET. Hai tinh huong nay dan nguoi debug di hai huong khac nhau,
    // nen chung khong duoc dung chung mot cau.
    if (workflow.engineStartedAt) {
      return {
        label,
        value: UNMEASURED,
        hint:
          `Workflow bắt đầu lúc ${clockOf(workflow.engineStartedAt)} và engine chưa ghi nhận ` +
          'mốc kết thúc — thường là vì nó vẫn đang chạy. Màn hình không tự đếm tiếp: một con ' +
          'số lớn dần mỗi lần mở là một phép đo giả.',
      };
    }

    return {
      label,
      value: UNMEASURED,
      hint:
        'Engine chưa cung cấp mốc bắt đầu/kết thúc cho lần chạy này. Thời gian workflow chỉ đo ' +
        'được từ mốc của engine, không suy ra được từ các lượt xử lý.',
    };
  });
}
