import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * PROOF-030 — cac rang buoc CHI SONG TRONG SQL THO.
 *
 * Bo bai nay doc CHINH TEP MIGRATION nhu van ban. Nghe co ve vong vo, nhung no chan mot duong hong
 * rat that va da xay ra trong repo nay: `prisma migrate dev` sinh migration bang cach diff lieu do
 * voi co so du lieu, va vi Prisma khong biet gi ve `CHECK` hay ve chi muc MOT PHAN, no sinh lenh
 * XOA tat ca chung. Ai do chay lenh do roi commit thang se go sach tang bat bien nay ma khong mot
 * bai kiem hanh vi nao do — vi hanh vi o tang tren van dung, chi con co so du lieu la khong con
 * bao ve gi nua.
 *
 * Quy uoc nay co tu T2.1/T3/T4; day chi la ban cua `transport-proof`.
 */

const MIGRATION = readFileSync(
  fileURLToPath(
    new URL(
      '../../../prisma/migrations/20260907170000_transport_proof_tracking/migration.sql',
      import.meta.url,
    ),
  ),
  'utf8',
);

describe('Rang buoc tang luu tru cua transport-proof — PROOF-030', () => {
  it('MOT LAI XE MOT PHIEN MO — chi muc MOT PHAN, khong phai unique thuong', () => {
    expect(MIGRATION).toContain('CREATE UNIQUE INDEX "TransportTrackingSession_activeDriver_key"');
    // `WHERE "status" = 'ACTIVE'` la ca diem: mot unique thuong tren `driverId` se cam mot lai xe
    // co qua MOT phien trong DOI, tuc khong ai chay duoc chuyen thu hai.
    expect(MIGRATION).toMatch(
      /TransportTrackingSession_activeDriver_key[\s\S]{0,200}WHERE "status" = 'ACTIVE'/,
    );
  });

  it('chan phat lai bang unique tren (phien, ma su kien)', () => {
    expect(MIGRATION).toContain('TransportLocationObservation_session_event_key');
  });

  it('mot ma cai dat ung dung chi thuoc mot lai xe', () => {
    expect(MIGRATION).toContain('"TransportDeviceInstallation_installationId_key"');
  });

  it('phien co hinh dang trang thai/moc ket thuc nhat quan', () => {
    expect(MIGRATION).toContain('TransportTrackingSession_ended_shape');
  });

  it('toa do phai nam trong dai, va (0,0) bi chan o CA tang luu tru', () => {
    for (const constraint of [
      'TransportLocationObservation_latitude_range',
      'TransportLocationObservation_longitude_range',
      'TransportLocationObservation_not_null_island',
      'TransportGeofence_latitude_range',
      'TransportGeofence_longitude_range',
      'TransportGeofence_not_null_island',
    ]) {
      expect(MIGRATION).toContain(constraint);
    }
  });

  it('sai so am bi chan — no NONG ban kinh phan quyet ra thay vi thu hep', () => {
    expect(MIGRATION).toContain('TransportLocationObservation_accuracy_non_negative');
  });

  it('hang rao co chan tren ban kinh — mot hang rao 10 000 km luon tra "trong ham"', () => {
    expect(MIGRATION).toContain('TransportGeofence_radius_range');
    expect(MIGRATION).toMatch(/"radiusMetres" >= 10 AND "radiusMetres" <= 100000/);
  });

  it('hang rao AD_HOC khong co chu the, moi loai khac BUOC PHAI co', () => {
    expect(MIGRATION).toContain('TransportGeofence_subject_shape');
  });

  it('mot ban dinh vi chi mang MOT co cho moi ma', () => {
    expect(MIGRATION).toContain('TransportProofRiskFlag_observation_code_key');
  });

  it('ngay nghiep vu bi ep dung dang ISO o ca hai bang', () => {
    expect(MIGRATION).toContain('TransportTrackingSession_businessDate_iso');
    expect(MIGRATION).toContain('TransportLocationObservation_businessDate_iso');
  });

  /**
   * Bai nay khong phai ve `transport-proof`; no la ve KY LUAT DI TRU.
   *
   * `prisma migrate diff` sinh kem hai lenh `ALTER TABLE` tren `DealerPriceOverride` va `User` —
   * do lech co san giua lich su migration va lieu do, tren hai bang cua HAI MIEN KHAC. Mot
   * migration cua van tai ma lang le doi hai bang do la dung cai ma §8 luat 1 cua hop dong di tru
   * cam. Chung da bi go bang tay; bai nay giu cho lan sinh lai sau khong am tham dua chung ve.
   */
  it('KHONG dong vao bang cua mien khac', () => {
    const statements = MIGRATION.split('\n').filter(
      (line) => line.trimStart().startsWith('ALTER TABLE') || line.trimStart().startsWith('DROP '),
    );
    expect(statements.length).toBeGreaterThan(0);
    for (const statement of statements) {
      expect(statement).toMatch(/ALTER TABLE "Transport/);
    }
  });

  it('KHONG xoa hay doi ten mot thu gi dang co', () => {
    expect(MIGRATION).not.toMatch(/^\s*DROP TABLE/m);
    expect(MIGRATION).not.toMatch(/RENAME/);
  });
});

/**
 * PROOF-031 — CHU THE THU HAI cua mot phien, o tang SQL tho (`#327`).
 *
 * Mot `describe` rieng va mot tep migration rieng, khong noi them vao khoi tren: hai lan di tru la
 * hai su kien khac nhau trong lich su, va mot bai doc nham tep se xanh vi mot rang buoc o tep kia.
 *
 * Ly do ton tai cua ca muc nay giong het khoi dau tep: `prisma migrate dev` khong biet gi ve
 * `CHECK`, nen mot lan sinh lai lieu do se de nghi XOA rang buoc duoi day. Bai nay lam viec do
 * thanh mot lan do, chu khong phai mot lan merge im lang.
 */
const RUN_SUBJECT_MIGRATION = readFileSync(
  fileURLToPath(
    new URL(
      '../../../prisma/migrations/20260919140000_transport_tracking_session_run_subject/migration.sql',
      import.meta.url,
    ),
  ),
  'utf8',
);

describe('Chu the cua phien bam vi tri — tang luu tru — PROOF-031', () => {
  it('`tripId` da thanh TUY CHON — neu khong, phien theo vong chay phai dien mot chuyen gia', () => {
    expect(RUN_SUBJECT_MIGRATION).toMatch(
      /ALTER TABLE "TransportTrackingSession" ALTER COLUMN "tripId" DROP NOT NULL/,
    );
  });

  it('`runId` co that, va no tro toi BANG VONG CHAY — khong phai mot chuoi tu do', () => {
    expect(RUN_SUBJECT_MIGRATION).toContain(
      'ALTER TABLE "TransportTrackingSession" ADD COLUMN "runId" TEXT',
    );
    expect(RUN_SUBJECT_MIGRATION).toMatch(
      /"TransportTrackingSession_runId_fkey"[\s\S]{0,160}REFERENCES "TransportVehicleRun"\("id"\)/,
    );
  });

  it('DUNG MOT CHU THE — `num_nonnulls` = 1, khong phai mot cap `if` o tang ung dung', () => {
    expect(RUN_SUBJECT_MIGRATION).toContain('"TransportTrackingSession_one_subject"');
    expect(RUN_SUBJECT_MIGRATION).toMatch(
      /TransportTrackingSession_one_subject"[\s\S]{0,120}CHECK \(num_nonnulls\("tripId", "runId"\) = 1\)/,
    );
  });

  it('doc "cac phien cua vong chay nay" co chi muc — khong quet ca bang bang chung', () => {
    expect(RUN_SUBJECT_MIGRATION).toContain(
      'CREATE INDEX "TransportTrackingSession_runId_idx" ON "TransportTrackingSession"("runId")',
    );
  });

  /**
   * RANG BUOC CU PHAI CON NGUYEN.
   *
   * Lan di tru nay cham vao dung bang ma `TransportTrackingSession_activeDriver_key` dang bao ve.
   * Neu no lo sinh kem mot lenh xoa chi muc do — dung cai ma `prisma migrate diff` hay lam — thi
   * mot lai xe se mo duoc hai phien cung luc, va khong mot bai kiem hanh vi nao o tang tren do.
   */
  it('khong lan di tru nao o day go mat rang buoc da co', () => {
    expect(RUN_SUBJECT_MIGRATION).not.toMatch(/DROP\s+INDEX/i);
    expect(RUN_SUBJECT_MIGRATION).not.toMatch(/DROP\s+CONSTRAINT/i);
  });
});
