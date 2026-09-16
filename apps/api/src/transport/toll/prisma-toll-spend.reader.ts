import { Injectable } from '@nestjs/common';
import type { PrismaService } from '../../config/prisma.service.js';
import { fromStoredAmount } from '../money.js';
import type { TollSpendBucket, TollSpendWindow } from './toll-spend-report.js';
import { TollSpendReader, type TollDuplicatePeerQuery } from './toll-spend.reader.js';

/**
 * CUA DOC CHO BAO CAO ETC tren POSTGRES — `#314` G8/G9. CHI DOC.
 *
 * ============================================================================================
 * GOM O POSTGRES, TRONG MOT CAU LENH
 * ============================================================================================
 *
 * Mot ky co the co hang chuc nghin luot qua tram. Keo tung dong ve Node roi cong se lam mot lan mo
 * bao cao doc ca bang — cung khuon voi `PrismaAllowanceRepository.approvedTotalsBetween`.
 *
 * Va MOT cau lenh la mot anh chup nhat quan. Hai truy van roi (mot cho dong thuong, mot cho dong
 * da noi trung) se cho mot lan quyet dinh chen vao giua dem mot dong o CA HAI noi hoac o KHONG noi
 * nao — dung kieu sai ma mot bao cao tien khong duoc co. Nen `duplicateOfCandidateId` nam trong
 * `by`: dong da noi trung hiem, nen so nhom tang khong dang ke, va doi lai khong can giao dich.
 *
 * ============================================================================================
 * BA DIEU KIEN `not: null` KHONG LOC MAT DONG HOP LE NAO
 * ============================================================================================
 *
 * Mot dong `ACCEPTED` luon co `kind`, `signedAmount` va `businessDate` (`toll-statement-mapping.ts`
 * tu choi dong thieu mot trong ba), va co `businessDate` thi co `matchState`
 * (`toll-classification.ts`). Ba dieu kien o day chi lam kieu cua ket qua trung voi su that do.
 */
@Injectable()
export class PrismaTollSpendReader extends TollSpendReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async spendBuckets(window: TollSpendWindow): Promise<readonly TollSpendBucket[]> {
    const groups = await this.prisma.transportTollTransactionCandidate.groupBy({
      by: [
        'vehicleId',
        'businessDate',
        'kind',
        'matchState',
        'reviewState',
        'currencyCode',
        'duplicateOfCandidateId',
      ],
      where: {
        parseStatus: 'ACCEPTED',
        businessDate: { gte: window.from, lte: window.to },
        kind: { not: null },
        matchState: { not: null },
        signedAmount: { not: null },
        ...(window.provider === null ? {} : { provider: window.provider }),
      },
      _sum: { signedAmount: true },
      _count: { _all: true },
    });

    return groups.flatMap((group): TollSpendBucket[] => {
      if (group.businessDate === null || group.kind === null || group.matchState === null) {
        return [];
      }
      return [
        {
          vehicleId: group.vehicleId,
          businessDate: group.businessDate,
          kind: group.kind,
          matchState: group.matchState,
          reviewState: group.reviewState,
          currencyCode: group.currencyCode,
          duplicateDeclared: group.duplicateOfCandidateId !== null,
          rowCount: group._count._all,
          amount: fromStoredAmount(group._sum.signedAmount ?? 0n) ?? 0,
        },
      ];
    });
  }

  async duplicatePeerIds(query: TollDuplicatePeerQuery): Promise<readonly string[]> {
    const rows = await this.prisma.transportTollTransactionCandidate.findMany({
      where: {
        provider: query.provider,
        fingerprint: query.fingerprint,
        parseStatus: 'ACCEPTED',
        id: { not: query.candidateId },
      },
      select: { id: true },
      // Cung thu tu voi `RepositoryTollSpendReader`: cu nhat truoc, roi lan nap, roi so dong.
      orderBy: [{ createdAt: 'asc' }, { importId: 'asc' }, { rowNumber: 'asc' }],
      take: query.limit,
    });
    return rows.map((row) => row.id);
  }
}
