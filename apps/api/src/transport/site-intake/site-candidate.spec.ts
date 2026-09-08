import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SITE_CANDIDATE_POLICY,
  resolveSiteCandidates,
  type SiteFence,
} from './site-candidate.js';

/**
 * NHAN DANG DIA DIEM A tu mot ban dinh vi — `#267` H2.
 *
 * Ham nay la NOI DUY NHAT quyet dinh "ban dang o dau", va no la mot ham THUAN: khong doc DB, khong
 * doc dong ho he thong, khong goi mang. Moi so no can deu di qua tham so — ke ca `now`.
 *
 * BAT BIEN TRUNG TAM cua ca lane: ham nay KHONG BAO GIO tao ra mot su that nghiep vu. No de nghi.
 * Cai bien mot de nghi thanh mot vong chay la mot cai CHAM cua con nguoi, o mot lop khac han.
 */

const HANOI = { latitude: 21.0278, longitude: 105.8342 };

/** Dich chuyen mot diem ve phia bac `metres` met. 1 do vi do ~ 111 320 m. */
const northOf = (metres: number) => ({
  latitude: HANOI.latitude + metres / 111_320,
  longitude: HANOI.longitude,
});

const fence = (
  overrides: Partial<SiteFence> & Pick<SiteFence, 'fenceId' | 'siteId'>,
): SiteFence => ({
  centre: HANOI,
  radiusMetres: 200,
  ...overrides,
});

const at = (
  point: { readonly latitude: number; readonly longitude: number },
  accuracyMetres: number | null = 10,
) => ({
  point,
  accuracyMetres,
  observedAt: new Date('2026-09-09T03:00:00.000Z'),
  now: new Date('2026-09-09T03:00:30.000Z'),
  policy: DEFAULT_SITE_CANDIDATE_POLICY,
});

describe('H2 — mot dia diem duy nhat', () => {
  it('diem nam chac chan trong dung mot hang rao cua mot dia diem -> UNIQUE', () => {
    const outcome = resolveSiteCandidates({
      ...at(HANOI),
      fences: [fence({ fenceId: 'f1', siteId: 'site-hp' })],
    });

    expect(outcome.kind).toBe('UNIQUE');
    if (outcome.kind !== 'UNIQUE') return;
    expect(outcome.candidate.siteId).toBe('site-hp');
    expect(outcome.candidate.fenceId).toBe('f1');
    expect(outcome.candidate.confidence).toBe('INSIDE');
    expect(outcome.candidate.distanceMetres).toBeLessThan(1);
  });

  /**
   * HAI HANG RAO CUA CUNG MOT DIA DIEM khong phai mot su nhap nhang: cong va bai can la hai hang
   * rao, nhung nguoi lai xe van dang o DUNG MOT cho. Gop theo `siteId` la dieu bien no thanh mot
   * cau tra loi thay vi mot cau hoi thua.
   */
  it('hai hang rao CUNG MOT dia diem van la UNIQUE, va giu hang rao gan nhat', () => {
    const outcome = resolveSiteCandidates({
      ...at(northOf(50)),
      fences: [
        fence({ fenceId: 'bai', siteId: 'site-hp', radiusMetres: 400 }),
        fence({ fenceId: 'cong', siteId: 'site-hp', centre: northOf(60), radiusMetres: 200 }),
      ],
    });

    expect(outcome.kind).toBe('UNIQUE');
    if (outcome.kind !== 'UNIQUE') return;
    expect(outcome.candidate.siteId).toBe('site-hp');
    expect(outcome.candidate.fenceId).toBe('cong');
  });

  it('khong hang rao nao chua diem -> NO_MATCH', () => {
    const outcome = resolveSiteCandidates({
      ...at(northOf(5_000)),
      fences: [fence({ fenceId: 'f1', siteId: 'site-hp' })],
    });
    expect(outcome.kind).toBe('NO_MATCH');
  });

  it('chua khai hang rao nao -> NO_MATCH, khong phai loi', () => {
    const outcome = resolveSiteCandidates({ ...at(HANOI), fences: [] });
    expect(outcome.kind).toBe('NO_MATCH');
  });
});

