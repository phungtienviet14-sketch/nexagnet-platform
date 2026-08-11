import { Injectable } from '@nestjs/common';
import { ruleConfigPayloadSchema } from '@netviet/shared';
import type { RuleConfigStatus, RuleConfigVersion } from '@netviet/shared';
import type { RuleConfigTransitionResult } from './rule-config.repository.js';
import { RuleConfigRepository } from './rule-config.repository.js';

export type RuleConfigLifecycleErrorCode = 'INVALID_PAYLOAD' | 'INVALID_TRANSITION' | 'NOT_FOUND';

export class RuleConfigLifecycleError extends Error {
  constructor(
    readonly code: RuleConfigLifecycleErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'RuleConfigLifecycleError';
  }
}

function requireTransition(
  result: RuleConfigTransitionResult,
  id: string,
  expectedStatus: RuleConfigStatus,
): RuleConfigVersion {
  if (result.kind === 'updated') return result.value;
  if (result.kind === 'not_found') {
    throw new RuleConfigLifecycleError('NOT_FOUND', `Rule config ${id} was not found`);
  }
  throw new RuleConfigLifecycleError(
    'INVALID_TRANSITION',
    `Rule config ${id} must be ${expectedStatus}; current status is ${result.status}`,
  );
}

@Injectable()
export class RuleConfigService {
  constructor(private readonly repository: RuleConfigRepository) {}

  async createDraft(payload: unknown, createdBy: string | null): Promise<RuleConfigVersion> {
    const parsed = ruleConfigPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      throw new RuleConfigLifecycleError('INVALID_PAYLOAD', 'Rule config payload is invalid');
    }

    return this.repository.createDraft({
      payload: parsed.data,
      createdBy,
      createdAt: new Date().toISOString(),
    });
  }

  async preview(id: string): Promise<RuleConfigVersion> {
    const current = await this.findRequired(id);
    const parsed = ruleConfigPayloadSchema.safeParse(current.payload);
    if (!parsed.success) {
      throw new RuleConfigLifecycleError(
        'INVALID_PAYLOAD',
        'Stored rule config payload is invalid',
      );
    }
    return requireTransition(await this.repository.markPreview(id), id, 'draft');
  }

  async activate(id: string, activatedBy: string): Promise<RuleConfigVersion> {
    return requireTransition(
      await this.repository.activatePreview(id, {
        activatedBy,
        activatedAt: new Date().toISOString(),
      }),
      id,
      'preview',
    );
  }

  async archive(id: string): Promise<RuleConfigVersion> {
    return requireTransition(await this.repository.archiveActive(id), id, 'active');
  }

  async findById(id: string): Promise<RuleConfigVersion | null> {
    return this.repository.findById(id);
  }

  async list(): Promise<RuleConfigVersion[]> {
    return this.repository.list();
  }

  async getActive(): Promise<RuleConfigVersion | null> {
    return this.repository.findActive();
  }

  private async findRequired(id: string): Promise<RuleConfigVersion> {
    const version = await this.repository.findById(id);
    if (!version) {
      throw new RuleConfigLifecycleError('NOT_FOUND', `Rule config ${id} was not found`);
    }
    return version;
  }
}
