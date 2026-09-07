import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * PROOF-111 — rang buoc cua bang loi thach thuc, doc CHINH TEP MIGRATION.
 *
 * Cung ly le voi hai bo storage truoc: `prisma migrate dev` khong biet gi ve `CHECK` nen no sinh
 * lenh XOA chung, va mot bo bai kiem HANH VI se van xanh sau do — vi hanh vi o tang tren khong doi,
 * chi con co so du lieu la khong con bao ve gi nua.
 */

const MIGRATION = readFileSync(
  fileURLToPath(
    new URL(
      '../../../prisma/migrations/20260909120000_transport_proof_challenge/migration.sql',
      import.meta.url,
    ),
  ),
  'utf8',
);

/**
 * CHI PHAN SQL, bo moi dong chu thich.
 *
 * Bai "khong dong vao bang cua mien khac" duoi day phai doc LENH, khong doc van ban. Chinh khoi
 * chu thich dau tep nay NHAC den ba bang do de giai thich vi sao chung bi go bo — va mot bai test
 * doc ca chu thich se do vi dung cai cau giai thich rang no da duoc sua.
 */
const STATEMENTS = MIGRATION.split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');

describe('Rang buoc luu tru cua loi thach thuc — PROOF-111', () => {
  /**
   * BAI QUAN TRONG NHAT CUA TEP.
   *
   * "Dung mot lan" phai duoc cuong che bang mot CHI MUC, khong bang mot lenh `if` trong dich vu.
   * Doc-roi-kiem-roi-ghi se THUA duoi hai yeu cau gui cung luc: ca hai doc thay `NULL`, ca hai di
   * tiep, va mot loi thach thuc phuc vu hai chung cu.
   */
  it('mot `nonce` la DUY NHAT trong ca bang', () => {
    expect(MIGRATION).toContain('TransportProofChallenge_nonce_key');
    expect(MIGRATION).toContain('CREATE UNIQUE INDEX');
  });

  it('da dung phai co CA `consumedAt` LAN `consumedByProofId`', () => {
    expect(MIGRATION).toContain('TransportProofChallenge_consumption_shape');
  });

  /** Phan "bounded" cua #235 dat xuong tang luu tru: mot han truoc luc phat la mot hang vo nghia. */
  it('han phai o SAU luc phat', () => {
    expect(MIGRATION).toContain('TransportProofChallenge_ttl_positive');
    expect(MIGRATION).toContain('"expiresAt" > "issuedAt"');
  });

  it('`nonce` rong bi chan — no lam ca co che vo hieu', () => {
    expect(MIGRATION).toContain('TransportProofChallenge_nonce_not_blank');
  });

  it('chung cu mang co DA KIEM, va mac dinh la CHUA', () => {
    expect(MIGRATION).toContain('"challengeVerified" BOOLEAN NOT NULL DEFAULT false');
  });

  /**
   * KHONG DONG VAO BANG CUA MIEN KHAC.
   *
   * `prisma migrate diff` sinh ban nay kem ba lenh cua mien khac — hai `ALTER COLUMN "updatedAt"
   * DROP DEFAULT` tren `DealerPriceOverride` va `User`, va mot `RENAME INDEX` cua
   * `TransportFuelCandidate`. Ca ba la DO LECH CO SAN, khong phai he qua cua thay doi nay. Bai nay
   * la thu duy nhat ngan chung quay lai o lan sinh migration sau.
   */
  it('KHONG dong vao bang cua mien khac', () => {
    expect(STATEMENTS).not.toContain('"DealerPriceOverride"');
    expect(STATEMENTS).not.toContain('ALTER TABLE "User"');
    expect(STATEMENTS).not.toContain('TransportFuelCandidate');
  });
});
