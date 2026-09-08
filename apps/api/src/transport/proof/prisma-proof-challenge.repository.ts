import { Injectable } from '@nestjs/common';
import type { PrismaService } from '../../config/prisma.service.js';
import {
  ProofChallengeRepository,
  type IssueChallengeInput,
} from './operational-proof.repository.js';
import type { ProofChallenge } from './operational-proof.types.js';

interface ChallengeRow {
  readonly id: string;
  readonly nonce: string;
  readonly driverId: string;
  readonly sessionId: string;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  readonly consumedAt: Date | null;
  readonly consumedByProofId: string | null;
}

function toChallenge(row: ChallengeRow): ProofChallenge {
  return {
    id: row.id,
    nonce: row.nonce,
    driverId: row.driverId,
    sessionId: row.sessionId,
    issuedAt: row.issuedAt,
    expiresAt: row.expiresAt,
    consumedAt: row.consumedAt,
    consumedByProofId: row.consumedByProofId,
  };
}

@Injectable()
export class PrismaProofChallengeRepository extends ProofChallengeRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async issue(input: IssueChallengeInput): Promise<ProofChallenge> {
    const row = await this.prisma.transportProofChallenge.create({
      data: {
        nonce: input.nonce,
        driverId: input.driverId,
        sessionId: input.sessionId,
        issuedAt: input.issuedAt,
        expiresAt: input.expiresAt,
      },
    });
    return toChallenge(row);
  }

  async findByNonce(nonce: string): Promise<ProofChallenge | null> {
    const row = await this.prisma.transportProofChallenge.findUnique({ where: { nonce } });
    return row ? toChallenge(row) : null;
  }

  /**
   * TIEU MOT LAN — cong chong chay dua nam o `where`, khong o mot lenh `if`.
   *
   * Doc roi kiem roi ghi (`findByNonce` -> `if consumedAt === null` -> `update`) se THUA duoi hai
   * yeu cau gui cung luc: ca hai doc thay `null`, ca hai di tiep, va mot loi thach thuc phuc vu
   * hai chung cu. `updateMany` voi dieu kien `consumedAt: null` bien phep kiem va phep ghi thanh
   * MOT lenh, nen ban thu hai sua 0 hang va nhan `null`.
   */
  async consume(nonce: string, consumedAt: Date, proofId: string): Promise<ProofChallenge | null> {
    const claimed = await this.prisma.transportProofChallenge.updateMany({
      where: { nonce, consumedAt: null },
      data: { consumedAt, consumedByProofId: proofId },
    });
    if (claimed.count !== 1) return null;
    const row = await this.prisma.transportProofChallenge.findUnique({ where: { nonce } });
    return row ? toChallenge(row) : null;
  }
}
