import { Injectable } from '@nestjs/common';
import { Prisma, type User } from '@prisma/client';
import { PrismaService } from '../config/prisma.service.js';
import type { UserRole } from './auth.types.js';
import {
  DuplicateUserError,
  UserRepository,
  type AuthUserRecord,
  type CreateUserRecord,
} from './user.repository.js';

@Injectable()
export class PrismaUserRepository extends UserRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findByUsername(username: string): Promise<AuthUserRecord | null> {
    const row = await this.prisma.user.findUnique({ where: { username } });
    return row ? toRecord(row) : null;
  }

  async findById(id: string): Promise<AuthUserRecord | null> {
    const row = await this.prisma.user.findUnique({ where: { id } });
    return row ? toRecord(row) : null;
  }

  async list(): Promise<AuthUserRecord[]> {
    const rows = await this.prisma.user.findMany({ orderBy: [{ disabledAt: 'asc' }, { name: 'asc' }] });
    return rows.map(toRecord);
  }

  async create(input: CreateUserRecord): Promise<AuthUserRecord> {
    try {
      const row = await this.prisma.user.create({ data: input });
      return toRecord(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new DuplicateUserError();
      }
      throw error;
    }
  }

  async disable(id: string): Promise<AuthUserRecord | null> {
    return this.updateExisting(id, {
      disabledAt: new Date(),
      credentialVersion: { increment: 1 },
    });
  }

  async assignRole(id: string, role: UserRole): Promise<AuthUserRecord | null> {
    return this.updateExisting(id, { role });
  }

  async updatePassword(id: string, passwordHash: string): Promise<AuthUserRecord | null> {
    return this.updateExisting(id, {
      passwordHash,
      passwordChangedAt: new Date(),
      disabledAt: null,
      credentialVersion: { increment: 1 },
    });
  }

  async markLogin(id: string, at: Date): Promise<void> {
    await this.prisma.user.update({ where: { id }, data: { lastLoginAt: at } });
  }

  private async updateExisting(
    id: string,
    data: Prisma.UserUpdateInput,
  ): Promise<AuthUserRecord | null> {
    try {
      return toRecord(await this.prisma.user.update({ where: { id }, data }));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') return null;
      throw error;
    }
  }
}

function toRecord(user: User): AuthUserRecord {
  return { ...user, role: user.role as UserRole };
}
