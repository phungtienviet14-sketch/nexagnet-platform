import { randomUUID } from 'node:crypto';
import type { UserRole } from './auth.types.js';

export interface AuthUserRecord {
  id: string;
  username: string;
  name: string;
  email: string | null;
  phone: string | null;
  passwordHash: string;
  role: UserRole;
  disabledAt: Date | null;
  credentialVersion: number;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
  passwordChangedAt: Date | null;
}

export interface CreateUserRecord {
  username: string;
  name: string;
  email: string | null;
  phone: string | null;
  passwordHash: string;
  role: UserRole;
}

export class DuplicateUserError extends Error {
  constructor() {
    super('Duplicate user identity');
    this.name = 'DuplicateUserError';
  }
}

export abstract class UserRepository {
  abstract findByUsername(username: string): Promise<AuthUserRecord | null>;
  abstract findById(id: string): Promise<AuthUserRecord | null>;
  abstract list(): Promise<AuthUserRecord[]>;
  abstract create(input: CreateUserRecord): Promise<AuthUserRecord>;
  abstract disable(id: string): Promise<AuthUserRecord | null>;
  abstract assignRole(id: string, role: UserRole): Promise<AuthUserRecord | null>;
  abstract updatePassword(id: string, passwordHash: string): Promise<AuthUserRecord | null>;
  abstract markLogin(id: string, at: Date): Promise<void>;
}

export class InMemoryUserRepository extends UserRepository {
  private records: readonly AuthUserRecord[];

  constructor(seed: readonly AuthUserRecord[] = []) {
    super();
    this.records = seed.map(cloneRecord);
  }

  async findByUsername(username: string): Promise<AuthUserRecord | null> {
    const record = this.records.find((candidate) => candidate.username === username);
    return record ? cloneRecord(record) : null;
  }

  async findById(id: string): Promise<AuthUserRecord | null> {
    const record = this.records.find((candidate) => candidate.id === id);
    return record ? cloneRecord(record) : null;
  }

  async list(): Promise<AuthUserRecord[]> {
    return this.records.map(cloneRecord);
  }

  async create(input: CreateUserRecord): Promise<AuthUserRecord> {
    if (
      this.records.some(
        (record) =>
          record.username === input.username ||
          (input.email !== null && record.email === input.email) ||
          (input.phone !== null && record.phone === input.phone),
      )
    ) {
      throw new DuplicateUserError();
    }
    const now = new Date();
    const record: AuthUserRecord = {
      ...structuredClone(input),
      id: randomUUID(),
      disabledAt: null,
      credentialVersion: 1,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: null,
      passwordChangedAt: now,
    };
    this.records = [...this.records, record];
    return cloneRecord(record);
  }

  async disable(id: string): Promise<AuthUserRecord | null> {
    return this.update(id, (record) => ({
      ...record,
      disabledAt: new Date(),
      credentialVersion: record.credentialVersion + 1,
    }));
  }

  async assignRole(id: string, role: UserRole): Promise<AuthUserRecord | null> {
    return this.update(id, (record) => ({ ...record, role }));
  }

  async updatePassword(id: string, passwordHash: string): Promise<AuthUserRecord | null> {
    return this.update(id, (record) => ({
      ...record,
      passwordHash,
      passwordChangedAt: new Date(),
      credentialVersion: record.credentialVersion + 1,
    }));
  }

  async markLogin(id: string, at: Date): Promise<void> {
    await this.update(id, (record) => ({ ...record, lastLoginAt: new Date(at) }));
  }

  private async update(
    id: string,
    transform: (record: AuthUserRecord) => AuthUserRecord,
  ): Promise<AuthUserRecord | null> {
    const current = this.records.find((record) => record.id === id);
    if (!current) return null;
    const updated = { ...transform(cloneRecord(current)), updatedAt: new Date() };
    this.records = this.records.map((record) => (record.id === id ? updated : record));
    return cloneRecord(updated);
  }
}

function cloneRecord(record: AuthUserRecord): AuthUserRecord {
  return structuredClone(record);
}
