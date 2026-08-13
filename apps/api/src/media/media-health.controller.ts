import { Controller, Get } from '@nestjs/common';
import { MediaFetcherService, type MediaHealthSnapshot } from './media-fetcher.service.js';
import { MediaStore, type MediaStoreHealth } from './media-store.js';

export interface MediaHealthResponse extends MediaHealthSnapshot {
  /**
   * Ket qua cham THAT vao kho. Khac `storage.state`: cai kia suy ra tu bo dem tai anh, nen truoc
   * khi co tin nhan dau tien no luon bao "healthy" — ke ca khi bucket khong ton tai. Truong nay
   * la cach duy nhat de biet cau hinh S3 dung TRUOC khi co anh that.
   */
  reachability: MediaStoreHealth;
}

/** Observability co bao ve boi auth global; snapshot khong chua locator hay secret. */
@Controller('health/media')
export class MediaHealthController {
  constructor(
    private readonly fetcher: MediaFetcherService,
    private readonly store: MediaStore,
  ) {}

  @Get()
  async check(): Promise<MediaHealthResponse> {
    return { ...this.fetcher.health(), reachability: await this.store.check() };
  }
}