describe('H2 — nhieu dia diem hop ly thi KHONG duoc tu chon', () => {
  it('diem nam trong hang rao cua HAI dia diem -> AMBIGUOUS, khong UNIQUE', () => {
    const outcome = resolveSiteCandidates({
      ...at(HANOI),
      fences: [
        fence({ fenceId: 'f1', siteId: 'site-a' }),
        fence({ fenceId: 'f2', siteId: 'site-b', radiusMetres: 300 }),
      ],
    });

    expect(outcome.kind).toBe('AMBIGUOUS');
    if (outcome.kind !== 'AMBIGUOUS') return;
    expect(outcome.candidates.map((c) => c.siteId).sort()).toEqual(['site-a', 'site-b']);
  });

  /**
   * `INDETERMINATE` cua `assessGeofences` nghia la BIEN DO SAI SO cua thiet bi phu len duong bien:
   * co the trong, co the ngoai. Mot cau tra loi UNIQUE o day se bien mot dieu KHONG BIET thanh mot
   * dieu ma nguoi dung doc la da biet — roi mot cham xac nhan se dong dau len no.
   *
   * Nen: mot dia diem `NEAR` DUY NHAT van la AMBIGUOUS. Man hinh se hoi "co phai cho nay khong",
   * chu khong noi "ban dang o cho nay".
   */
  it('mot dia diem duy nhat nhung sai so phu len bien -> AMBIGUOUS, khong bao gio UNIQUE', () => {
    const outcome = resolveSiteCandidates({
      ...at(northOf(200), 30),
      fences: [fence({ fenceId: 'f1', siteId: 'site-hp', radiusMetres: 200 })],
    });

    expect(outcome.kind).toBe('AMBIGUOUS');
    if (outcome.kind !== 'AMBIGUOUS') return;
    expect(outcome.candidates).toHaveLength(1);
    expect(outcome.candidates[0]?.confidence).toBe('NEAR');
  });

  /**
   * Mot dia diem CHAC CHAN trong + mot dia diem CO THE trong. Suc cam do khac nhau, nhung ca hai
   * deu "hop ly", va `#267` H2 viet ro: *"if multiple plausible A sites exist, do NOT choose one
   * silently"*. Nen day van la AMBIGUOUS — chi khac la cai chac chan dung dau danh sach.
   */
  it('mot dia diem INSIDE + mot dia diem NEAR van la AMBIGUOUS', () => {
    const outcome = resolveSiteCandidates({
      ...at(HANOI, 30),
      fences: [
        fence({ fenceId: 'f1', siteId: 'site-trong', radiusMetres: 200 }),
        fence({ fenceId: 'f2', siteId: 'site-ria', centre: northOf(220), radiusMetres: 200 }),
      ],
    });

    expect(outcome.kind).toBe('AMBIGUOUS');
    if (outcome.kind !== 'AMBIGUOUS') return;
    expect(outcome.candidates[0]?.siteId).toBe('site-trong');
    expect(outcome.candidates[0]?.confidence).toBe('INSIDE');
    expect(outcome.candidates[1]?.confidence).toBe('NEAR');
  });

  /**
   * THU TU PHAI LAP LAI DUOC. Hai lan goi voi cung du lieu ma ra hai thu tu khac nhau se lam man
   * hinh nhay, va lam mot bang chung khong doi chieu lai duoc. Cung thu tu quyet dinh voi
   * `isCloser()` cua Lane B: khoang cach, roi ban kinh nho hon, roi id.
   */
  it('thu tu la TAT DINH: khoang cach, roi ban kinh nho hon, roi siteId', () => {
    const fences = [
      fence({ fenceId: 'z', siteId: 'site-z', radiusMetres: 400 }),
      fence({ fenceId: 'a', siteId: 'site-a', radiusMetres: 200 }),
      fence({ fenceId: 'm', siteId: 'site-m', radiusMetres: 200 }),
    ];
    const first = resolveSiteCandidates({ ...at(HANOI), fences });
    const second = resolveSiteCandidates({ ...at(HANOI), fences: [...fences].reverse() });

    expect(first.kind).toBe('AMBIGUOUS');
    if (first.kind !== 'AMBIGUOUS' || second.kind !== 'AMBIGUOUS') return;
    expect(first.candidates.map((c) => c.siteId)).toEqual(['site-a', 'site-m', 'site-z']);
    expect(second.candidates.map((c) => c.siteId)).toEqual(first.candidates.map((c) => c.siteId));
  });

  it('danh sach ung vien co CHAN TREN, va viec bi cat duoc noi ra', () => {
    const fences = Array.from({ length: 12 }, (_, index) =>
      fence({ fenceId: `f${index}`, siteId: `site-${String(index).padStart(2, '0')}` }),
    );
    const outcome = resolveSiteCandidates({ ...at(HANOI), fences });

    expect(outcome.kind).toBe('AMBIGUOUS');
    if (outcome.kind !== 'AMBIGUOUS') return;
    expect(outcome.candidates).toHaveLength(DEFAULT_SITE_CANDIDATE_POLICY.maxCandidates);
    expect(outcome.truncated).toBe(true);
  });
});

