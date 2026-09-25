import { describe, expect, it } from 'vitest';
import { HttpClient } from './http';
import { canPerform, fetchAccess, fetchClientDescriptor, hasCapability } from './platform';

function clientReturning(status: number, body: unknown): HttpClient {
  const text = body === undefined ? 'Not Found' : JSON.stringify(body);
  return new HttpClient({
    baseUrl: 'https://api.example.vn',
    clientTag: 'transport-mobile/test',
    getToken: () => 'tok',
    fetchImpl: (async () => new Response(text, { status })) as unknown as typeof fetch,
  });
}

/** Than 404 mac dinh cua NestJS khi route KHONG ton tai tren ban may chu nay. */
const NEST_ROUTE_ABSENT = {
  message: 'Cannot GET /transport/access',
  error: 'Not Found',
  statusCode: 404,
};

describe('fetchAccess — may chu cu chua co route thi la "khong biet", khong phai loi', () => {
  it('404 JSON mac dinh cua Nest (khong co `reason`) -> null, de may chu tu quyet', async () => {
    await expect(fetchAccess(clientReturning(404, NEST_ROUTE_ABSENT))).resolves.toBeNull();
  });

  it('404 khong phai JSON (cong khong khop route) -> null', async () => {
    await expect(fetchAccess(clientReturning(404, undefined))).resolves.toBeNull();
  });

  it('404 CO `reason` la phan quyet nghiep vu cua may chu -> nem ra', async () => {
    await expect(
      fetchAccess(clientReturning(404, { message: 'x', reason: 'TRANSPORT_NOT_ENABLED' })),
    ).rejects.toMatchObject({ status: 404, reason: 'TRANSPORT_NOT_ENABLED' });
  });

  it('200 -> danh sach thao tac cua chinh nguoi dung', async () => {
    const view = { role: 'SALE', actions: ['transport.driver.self.fuel.submit'] };
    await expect(fetchAccess(clientReturning(200, view))).resolves.toEqual(view);
  });

  it('5xx van la loi (khong nuot)', async () => {
    await expect(fetchAccess(clientReturning(503, { message: 'down' }))).rejects.toMatchObject({
      kind: 'SERVER',
    });
  });
});

describe('fetchClientDescriptor', () => {
  it('404 JSON cua Nest -> null', async () => {
    await expect(
      fetchClientDescriptor(
        clientReturning(404, { ...NEST_ROUTE_ABSENT, message: 'Cannot GET /auth/client' }),
      ),
    ).resolves.toBeNull();
  });
});

describe('canPerform / hasCapability — khong biet thi hien, may chu la cong that', () => {
  it('access null -> cho hien', () => {
    expect(canPerform(null, 'transport.x')).toBe(true);
  });

  it('access co danh sach -> chi thao tac trong danh sach', () => {
    const access = { role: 'SALE', actions: ['a'] };
    expect(canPerform(access, 'a')).toBe(true);
    expect(canPerform(access, 'b')).toBe(false);
  });

  it('descriptor null -> coi nhu nang luc co bat', () => {
    expect(hasCapability(null, 'transport-fuel')).toBe(true);
  });
});
