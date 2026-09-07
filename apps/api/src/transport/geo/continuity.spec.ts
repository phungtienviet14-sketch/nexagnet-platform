import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTINUITY_POLICY, assessContinuity } from './continuity.js';

/**
 * GEO-020 — lien tuc chuyen dong, va cai bay lam hong moi he thong chong gian lan GPS ngay tay.
 *
 * Phep kiem "di chuyen bat kha thi" ai cung viet duoc: lay quang duong chia thoi gian, so voi mot
 * nguong. Va no SAI ngay ngay dau chay that, vi mot ly do rat vat ly: khi xe DUNG YEN, hai ban
 * dinh vi lien tiep van lech nhau vai chuc met do nhieu tin hieu. Chia mot khoang lech 60 m cho
 * 0,5 giay ra 120 m/s — tuc he thong se to mot chiec xe dang do trong bai la "dich chuyen tuc
 * thoi", moi vai phut mot lan, ca ngay.
 *
 * Chua co canh bao gia thi con sua duoc. Co roi thi nguoi truc se tat het canh bao — va luc do
 * ca tang chong gian lan bang khong.
 *
 * Cach chua: TRU sai so cua CA HAI ban dinh vi ra khoi quang duong truoc khi chia. Cai con lai la
 * phan dich chuyen ma hinh hoc KHONG giai thich duoc bang nhieu tin hieu.
 */
describe('Lien tuc chuyen dong — GEO-020', () => {
  const hanoi = { latitude: 21.0285, longitude: 105.8542 };
  const haiphong = { latitude: 20.8449, longitude: 106.6881 };

  it('quan sat dau tien khong co gi de so — noi ro chu khong im lang', () => {
    const result = assessContinuity(null, { point: hanoi, accuracyMetres: 8, atSeconds: 100 });
    expect(result.codes).toEqual(['FIRST_OBSERVATION']);
    expect(result.speedMetresPerSecond).toBeNull();
  });

  it('xe DUNG YEN voi tin hieu nhieu KHONG bi to la dich chuyen tuc thoi', () => {
    // 60 m lech trong 0,5 giay = 120 m/s neu tinh tho. Sai so 40 m moi ban giai thich het cho do.
    const drifted = { latitude: hanoi.latitude + 0.00054, longitude: hanoi.longitude };
    const result = assessContinuity(
      { point: hanoi, accuracyMetres: 40, atSeconds: 0 },
      { point: drifted, accuracyMetres: 40, atSeconds: 0.5 },
    );
    expect(result.rawDistanceMetres).toBeGreaterThan(50);
    expect(result.effectiveDistanceMetres).toBe(0);
    expect(result.codes).toEqual(['CONTINUOUS']);
  });

  it('dich chuyen THAT thi van bi bat, sai so khong cuu duoc', () => {
    const result = assessContinuity(
      { point: hanoi, accuracyMetres: 100, atSeconds: 0 },
      { point: haiphong, accuracyMetres: 100, atSeconds: 60 },
    );
    expect(result.codes).toContain('IMPLAUSIBLE_SPEED');
    expect(result.speedMetresPerSecond).toBeGreaterThan(1_000);
  });

  it('chay dung toc do duong truong o nhip lay mau 30 giay thi binh thuong', () => {
    // ~750 m trong 30 giay = 25 m/s = 90 km/h. Day moi la hinh dang THAT cua mot chuoi bam vi
    // tri dang hoat dong; hai diem cach nhau hai tieng la mot chuoi DUT, khong phai mot chuyen xe.
    const ahead = { latitude: hanoi.latitude + 0.006737, longitude: hanoi.longitude };
    const result = assessContinuity(
      { point: hanoi, accuracyMetres: 8, atSeconds: 0 },
      { point: ahead, accuracyMetres: 8, atSeconds: 30 },
    );
    expect(result.codes).toEqual(['CONTINUOUS']);
    expect(result.speedMetresPerSecond).toBeGreaterThan(20);
    expect(result.speedMetresPerSecond).toBeLessThan(30);
  });

  it('dau thoi gian khong tien len la mot chuyen KHAC voi khoang trong', () => {
    const result = assessContinuity(
      { point: hanoi, accuracyMetres: 8, atSeconds: 500 },
      { point: haiphong, accuracyMetres: 8, atSeconds: 500 },
    );
    expect(result.codes).toContain('TIMESTAMP_NOT_ADVANCING');
    expect(result.speedMetresPerSecond).toBeNull();
  });

  it('dau thoi gian LUI LAI cung roi vao cung mot ma', () => {
    const result = assessContinuity(
      { point: hanoi, accuracyMetres: 8, atSeconds: 500 },
      { point: haiphong, accuracyMetres: 8, atSeconds: 100 },
    );
    expect(result.codes).toContain('TIMESTAMP_NOT_ADVANCING');
  });

  it('khoang trong dai duoc ghi nhan RIENG — no la dieu can nguoi nhin, khong phai loi', () => {
    const result = assessContinuity(
      { point: hanoi, accuracyMetres: 8, atSeconds: 0 },
      { point: haiphong, accuracyMetres: 8, atSeconds: 20_000 },
    );
    expect(result.codes).toContain('LARGE_TIME_GAP');
    expect(result.codes).not.toContain('IMPLAUSIBLE_SPEED');
  });

  it('mot khoang trong dai VA mot buoc nhay deu duoc ghi — khong nuot ma nao', () => {
    const policy = { ...DEFAULT_CONTINUITY_POLICY, maxGapSeconds: 30 };
    const result = assessContinuity(
      { point: hanoi, accuracyMetres: 8, atSeconds: 0 },
      { point: haiphong, accuracyMetres: 8, atSeconds: 60 },
      policy,
    );
    expect([...result.codes].sort()).toEqual(['IMPLAUSIBLE_SPEED', 'LARGE_TIME_GAP']);
  });

  it('sai so KHONG BIET thi khong duoc tu cho minh mot bien do', () => {
    const drifted = { latitude: hanoi.latitude + 0.00054, longitude: hanoi.longitude };
    const result = assessContinuity(
      { point: hanoi, accuracyMetres: null, atSeconds: 0 },
      { point: drifted, accuracyMetres: null, atSeconds: 0.5 },
    );
    expect(result.effectiveDistanceMetres).toBe(result.rawDistanceMetres);
    expect(result.codes).toContain('IMPLAUSIBLE_SPEED');
  });

  it('nguong mac dinh 55 m/s ~ 198 km/h — nhanh hon moi xe dau keo, cham hon moi may bay', () => {
    expect(DEFAULT_CONTINUITY_POLICY.maxPlausibleSpeedMetresPerSecond).toBe(55);
  });
});
