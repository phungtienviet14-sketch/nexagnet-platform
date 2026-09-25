import { Controller, Get, Inject, Logger, Optional, type Provider } from '@nestjs/common';
import type { AppEnv } from '@netviet/shared';
import {
  loadTenantConfig,
  toPublicTenantDescriptor,
  type PublicTenantDescriptor,
  type TenantConfig,
} from '@netviet/tenant';
import { loadFoundationEnv } from '../config/foundation-env.js';
import { Public } from './public.decorator.js';

/**
 * Ma hop dong cua `GET /auth/client`. Doi HINH DANG phan hoi thi tang so, khong sua tai cho: ung
 * dung da cai tren dien thoai khong cap nhat cung luc voi may chu, va no can biet minh dang doc
 * phien ban nao truoc khi tin mot truong.
 */
export const CLIENT_DESCRIPTOR_CONTRACT = 'nexagent-client/1';

export interface ClientDescriptor {
  readonly contract: typeof CLIENT_DESCRIPTOR_CONTRACT;
  readonly authMode: AppEnv['AUTH_MODE'];
  /** `null` khi tien trinh chay khong co goi khach (chi xay ra trong test — xem resolver duoi). */
  readonly tenant: PublicTenantDescriptor | null;
}

export const CLIENT_TENANT_DESCRIPTOR = Symbol('CLIENT_TENANT_DESCRIPTOR');

/**
 * Phep chieu cong khai cua goi khach, tinh MOT lan luc dung module.
 *
 * `loadTenantConfig()` giu ban da nap trong bo nho — cung ban ma `AppModule.forRoot()` dung de
 * chon capability — nen day khong doc dia lan hai, va moi yeu cau tra cung mot doi tuong.
 *
 * Tra `null` thay vi nem khi khong nap duoc goi khach. Tren tien trinh API that dieu do KHONG xay ra:
 * `forRoot()` nap goi khach TRUOC khi dung module nay va se chet luc boot neu goi hong. Nhanh `null`
 * chi phuc vu nhung bo test dung `AuthModule` khong kem goi khach — va no van de lai mot dong canh
 * bao chu khong im lang.
 */
export function resolveClientTenantDescriptor(
  load: () => TenantConfig = loadTenantConfig,
): PublicTenantDescriptor | null {
  let config: TenantConfig;
  try {
    config = load();
  } catch (error) {
    new Logger('ClientDescriptor').warn(
      `Khong nap duoc goi khach -> /auth/client tra tenant: null (${error instanceof Error ? error.message : String(error)})`,
    );
    return null;
  }
  return toPublicTenantDescriptor(config);
}

export const clientTenantDescriptorProvider: Provider = {
  provide: CLIENT_TENANT_DESCRIPTOR,
  useFactory: (): PublicTenantDescriptor | null => resolveClientTenantDescriptor(),
};

/**
 * MO TA MAY CHU cho ung dung native — thuong hieu, nang luc, mui gio, che do dang nhap.
 *
 * Web khong can route nay: Server Component doc goi khach roi dua xuong trinh duyet. Ung dung tren
 * dien thoai thi khong co Server Component nao, va neu no tu giu mot ban thuong hieu/nang luc thi
 * do la mot su that THU HAI ve khach. Nen may chu tra dung phep chieu ma web dung
 * (`toPublicTenantDescriptor`) — khong mot truong nao hon.
 *
 * `@Public`: man hinh dang nhap can biet ten khach va che do dang nhap TRUOC khi co phien. Khong
 * gi o day la bi mat — phep chieu chon tung truong mot chinh de dieu do dung.
 *
 * Nam duoi `/auth` vi edge chi chuyen mot danh sach duong dan tuong minh sang API, va `/auth*` da
 * co trong do (`deploy/netviet/edge/Caddyfile`).
 */
@Controller('auth')
export class ClientDescriptorController {
  constructor(
    @Optional()
    @Inject(CLIENT_TENANT_DESCRIPTOR)
    private readonly tenant: PublicTenantDescriptor | null = null,
  ) {}

  @Get('client')
  @Public()
  describe(): ClientDescriptor {
    return {
      contract: CLIENT_DESCRIPTOR_CONTRACT,
      authMode: loadFoundationEnv().AUTH_MODE,
      tenant: this.tenant ?? null,
    };
  }
}
