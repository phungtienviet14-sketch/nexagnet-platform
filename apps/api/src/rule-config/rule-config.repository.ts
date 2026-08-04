import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { RuleConfigPayload, RuleConfigStatus, RuleConfigVersion } from '@ultty/shared';

export interface CreateRuleConfigDraftInput {
  payload: RuleConfigPayload;
  createdBy: string | null;
  createdAt: string;
}

export type RuleConfigTransitionResult =
  | { kind: 'updated'; value: RuleConfigVersion }
  | { kind: 'not_found' }
  | { kind: 'invalid_status'; status: RuleConfigStatus };

export interface ActivateRuleConfigInput {
  activatedBy: string;
  activatedAt: string;
}

/** Persistence seam. activatePreview must archive the previous active row atomically. */
export abstract class RuleConfigRepository {
  abstract createDraft(input: CreateRuleConfigDraftInput): Promise<RuleConfigVersion>;
  abstract findById(id: string): Promise<RuleConfigVersion | null>;
  abstract list(): Promise<RuleConfigVersion[]>;
  abstract findActive(): Promise<RuleConfigVersion | null>;
  abstract markPreview(id: string): Promise<RuleConfigTransitionResult>;
  abstract activatePreview(
    id: string,
    input: ActivateRuleConfigInput,
  ): Promise<RuleConfigTransitionResult>;
  abstract archiveActive(id: string): Promise<RuleConfigTransitionResult>;
}

function cloneVersion(version: RuleConfigVersion): RuleConfigVersion {
  return structuredClone(version);
}

@Injectable()
export class InMemoryRuleConfigRepository extends RuleConfigRepository {
  private store: ReadonlyMap<string, RuleConfigVersion> = new Map();
  private nextVersion = 1;

  async createDraft(input: CreateRuleConfigDraftInput): Promise<RuleConfigVersion> {
    const version: RuleConfigVersion = {
      id: randomUUID(),
      version: this.nextVersion,
      status: 'draft',
      payload: structuredClone(input.payload),
      createdBy: input.createdBy,
      activatedBy: null,
      createdAt: input.createdAt,
      activatedAt: null,
    };
    this.nextVersion += 1;
    this.store = new Map(this.store).set(version.id, version);
    return cloneVersion(version);
  }

  async findById(id: string): Promise<RuleConfigVersion | null> {
    const version = this.store.get(id);
    return version ? cloneVersion(version) : null;
  }

  async list(): Promise<RuleConfigVersion[]> {
    return [...this.store.values()]
      .sort((left, right) => right.version - left.version)
      .map(cloneVersion);
  }

  async findActive(): Promise<RuleConfigVersion | null> {
    const active = [...this.store.values()].find((version) => version.status === 'active');
    return active ? cloneVersion(active) : null;
  }

  async markPreview(id: string): Promise<RuleConfigTransitionResult> {
    const current = this.store.get(id);
    if (!current) return { kind: 'not_found' };
    if (current.status !== 'draft') return { kind: 'invalid_status', status: current.status };

    const preview: RuleConfigVersion = { ...current, status: 'preview' };
    this.store = new Map(this.store).set(id, preview);
    return { kind: 'updated', value: cloneVersion(preview) };
  }

  async activatePreview(
    id: string,
    input: ActivateRuleConfigInput,
  ): Promise<RuleConfigTransitionResult> {
    const current = this.store.get(id);
    if (!current) return { kind: 'not_found' };
    if (current.status !== 'preview') return { kind: 'invalid_status', status: current.status };

    const active: RuleConfigVersion = {
      ...current,
      status: 'active',
      activatedBy: input.activatedBy,
      activatedAt: input.activatedAt,
    };
    const archivedVersions = [...this.store.entries()].map(
      ([versionId, version]) =>
        [
          versionId,
          version.status === 'active' ? { ...version, status: 'archived' as const } : version,
        ] as const,
    );
    this.store = new Map(archivedVersions).set(id, active);
    return { kind: 'updated', value: cloneVersion(active) };
  }

  async archiveActive(id: string): Promise<RuleConfigTransitionResult> {
    const current = this.store.get(id);
    if (!current) return { kind: 'not_found' };
    if (current.status !== 'active') return { kind: 'invalid_status', status: current.status };

    const archived: RuleConfigVersion = { ...current, status: 'archived' };
    this.store = new Map(this.store).set(id, archived);
    return { kind: 'updated', value: cloneVersion(archived) };
  }
}
