import { Injectable } from '@nestjs/common';
import { ruleConfigVersionSchema, type RuleConfigVersion } from '@netviet/shared';
import { Prisma, type RuleConfigStatus as PrismaRuleConfigStatus } from '@prisma/client';
import { PrismaService } from '../config/prisma.service.js';
import {
  RuleConfigRepository,
  type ActivateRuleConfigInput,
  type CreateRuleConfigDraftInput,
  type RuleConfigTransitionResult,
} from './rule-config.repository.js';

@Injectable()
export class PrismaRuleConfigRepository extends RuleConfigRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async createDraft(input: CreateRuleConfigDraftInput): Promise<RuleConfigVersion> {
    const row = await this.prisma.ruleConfigVersion.create({
      data: {
        status: 'draft',
        payload: input.payload as unknown as Prisma.InputJsonValue,
        createdBy: input.createdBy,
        createdAt: new Date(input.createdAt),
      },
    });
    return toVersion(row);
  }

  async findById(id: string): Promise<RuleConfigVersion | null> {
    const row = await this.prisma.ruleConfigVersion.findUnique({ where: { id } });
    return row ? toVersion(row) : null;
  }

  async list(): Promise<RuleConfigVersion[]> {
    const rows = await this.prisma.ruleConfigVersion.findMany({ orderBy: { version: 'desc' } });
    return rows.map(toVersion);
  }

  async findActive(): Promise<RuleConfigVersion | null> {
    const row = await this.prisma.ruleConfigVersion.findFirst({
      where: { status: 'active' },
      orderBy: { version: 'desc' },
    });
    return row ? toVersion(row) : null;
  }

  async markPreview(id: string): Promise<RuleConfigTransitionResult> {
    const current = await this.prisma.ruleConfigVersion.findUnique({ where: { id } });
    if (!current) return { kind: 'not_found' };
    if (current.status !== 'draft') return { kind: 'invalid_status', status: current.status };
    return {
      kind: 'updated',
      value: toVersion(
        await this.prisma.ruleConfigVersion.update({ where: { id }, data: { status: 'preview' } }),
      ),
    };
  }

  async activatePreview(
    id: string,
    input: ActivateRuleConfigInput,
  ): Promise<RuleConfigTransitionResult> {
    return this.prisma.$transaction(async (transaction) => {
      const current = await transaction.ruleConfigVersion.findUnique({ where: { id } });
      if (!current) return { kind: 'not_found' } as const;
      if (current.status !== 'preview') {
        return { kind: 'invalid_status', status: current.status } as const;
      }
      await transaction.ruleConfigVersion.updateMany({
        where: { status: 'active' },
        data: { status: 'archived' },
      });
      const active = await transaction.ruleConfigVersion.update({
        where: { id },
        data: {
          status: 'active',
          activatedBy: input.activatedBy,
          activatedAt: new Date(input.activatedAt),
        },
      });
      return { kind: 'updated', value: toVersion(active) } as const;
    });
  }

  async archiveActive(id: string): Promise<RuleConfigTransitionResult> {
    const current = await this.prisma.ruleConfigVersion.findUnique({ where: { id } });
    if (!current) return { kind: 'not_found' };
    if (current.status !== 'active') return { kind: 'invalid_status', status: current.status };
    return {
      kind: 'updated',
      value: toVersion(
        await this.prisma.ruleConfigVersion.update({ where: { id }, data: { status: 'archived' } }),
      ),
    };
  }
}

function toVersion(row: {
  id: string;
  version: number;
  status: PrismaRuleConfigStatus;
  payload: Prisma.JsonValue;
  createdBy: string | null;
  activatedBy: string | null;
  createdAt: Date;
  activatedAt: Date | null;
}): RuleConfigVersion {
  return ruleConfigVersionSchema.parse({
    ...row,
    createdAt: row.createdAt.toISOString(),
    activatedAt: row.activatedAt?.toISOString() ?? null,
  });
}
