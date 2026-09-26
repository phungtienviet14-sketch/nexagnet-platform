import { Injectable } from '@nestjs/common';
import type { PrismaService } from '../../config/prisma.service.js';
import type { BusinessDate } from '../business-date.js';
import {
  RunSiteIntakeRepository,
  type CreateRunSiteIntakeInput,
} from './site-intake.repository.js';
import type { SiteMatch } from './site-intake-commercial.types.js';
import type { RunSiteIntake, SiteIntakeLocationTrust } from './site-intake.types.js';

export interface IntakeRow {
  id: string;
  runId: string;
  legId: string;
  siteId: string;
  driverId: string;
  confirmedBy: string;
  locationTrust: string;
  observationId: string | null;
  distanceMetres: number | null;
  clientEventId: string;
  confirmedAt: Date;
  businessDate: string;
  siteMatch: string | null;
}

export const toIntake = (row: IntakeRow): RunSiteIntake => ({
  id: row.id,
  runId: row.runId,
  legId: row.legId,
  siteId: row.siteId,
  driverId: row.driverId,
  confirmedBy: row.confirmedBy,
  locationTrust: row.locationTrust as SiteIntakeLocationTrust,
  observationId: row.observationId,
  distanceMetres: row.distanceMetres,
  clientEventId: row.clientEventId,
  confirmedAt: row.confirmedAt,
  businessDate: row.businessDate as BusinessDate,
  siteMatch: row.siteMatch as SiteMatch | null,
});

@Injectable()
export class PrismaRunSiteIntakeRepository extends RunSiteIntakeRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create(input: CreateRunSiteIntakeInput): Promise<RunSiteIntake> {
    const row = await this.prisma.transportRunSiteIntake.create({
      data: {
        runId: input.runId,
        legId: input.legId,
        siteId: input.siteId,
        driverId: input.driverId,
        confirmedBy: input.confirmedBy,
        locationTrust: input.locationTrust,
        observationId: input.observationId,
        distanceMetres: input.distanceMetres,
        clientEventId: input.clientEventId,
        confirmedAt: input.confirmedAt,
        businessDate: input.businessDate,
        siteMatch: input.siteMatch,
        // `#398`: phan thuong mai ra doi CUNG lenh — Prisma boc lenh tao long nhau trong mot
        // giao dich, nen khong co trang thai "co lan nhan viec ma khong co cho ghi thuong mai".
        commercial: { create: {} },
      },
    });
    return toIntake(row);
  }

  async findById(id: string): Promise<RunSiteIntake | null> {
    const row = await this.prisma.transportRunSiteIntake.findUnique({ where: { id } });
    return row ? toIntake(row) : null;
  }

  async findByEvent(driverId: string, clientEventId: string): Promise<RunSiteIntake | null> {
    const row = await this.prisma.transportRunSiteIntake.findUnique({
      where: { driverId_clientEventId: { driverId, clientEventId } },
    });
    return row ? toIntake(row) : null;
  }

  async findByRun(runId: string): Promise<RunSiteIntake | null> {
    const row = await this.prisma.transportRunSiteIntake.findUnique({ where: { runId } });
    return row ? toIntake(row) : null;
  }

  async listForDriver(driverId: string): Promise<readonly RunSiteIntake[]> {
    const rows = await this.prisma.transportRunSiteIntake.findMany({
      where: { driverId },
      orderBy: { confirmedAt: 'desc' },
    });
    return rows.map(toIntake);
  }
}
