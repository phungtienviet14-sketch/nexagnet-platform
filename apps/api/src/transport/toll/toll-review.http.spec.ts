import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * `#318` — BO NGHI TRUNG KHONG PHAI LA XAC NHAN, do qua HTTP THAT.
 *
 * ===========================================================================
 * VI SAO PHAI QUA HTTP
 *
 * Mot nguoi goi API TRUC TIEP (script, curl, mot tab cu) khong di qua man hinh. Bai nay dung Nest
 * THAT (`AppModule`, guard, zod, controller, anh xa loi mien -> ma HTTP) cua goi khach fixture
 * `transport-toll` va chi noi chuyen bang `fetch`: tao xe, tai khoan, nap, quyet, doc dong, doc bao
 * cao chi phi. Moi khang dinh la thu ma client nhin thay tren day — ma trang thai va than phan hoi.
 *
 * ===========================================================================
 * MOT BAI, HAI KHO
 *
 * `RUN_PRISMA_IT=1` (job `integration`) -> `PERSISTENCE=prisma` tren Postgres THAT; con lai (job
 * `verify`) -> kho bo nho. Tien to `96IT318H` / `ITX318HTTP` va ngay 10/08/2032 khong tep nao khac
 * dung, nen bai chay chung CSDL voi cac tep IT khac ma khong dung fixture cua nhau.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(
  HERE,
  '../../../../../packages/tenant/src/__tests__/fixtures/transport-toll',
);
const ON_POSTGRES = process.env.RUN_PRISMA_IT === '1';
/** Khoa cua bai kiem, SINH MOI moi lan chay — khong co mot chuoi khoa nao nam trong ma nguon. */
const TEST_KEY = `toll-http-${randomUUID()}`;

const PLATE = '96IT318H-001.11';
const PLATE_PREFIX = '96IT318H';
const PREFIX = 'ITX318HTTP';
const ACCOUNT_NO = `${PREFIX}-VT`;
const DAY = '2032-08-10';

interface CandidateBody {
  readonly id: string;
  readonly rowNumber: number;
  readonly vehicleId: string | null;
  readonly matchState: string | null;
  readonly reviewState: string;
  readonly duplicateOfCandidateId: string | null;
}

interface CandidateDetailBody {
  readonly candidate: CandidateBody;
  readonly decisions: readonly { readonly action: string; readonly actor: string }[];
}

interface ErrorBody {
  readonly statusCode: number;
  readonly reason: string;
  readonly message: string;
}

interface SpendAmount {
  readonly rowCount: number;
  readonly amount: number;
}

interface SpendReportBody {
  readonly vehicles: readonly {
    readonly vehicleId: string;
    readonly confirmed: SpendAmount;
    readonly open: SpendAmount;
  }[];
  readonly duplicates: readonly { readonly state: string; readonly total: SpendAmount }[];
}

interface Reply<T> {
  readonly status: number;
  readonly body: T;
}

async function bootApi(): Promise<{ readonly app: INestApplication; readonly base: string }> {
  Object.assign(process.env, {
    TENANT_DIR: FIXTURE,
    PERSISTENCE: ON_POSTGRES ? 'prisma' : 'memory',
    NODE_ENV: 'test',
    // Che do KHONG phien cua CI/demo, nhung CO khoa: moi yeu cau phai mang `x-api-key` nhu mot
    // client goi thang API. Vai va quyen cua che do phien da co bai rieng (`roles-coverage.spec.ts`).
    AUTH_MODE: 'api-key',
    API_KEY: TEST_KEY,
    WORKFLOW_ENGINE: 'off',
  });
  delete process.env.TENANT;

  const { resetTenantCache } = await import('@netviet/tenant');
  resetTenantCache();
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../../app.module.js');
  const app = await NestFactory.create(await AppModule.forRoot(), {
    logger: ['error'],
    abortOnError: false,
  });
  await app.listen(0, '127.0.0.1');
  return { app, base: (await app.getUrl()).replace('[::1]', '127.0.0.1') };
}

