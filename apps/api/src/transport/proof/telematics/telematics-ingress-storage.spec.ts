import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * PROOF-031 — cac rang buoc cua cua nhap telematics CHI SONG TRONG SQL THO.
 *
 * Cung ly le voi `transport-proof-storage.spec.ts`, mang nguyen sang day: `prisma migrate dev` sinh
 * migration bang cach diff lieu do voi co so du lieu, va vi Prisma khong biet gi ve `CHECK`, no sinh
 * lenh XOA tat ca chung. Ai do chay lenh do roi commit thang se go sach tang bat bien nay ma khong
 * mot bai kiem hanh vi nao do — vi hanh vi o tang tren van dung, chi con co so du lieu la khong con
 * bao ve gi nua.
 *
 * O day no dac biet dang gia: hai `CHECK` duoi day la thu DUY NHAT ngan mot ban ghi cua dien thoai
 * mang nhan `TELEMATICS`. Moi lop con lai — zod, ma quyen, dich vu — deu la ma nguon, va ma nguon
 * thi sua duoc trong mot PR ve viec khac.
 */

const migrationFile = (name: string): string =>
  readFileSync(
    fileURLToPath(
      new URL(
        `../../../../prisma/migrations/20260918100000_transport_telematics_ingress/${name}`,
        import.meta.url,
      ),
    ),
    'utf8',
  );

const MIGRATION = migrationFile('migration.sql');
const ROLLBACK = migrationFile('README-rollback.sql');

describe('Rang buoc tang luu tru cua cua nhap telematics — PROOF-031', () => {
  it('MOT ban dinh vi co DUNG MOT chu the', () => {
    expect(MIGRATION).toContain('"TransportLocationObservation_one_subject"');
    // `num_nonnulls(...) = 1` chu khong `>= 1`: hai chu the cung khac NULL thi chung co the MAU
    // THUAN nhau (phien cua xe A, cot `vehicleId` xe B) va khong ai biet duong doc nao noi that.
    expect(MIGRATION).toMatch(
      /TransportLocationObservation_one_subject[\s\S]{0,200}num_nonnulls\("sessionId", "vehicleId"\) = 1/,
    );
  });

  it('`TELEMATICS` khi va CHI KHI hang gan thang vao mot chiec xe', () => {
    expect(MIGRATION).toContain('"TransportLocationObservation_telematics_subject"');
    // Mot dau `=` giua hai menh de, tuc TUONG DUONG chu khong keo theo. Viet thanh mot chieu
    // (`source = 'TELEMATICS' => vehicleId IS NOT NULL`) van chan duoc dien thoai tu khai la phan
    // cung, nhung se cho mot cot `vehicleId` lang le mang duoc moi nguon khac — tuc mo mot duong
    // ghi vi tri thu hai ma khong ai quyet dinh mo.
    expect(MIGRATION).toMatch(
      /TransportLocationObservation_telematics_subject[\s\S]{0,200}\("source" = 'TELEMATICS'\) = \("vehicleId" IS NOT NULL\)/,
    );
  });

  it('chan phat lai o CAP `(providerId, externalEventId)`, khong o rieng ma su kien', () => {
    expect(MIGRATION).toContain('"TransportTelematicsIngressEvent_provider_event_key"');
    expect(MIGRATION).toMatch(
      /TransportTelematicsIngressEvent_provider_event_key" ON "TransportTelematicsIngressEvent"\("providerId", "externalEventId"\)/,
    );
  });

  it('MOT lan nhap, DUNG MOT ban dinh vi', () => {
    expect(MIGRATION).toContain('"TransportTelematicsIngressEvent_observationId_key"');
  });

  it('bang bang chung khong xoa duoc qua ba khoa ngoai moi', () => {
    // `Restrict` chu khong `Cascade` o moi chieu: mot lan xoa xe dat nham khong duoc mang theo ca
    // chuoi vi tri, va mot lan xoa ban dinh vi khong duoc lam mat danh tinh cua lan nhap.
    const foreignKeys = MIGRATION.match(/ADD CONSTRAINT "\w+_fkey"[\s\S]{0,300}?;/g) ?? [];
    expect(foreignKeys).toHaveLength(3);
    for (const statement of foreignKeys) {
      expect(statement).toContain('ON DELETE RESTRICT');
    }
  });

  it('lan di nay KHONG xoa hang nao va KHONG bo rang buoc nao dang co', () => {
    // Mot migration "them mot cua nhap" ma co `DROP CONSTRAINT`/`DELETE` la mot migration dang lam
    // mot viec khac han voi ten cua no.
    expect(MIGRATION).not.toMatch(/\bDROP\s+(TABLE|CONSTRAINT|INDEX)\b/i);
    expect(MIGRATION).not.toMatch(/\b(DELETE\s+FROM|TRUNCATE)\b/i);
  });

  it('duong lui KHONG lang le xoa bang chung vi tri', () => {
    // Lui la mat bang chung: dat lai `NOT NULL` cho `sessionId` doi moi hang tu phan cung phai BIEN
    // MAT. Khoi `DELETE` phai o lai duoi dang chu thich, kem mot buoc ket xuat.
    expect(ROLLBACK).toMatch(/^--\s*DELETE FROM "TransportLocationObservation"/m);
    expect(ROLLBACK).not.toMatch(/^\s*DELETE FROM/m);
    expect(ROLLBACK).toContain('\\copy');
  });
});
