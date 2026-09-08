/**
 * KHOANH KHAC XE QUA TRAM tren mot sao ke ETC -> mot `Date` tuyet doi.
 *
 * ===========================================================================
 * VI SAO TEP NAY TON TAI RIENG:
 *
 * `business-date.ts` doi mot KHOANH KHAC DA CO thanh mot NGAY nghiep vu. Cai no khong lam — va co
 * y khong lam — la doi mot chuoi gio KHONG MANG MUI thanh mot khoanh khac. Sao ke ETC gan nhu chac
 * chan viet `31/08/2026 23:40` va khong noi mui gio nao.
 *
 * Doc chuoi do bang UTC se cho ra 06:40 sang 01/09 gio Viet Nam — SANG THANG SAU. Do dung la loi
 * ma `business-date.ts` duoc viet ra de chan, va no chi lo ra o vai dong quanh nua dem cuoi thang,
 * tuc sau khi ky da chot.
 */

const ISO_WITH_ZONE = /(?:Z|[+-]\d{2}:?\d{2})$/;

/** `31/08/2026 23:40:15` | `2026-08-31 23:40` | `31/08/2026` — gio va giay deu tuy chon. */
const NAIVE = /^(\d{1,4})[/-](\d{1,2})[/-](\d{1,4})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;

interface Wall {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

/**
 * OFFSET cua mot mui gio TAI mot khoanh khac, tinh bang phut.
 *
 * Doc lai chinh khoanh khac do qua `Intl` roi tru — khong bang mot bang offset cung, vi bang cung
 * se sai o moi lan mot quoc gia doi quy uoc. Viet Nam khong co gio mua he, nhung ham nay khong
 * duoc chi dung cho Viet Nam.
 */
function offsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const pick = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? '0');
  // `hour12: false` co the tra ve gio 24 o nua dem tren mot so moi truong ICU.
  const hour = pick('hour') % 24;
  const asUtc = Date.UTC(
    pick('year'),
    pick('month') - 1,
    pick('day'),
    hour,
    pick('minute'),
    pick('second'),
  );
  return (asUtc - instant.getTime()) / 60_000;
}

/**
 * GIO TUONG (khong mang mui) + mui gio -> khoanh khac tuyet doi.
 *
 * Lam HAI VONG co chu dich: vong dau doan offset bang cach coi gio tuong nhu la UTC, vong hai tinh
 * lai offset TAI khoanh khac vua doan. Voi mot mui gio co gio mua he, mot vong la du sai mot tieng
 * o dung nhung ngay chuyen giao — kieu sai chi lo ra hai lan mot nam.
 */
function fromWallClock(wall: Wall, timeZone: string): Date | null {
  const naiveUtc = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second,
  );
  if (Number.isNaN(naiveUtc)) return null;

  let instant = new Date(naiveUtc - offsetMinutes(new Date(naiveUtc), timeZone) * 60_000);
  instant = new Date(naiveUtc - offsetMinutes(instant, timeZone) * 60_000);
  return Number.isNaN(instant.getTime()) ? null : instant;
}

/**
 * KIEM SU TON TAI cua ngay, khong chi kiem dang.
 *
 * `31/02/2026` dung dang nhung khong phai mot ngay co that. `Date.UTC` se lang le cuon no sang
 * 03/03 — mot phep "doc thanh cong" ra sai ngay, dung kieu im lang ma ca mien nay tranh.
 */
const realDate = (wall: Wall): boolean => {
  const probe = new Date(Date.UTC(wall.year, wall.month - 1, wall.day));
  return (
    probe.getUTCFullYear() === wall.year &&
    probe.getUTCMonth() === wall.month - 1 &&
    probe.getUTCDate() === wall.day
  );
};

/**
 * DOC mot o "thoi diem qua tram".
 *
 * Hai duong, va duong nao cung TAT DINH:
 *   · chuoi CO mui gio (`...Z`, `...+07:00`) -> `Date` doc thang, mui gio tenant khong dinh gi;
 *   · chuoi KHONG mui gio -> doc theo mui gio TENANT.
 *
 * Khong co duong thu ba doan dinh dang. Tra `null` khi khong doc duoc — nguoi goi bien no thanh
 * mot ma tu choi CO TEN, chu o day khong bao gio dat mot gia tri mac dinh.
 */
export function parseTollPassedAt(value: string, timeZone: string): Date | null {
  const text = value.trim();
  if (text === '') return null;

  if (ISO_WITH_ZONE.test(text)) {
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const matched = NAIVE.exec(text);
  if (matched === null) return null;
  const [, first = '', second = '', third = '', hour = '0', minute = '0', secondPart = '0'] =
    matched;

  // `2026-08-31` (nam dung dau) hay `31/08/2026` (ngay dung dau) — phan biet bang DO DAI cua nhom
  // dau, khong bang gia tri. Mot bo doan theo gia tri se doc `03/04/2026` hai kieu o hai tep.
  const yearFirst = first.length === 4;
  const wall: Wall = {
    year: Number(yearFirst ? first : third),
    month: Number(second),
    day: Number(yearFirst ? third : first),
    hour: Number(hour),
    minute: Number(minute),
    second: Number(secondPart),
  };

  if (!realDate(wall)) return null;
  if (wall.hour > 23 || wall.minute > 59 || wall.second > 59) return null;

  return fromWallClock(wall, timeZone);
}