describe('#318 — CLEAR_DUPLICATE KHONG tu xac nhan, do qua HTTP THAT', () => {
  let api: { readonly app: INestApplication; readonly base: string } | undefined;

  const send = async <T>(
    method: 'GET' | 'POST',
    path: string,
    payload?: unknown,
  ): Promise<Reply<T>> => {
    if (api === undefined) throw new Error('API chua khoi dong');
    const response = await fetch(`${api.base}${path}`, {
      method,
      headers: {
        'x-api-key': TEST_KEY,
        ...(payload === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
    const text = await response.text();
    return { status: response.status, body: (text === '' ? null : JSON.parse(text)) as T };
  };

  /** Chi chay khi `PERSISTENCE=prisma`: go dung cac hang ma bai nay tao, theo tien to. */
  async function cleanup(): Promise<void> {
    if (api === undefined || !ON_POSTGRES) return;
    const { PrismaService } = await import('../../config/prisma.service.js');
    const prisma = api.app.get(PrismaService, { strict: false });
    const imports = await prisma.transportTollImport.findMany({
      where: { sourceLabel: { startsWith: PREFIX } },
      select: { id: true },
    });
    const importIds = imports.map((row) => row.id);
    const candidates = await prisma.transportTollTransactionCandidate.findMany({
      where: { importId: { in: importIds } },
      select: { id: true },
    });
    /* Tat trigger CHI-GHI-THEM trong MOT giao dich roi bat lai ngay — khuon cua cac tep toll khac. */
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('ALTER TABLE "TransportTollReviewDecision" DISABLE TRIGGER USER');
      await tx.transportTollReviewDecision.deleteMany({
        where: { candidateId: { in: candidates.map((row) => row.id) } },
      });
      await tx.$executeRawUnsafe('ALTER TABLE "TransportTollReviewDecision" ENABLE TRIGGER USER');
      await tx.transportTollTransactionCandidate.deleteMany({
        where: { importId: { in: importIds } },
      });
      await tx.$executeRawUnsafe('ALTER TABLE "TransportTollImport" DISABLE TRIGGER USER');
      await tx.transportTollImport.deleteMany({ where: { id: { in: importIds } } });
      await tx.$executeRawUnsafe('ALTER TABLE "TransportTollImport" ENABLE TRIGGER USER');
    });
    const accounts = await prisma.transportTollAccount.findMany({
      where: { accountNo: { startsWith: PREFIX } },
      select: { id: true },
    });
    const accountIds = accounts.map((row) => row.id);
    await prisma.transportTollAccountVehicleLink.deleteMany({
      where: { accountId: { in: accountIds } },
    });
    await prisma.transportTollAccount.deleteMany({ where: { id: { in: accountIds } } });
    await prisma.transportVehicle.deleteMany({
      where: { registrationPlate: { startsWith: PLATE_PREFIX } },
    });
  }

  beforeAll(async () => {
    api = await bootApi();
    await cleanup();
  }, 120_000);

  afterAll(async () => {
    await cleanup();
    await api?.app.close();
  });

  it('CONFIRM truoc -> 409; CLEAR -> PENDING (bao cao: chua xong); CLEAR lai tu tab cu -> 409; CONFIRM rieng -> CONFIRMED (bao cao: da xac nhan)', async () => {
    /* ------------------------------ Dung du lieu qua HTTP ------------------------------ */
    // Cong khoa la THAT: khong mang `x-api-key` thi khong doc duoc gi.
    const anonymous = await fetch(`${api?.base ?? ''}/transport/toll/reports/spend`);
    expect(anonymous.status).toBe(401);

    const vehicle = await send<{ id: string }>('POST', '/transport/vehicles', {
      registrationPlate: PLATE,
      vehicleClass: 'TRUCK',
    });
    expect(vehicle.status).toBe(201);
    const account = await send<{ id: string }>('POST', '/transport/toll/accounts', {
      provider: 'VETC',
      accountNo: ACCOUNT_NO,
      holderName: 'Cong ty B',
    });
    expect(account.status).toBe(201);
    const link = await send('POST', `/transport/toll/accounts/${account.body.id}/links`, {
      vehicleId: vehicle.body.id,
      providerVehicleRef: null,
      effectiveFrom: '2032-01-01',
      effectiveTo: null,
    });
    expect(link.status).toBe(201);

    const passage = {
      accountNo: ACCOUNT_NO,
      kind: 'TOLL_PASS',
      vehiclePlate: PLATE,
      passedAt: '10/08/2032 08:00',
      businessDate: null,
      amount: '-52.000',
      station: 'Tram IT 318 HTTP',
      providerRef: null,
    };
    const imported = await send<{
      import: { id: string };
      replayed: boolean;
      candidateCount: number;
    }>('POST', '/transport/toll/imports', {
      provider: 'VETC',
      sourceKind: 'MANUAL',
      sourceLabel: `${PREFIX}-nhap-tay`,
      periodStart: null,
      periodEnd: null,
      rows: [passage, passage],
    });
    expect(imported.status).toBe(201);
    expect(imported.body).toMatchObject({ replayed: false, candidateCount: 2 });
    const importId = imported.body.import.id;

    const listed = await send<{ items: readonly CandidateBody[] }>(
      'GET',
      `/transport/toll/candidates?importId=${importId}`,
    );
    expect(listed.status).toBe(200);
    const [first, second] = [...listed.body.items].sort((l, r) => l.rowNumber - r.rowNumber);
    if (first === undefined || second === undefined) throw new Error('lan nap khong tra du dong');
    expect(first).toMatchObject({
      vehicleId: vehicle.body.id,
      matchState: 'DUPLICATE_CANDIDATE',
      reviewState: 'PENDING',
    });

    const review = (candidateId: string, action: 'CONFIRM' | 'CLEAR_DUPLICATE') =>
      send<CandidateBody & ErrorBody>('POST', `/transport/toll/candidates/${candidateId}/review`, {
        action,
        vehicleId: null,
        duplicateOfCandidateId: null,
        note: `${PREFIX} ${action}`,
      });
    const detail = (candidateId: string) =>
      send<CandidateDetailBody>('GET', `/transport/toll/candidates/${candidateId}`);
    const progress = async (): Promise<readonly (readonly SpendAmount[])[]> => {
      const report = await send<SpendReportBody>(
        'GET',
        `/transport/toll/reports/spend?from=${DAY}&to=${DAY}&provider=VETC`,
      );
      expect(report.status).toBe(200);
      return report.body.vehicles
        .filter((row) => row.vehicleId === vehicle.body.id)
        .map((row) => [row.confirmed, row.open]);
    };

    /* ------------------- 1. CONFIRM thang tren dong nghi trung: 409 ------------------- */
    const early = await review(first.id, 'CONFIRM');
    expect(early.status).toBe(409);
    expect(early.body).toMatchObject({ reason: 'TOLL_REVIEW_DUPLICATE_UNRESOLVED' });

    /* ------------- 2. CLEAR_DUPLICATE: tra loi cau hoi trung, KHONG xac nhan ------------- */
    const cleared = await review(first.id, 'CLEAR_DUPLICATE');
    expect(cleared.status).toBe(201);
    expect(cleared.body).toMatchObject({
      id: first.id,
      matchState: 'MATCHED',
      reviewState: 'PENDING',
      duplicateOfCandidateId: null,
    });
    const afterClear = await detail(first.id);
    expect(afterClear.body.candidate.reviewState).toBe('PENDING');
    expect(afterClear.body.decisions.map((entry) => entry.action)).toEqual(['CLEAR_DUPLICATE']);
    const confirmedRows = await send<{ items: readonly CandidateBody[] }>(
      'GET',
      `/transport/toll/candidates?importId=${importId}&reviewState=CONFIRMED`,
    );
    expect(confirmedRows.body.items).toEqual([]);
    expect(await progress()).toEqual([
      [
        { rowCount: 0, amount: 0 },
        { rowCount: 1, amount: -52_000 },
      ],
    ]);

    /* ------------- 3. Tab cu gui lai CLEAR_DUPLICATE: 409, dong van PENDING ------------- */
    const replay = await review(first.id, 'CLEAR_DUPLICATE');
    expect(replay.status).toBe(409);
    expect(replay.body).toMatchObject({ reason: 'TOLL_REVIEW_DUPLICATE_NOT_SUSPECTED' });
    const afterReplay = await detail(first.id);
    expect(afterReplay.body.candidate.reviewState).toBe('PENDING');
    expect(afterReplay.body.decisions).toHaveLength(1);

    /* ---------------- 4. CONFIRM RIENG moi dua dong sang cot da xac nhan ---------------- */
    const confirmed = await review(first.id, 'CONFIRM');
    expect(confirmed.status).toBe(201);
    expect(confirmed.body).toMatchObject({ matchState: 'MATCHED', reviewState: 'CONFIRMED' });
    expect(await progress()).toEqual([
      [
        { rowCount: 1, amount: -52_000 },
        { rowCount: 0, amount: 0 },
      ],
    ]);
    const done = await detail(first.id);
    expect(done.body.decisions.map((entry) => entry.action)).toEqual([
      'CLEAR_DUPLICATE',
      'CONFIRM',
    ]);

    /* Dong kia van nghi trung: bo nghi trung mot dong khong tra loi thay cho dong con lai. */
    expect((await detail(second.id)).body.candidate).toMatchObject({
      matchState: 'DUPLICATE_CANDIDATE',
      reviewState: 'PENDING',
    });
  }, 120_000);
});
