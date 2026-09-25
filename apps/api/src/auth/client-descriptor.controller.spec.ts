import { RequestMethod } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { tenantConfigSchema, toPublicTenantDescriptor, type TenantConfig } from '@netviet/tenant';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CLIENT_DESCRIPTOR_CONTRACT,
  ClientDescriptorController,
  resolveClientTenantDescriptor,
} from './client-descriptor.controller.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';

/** Khoa metadata cua Nest — cung cach `app-composition.routes.spec.ts` doc bang dinh tuyen. */
const PATH_METADATA = 'path';
const METHOD_METADATA = 'method';

const fixtureDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../packages/tenant/src/__tests__/fixtures/transport-core',
);

const fixtureConfig = (): TenantConfig =>
  tenantConfigSchema.parse(JSON.parse(readFileSync(resolve(fixtureDir, 'tenant.json'), 'utf8')));

describe('GET /auth/client', () => {
  const previousAuthMode = process.env.AUTH_MODE;

  afterEach(() => {
    if (previousAuthMode === undefined) delete process.env.AUTH_MODE;
    else process.env.AUTH_MODE = previousAuthMode;
  });

  it('la route CONG KHAI GET /auth/client', () => {
    const handler = ClientDescriptorController.prototype.describe;

    expect(Reflect.getMetadata(PATH_METADATA, ClientDescriptorController)).toBe('auth');
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('client');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.GET);
    expect(
      new Reflector().getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        handler,
        ClientDescriptorController,
      ]),
    ).toBe(true);
  });

  it('tra ma hop dong, che do dang nhap va phep chieu cong khai cua goi khach', () => {
    process.env.AUTH_MODE = 'none';
    const tenant = resolveClientTenantDescriptor(fixtureConfig);

    const body = new ClientDescriptorController(tenant).describe();

    expect(body.contract).toBe(CLIENT_DESCRIPTOR_CONTRACT);
    expect(body.contract).toBe('nexagent-client/1');
    expect(body.authMode).toBe('none');
    // CUNG phep chieu web dua cho trinh duyet — khong mot ban chep thu hai.
    expect(body.tenant).toEqual(toPublicTenantDescriptor(fixtureConfig()));
  });

  it('mang du truong thuong hieu, nang luc va mui gio cua khach', () => {
    const body = new ClientDescriptorController(
      resolveClientTenantDescriptor(fixtureConfig),
    ).describe();

    expect(body.tenant?.branding).toMatchObject({
      productName: 'Transport Operations',
      installName: 'Transport Operations',
      shortName: 'Transport',
      themeColor: '#123a5f',
      backgroundColor: '#f4f6f9',
      monogram: 'T',
    });
    expect(body.tenant?.experience).toBe('transport-operations');
    expect(body.tenant?.capabilities).toEqual(['transport-core']);
    expect(body.tenant?.transport).toEqual({ timeZone: 'Asia/Ho_Chi_Minh' });
  });

  it('khong mot truong nao trong giong bi mat hay khoi noi bo cua goi khach', () => {
    const body = new ClientDescriptorController(
      resolveClientTenantDescriptor(fixtureConfig),
    ).describe();
    const keys: string[] = [];
    const walk = (node: unknown): void => {
      if (node === null || typeof node !== 'object') return;
      for (const [key, value] of Object.entries(node)) {
        keys.push(key);
        walk(value);
      }
    };
    walk(body);

    expect(keys.length).toBeGreaterThan(10);
    const secretLike = keys.filter((key) =>
      /secret|token|password|credential|api[-_]?key|session|persona|policies|bootstrap|slug/i.test(
        key,
      ),
    );
    expect(secretLike).toEqual([]);
  });

  it('tien trinh khong co goi khach -> tenant: null, khong nem', () => {
    const tenant = resolveClientTenantDescriptor(() => {
      throw new Error('Thieu bien TENANT');
    });

    expect(tenant).toBeNull();
    expect(new ClientDescriptorController(tenant).describe().tenant).toBeNull();
    // Nest khong tiem gi (provider vang mat) cung cho ra cung cau tra loi.
    expect(new ClientDescriptorController().describe().tenant).toBeNull();
  });
});
