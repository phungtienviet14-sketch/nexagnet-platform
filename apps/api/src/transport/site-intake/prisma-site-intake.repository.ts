import { Injectable } from '@nestjs/common';
import type { PrismaService } from '../../config/prisma.service.js';
import type { BusinessDate } from '../business-date.js';
import {
  RunSiteIntakeRepository,
  type CreateRunSiteIntakeInput,
} from './site-intake.repository.js';
import type { RunSiteIntake, SiteIntakeLocationTrust } from './site-intake.types.js';

interface IntakeRow {
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
}

const toIntake = (row: IntakeRow): RunSiteIntake => ({
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
      },
    });
    return toIntake(row);
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
