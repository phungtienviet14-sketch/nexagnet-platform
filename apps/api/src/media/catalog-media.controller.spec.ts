import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { describe, expect, it } from 'vitest';
import { CatalogMediaController, isSafeRelativeKey } from './catalog-media.controller.js';
import { MediaStore, type MediaObject } from './media-store.js';

class FakeCatalogStore extends MediaStore {
  readonly name = 'fake';
  readonly enabled = true;
  readonly asked: string[] = [];
  constructor(private readonly object: MediaObject | null) {
    super();
  }
  async put(): Promise<void> {}
  override async get(key: string): Promise<MediaObject | null> {
    this.asked.push(key);
    return this.object;
  }
}

function fakeResponse(): Response & { headers: Record<string, string>; body?: Buffer } {
  const res = {
    headers: {} as Record<string, string>,
    body: undefined as Buffer | undefined,
    setHeader(name: string, value: string) {
      res.headers[name] = value;
    },
    end(body: Buffer) {
      res.body = body;
    },
  };
  return res as unknown as Response & { headers: Record<string, string>; body?: Buffer };
}

describe('isSafeRelativeKey — rao o BIEN GIOI HTTP', () => {
  // Kho S3/GCS khong co khai niem "ra ngoai thu muc goc": voi chung `../media/x` chi la mot khoa
  // hop le. Nen rao phai chan tu day, khong duoc dua vao hien thuc kho cu the.
  it.each(['../media/cccd.webp', 'a/../../media/x.webp', '/etc/passwd', 'C:/Windows/win.ini'])(
    'tu choi khoa doc "%s"',
    (key) => {
      expect(isSafeRelativeKey(key)).toBe(false);
    },
  );

  it('tu choi khoa co byte NUL', () => {
    expect(isSafeRelativeKey('a\0b.webp')).toBe(false);
  });

  it('chap nhan khoa catalog binh thuong', () => {
    expect(isSafeRelativeKey('HERCULES/9f86d081.webp')).toBe(true);
  });
});

describe('CatalogMediaController', () => {
  it('tra bytes kem content-type va nosniff', async () => {
    const store = new FakeCatalogStore({ body: Buffer.from('anh'), contentType: 'image/webp' });
    const controller = new CatalogMediaController(store);
    const res = fakeResponse();

    await controller.serve(['HERCULES', '9f86d081.webp'], res);

    expect(store.asked).toEqual(['HERCULES/9f86d081.webp']);
    expect(res.headers['Content-Type']).toBe('image/webp');
    expect(res.headers['X-Content-Type-Options']).toBe('nosniff');
    expect(res.body?.toString()).toBe('anh');
  });

  it('khoa doc bi chan TRUOC khi cham kho', async () => {
    const store = new FakeCatalogStore({ body: Buffer.from('x'), contentType: 'image/webp' });
    const controller = new CatalogMediaController(store);

    await expect(controller.serve(['..', 'media', 'cccd.webp'], fakeResponse())).rejects.toThrow(
      BadRequestException,
    );
    // Quan trong hon ca viec nem: kho KHONG duoc hoi den.
    expect(store.asked).toEqual([]);
  });

  it('khong co tep thi 404', async () => {
    const controller = new CatalogMediaController(new FakeCatalogStore(null));
    await expect(controller.serve('HERCULES/missing.webp', fakeResponse())).rejects.toThrow(
      NotFoundException,
    );
  });

  it('khoa rong thi 400', async () => {
    const controller = new CatalogMediaController(new FakeCatalogStore(null));
    await expect(controller.serve('', fakeResponse())).rejects.toThrow(BadRequestException);
  });
});
