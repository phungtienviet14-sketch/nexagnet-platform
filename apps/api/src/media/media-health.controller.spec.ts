import { describe, expect, it } from 'vitest';
import type { MediaFetcherService } from './media-fetcher.service.js';
import { MediaHealthController } from './media-health.controller.js';
import type { MediaStore } from './media-store.js';

const SNAPSHOT = {
  storage: { name: 's3', enabled: true, state: 'healthy' as const },
  downloads: { attempted: 3, succeeded: 3, failed: 0, inflight: 0 },
};

function build(health: { healthy: boolean; detail: string }): MediaHealthController {
  const fetcher = { health: () => SNAPSHOT } as unknown as MediaFetcherService;
  const store = { check: async () => health } as unknown as MediaStore;
  return new MediaHealthController(fetcher, store);
}

describe('MediaHealthController', () => {
  it('tra snapshot read-only tu fetcher', async () => {
    const result = await build({ healthy: true, detail: 's3: doc duoc bucket kho-anh' }).check();
    expect(result).toMatchObject(SNAPSHOT);
  });

  /**
   * `storage.state` suy ra tu bo dem tai anh nen TRUOC khi co tin nhan dau tien no luon la
   * 'healthy' — ke ca khi bucket khong ton tai. Vi vay phai co truong rieng noi ket qua cham that.
   */
  it('bao kho KHONG cham toi duoc, ngay ca khi chua tai anh nao nen bo dem con sach', async () => {
    const result = await build({
      healthy: false,
      detail: 's3: khong doc duoc bucket kho-anh — NoSuchBucket',
    }).check();

    expect(result.storage.state).toBe('healthy');
    expect(result.reachability).toEqual({
      healthy: false,
      detail: 's3: khong doc duoc bucket kho-anh — NoSuchBucket',
    });
  });
});
