import { describe, expect, it } from 'vitest';
import type { MediaFetcherService } from './media-fetcher.service.js';
import { MediaHealthController } from './media-health.controller.js';

describe('MediaHealthController', () => {
  it('tra snapshot read-only tu fetcher', () => {
    const snapshot = {
      storage: { name: 's3', enabled: true, state: 'healthy' as const },
      downloads: { attempted: 3, succeeded: 3, failed: 0, inflight: 0 },
    };
    const fetcher = { health: () => snapshot } as unknown as MediaFetcherService;

    expect(new MediaHealthController(fetcher).check()).toEqual(snapshot);
  });
});