/**
 * VI TRI KHONG DUNG DUOC la mot cau tra loi RIENG, khong phai `NO_MATCH`.
 *
 * Gop hai thu lam mot se noi voi lai xe "khong nhan ra dia diem nao" trong khi su that la "may
 * chua bat dinh vi xong". Ho se di tim mot cai nut khac, va cai nut do khong ton tai.
 */
describe('H2 — vi tri khong dung duoc', () => {
  it('toa do vo nghia -> LOCATION_UNUSABLE(COORDINATE_INVALID)', () => {
    const outcome = resolveSiteCandidates({
      ...at({ latitude: 91, longitude: 105.8342 }),
      fences: [fence({ fenceId: 'f1', siteId: 'site-hp' })],
    });

    expect(outcome.kind).toBe('LOCATION_UNUSABLE');
    if (outcome.kind !== 'LOCATION_UNUSABLE') return;
    expect(outcome.reason).toBe('COORDINATE_INVALID');
  });

  it('dao null (0,0) -> LOCATION_UNUSABLE(COORDINATE_INVALID)', () => {
    const outcome = resolveSiteCandidates({
      ...at({ latitude: 0, longitude: 0 }),
      fences: [fence({ fenceId: 'f1', siteId: 'site-hp' })],
    });
    expect(outcome.kind).toBe('LOCATION_UNUSABLE');
  });

  /**
   * Mot ban dinh vi sai so 3 km "chua" ca mot quan noi thanh. No se bao INSIDE cho moi kho trong
   * ban kinh do — tuc bien tang nay thanh mot ham luon dong y.
   */
  it('sai so lon hon tran chinh sach -> LOCATION_UNUSABLE(ACCURACY_UNUSABLE)', () => {
    const outcome = resolveSiteCandidates({
      ...at(HANOI, DEFAULT_SITE_CANDIDATE_POLICY.maxAccuracyMetres + 1),
      fences: [fence({ fenceId: 'f1', siteId: 'site-hp' })],
    });

    expect(outcome.kind).toBe('LOCATION_UNUSABLE');
    if (outcome.kind !== 'LOCATION_UNUSABLE') return;
    expect(outcome.reason).toBe('ACCURACY_UNUSABLE');
  });

  /**
   * `#267` H7: *"A stale location outside bounded freshness cannot silently create/attach a
   * pickup."* Mot ban dinh vi tu bon tieng truoc noi ve noi lai xe DA TUNG o, khong phai noi ho
   * dang o. Hang doi ngoai tuyen cua Lane B lam viec do rat binh thuong.
   */
  it('ban dinh vi qua han tuoi -> LOCATION_UNUSABLE(LOCATION_STALE)', () => {
    const observedAt = new Date('2026-09-09T03:00:00.000Z');
    const stale = new Date(
      observedAt.getTime() + (DEFAULT_SITE_CANDIDATE_POLICY.maxAgeSeconds + 1) * 1000,
    );
    const outcome = resolveSiteCandidates({
      ...at(HANOI),
      observedAt,
      now: stale,
      fences: [fence({ fenceId: 'f1', siteId: 'site-hp' })],
    });

    expect(outcome.kind).toBe('LOCATION_UNUSABLE');
    if (outcome.kind !== 'LOCATION_UNUSABLE') return;
    expect(outcome.reason).toBe('LOCATION_STALE');
  });

  /**
   * Mot ban dinh vi mang dau thoi gian o TUONG LAI la mot dong ho may khach sai — no khong duoc
   * lot qua bang cach "tuoi am thi con moi hon ca moi".
   */
  it('dau thoi gian o tuong lai cung la LOCATION_STALE', () => {
    const now = new Date('2026-09-09T03:00:00.000Z');
    const outcome = resolveSiteCandidates({
      ...at(HANOI),
      observedAt: new Date(now.getTime() + 10 * 60_000),
      now,
      fences: [fence({ fenceId: 'f1', siteId: 'site-hp' })],
    });

    expect(outcome.kind).toBe('LOCATION_UNUSABLE');
    if (outcome.kind !== 'LOCATION_UNUSABLE') return;
    expect(outcome.reason).toBe('LOCATION_STALE');
  });

  /**
   * Thiet bi KHONG bao sai so la mot dieu KHAC voi "sai so bang 0". Lane B da chot cach xu ly:
   * so sanh nhu mot diem, vi tu bia ra mot bien do cung la tu bia ra du lieu. Giu nguyen quy uoc
   * do o day thay vi dung mot quy uoc thu hai.
   */
  it('thiet bi khong bao sai so thi so sanh nhu mot diem', () => {
    const outcome = resolveSiteCandidates({
      ...at(HANOI, null),
      fences: [fence({ fenceId: 'f1', siteId: 'site-hp' })],
    });
    expect(outcome.kind).toBe('UNIQUE');
  });
});
