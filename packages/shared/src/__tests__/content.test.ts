import { describe, expect, it } from 'vitest';
import { contentImportManifestSchema, outboundContentSchema } from '../content.js';

describe('content contracts', () => {
  it('accepts an external-only asset manifest and keeps lifecycle explicit', () => {
    const manifest = contentImportManifestSchema.parse({
      source: { kind: 'local_manifest', sourceId: 'drive-inventory-2026-08' },
      assets: [
        {
          externalId: 'photo-elni-front',
          kind: 'image',
          locator: 'https://cdn.example.test/elni.webp',
          mimeType: 'image/webp',
          productSkus: ['ELNI'],
        },
      ],
      faqs: [],
      advice: [],
      links: [],
    });

    expect(manifest.assets[0]?.locator).toMatch(/^https:/);
    expect(manifest.assets[0]?.status).toBe('draft');
    expect(JSON.stringify(manifest)).not.toContain('binary');
  });

  it('rejects unsupported video/file payloads from the outbound contract', () => {
    expect(() =>
      outboundContentSchema.parse({ text: 'Xem video', video: 'https://example.test/a.mp4' }),
    ).toThrow();
    expect(outboundContentSchema.parse({ text: 'Xem catalog', links: [] }).text).toBe(
      'Xem catalog',
    );
  });
});
