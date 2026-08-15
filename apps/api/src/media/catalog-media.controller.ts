import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Inject,
  NotFoundException,
  Param,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../auth/public.decorator.js';
import { CATALOG_STORE } from './catalog.tokens.js';
import type { MediaStore } from './media-store.js';

/**
 * Phuc vu ANH/VIDEO CATALOG SAN PHAM cho Zalo fetch (chot 15/08/2026).
 *
 * VI SAO PHAI CONG KHAI: Zalo Bot `sendPhoto` nhan mot URL roi TU di tai anh ve — no khong mang
 * theo cookie phien hay API key cua minh. Anh nam sau auth thi Zalo nhan 401 va tin gui di khong
 * co anh.
 *
 * VI SAO KHO RIENG (`CATALOG_DIR`) chu khong dung chung `MediaStore`: hai loai du lieu khac han —
 *   MEDIA_*     = anh KHACH gui vao (CCCD, dia chi, don hang) — PII, bucket PRIVATE, ho so D22;
 *   CATALOG_DIR = anh san pham cong ty phat hanh — tai lieu tiep thi, PHAI cong khai.
 * Route nay chi nhin thay kho catalog, nen khong co duong nao — ke ca mot khoa doc ac y — cham
 * toi duoc anh khach. Neu dung chung mot kho, chi mot loi cau hinh prefix la du phat PII ra
 * Internet; tach hai duong thi dieu do khong the xay ra.
 */
@Controller('media/catalog')
export class CatalogMediaController {
  constructor(@Inject(CATALOG_STORE) private readonly store: MediaStore) {}

  /**
   * `*path` la cu phap wildcard CO TEN cua Express 5 (NestJS 11) — `'*'` tran khong con match.
   *
   * Anh duoc dat ten theo hash noi dung nen mot khoa luon tro toi dung mot byte-stream:
   * `immutable` an toan, va Zalo/CDN khong phai hoi lai.
   */
  @Public()
  @Get('*path')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  async serve(@Param('path') path: string | string[], @Res() res: Response): Promise<void> {
    const relative = Array.isArray(path) ? path.join('/') : path;
    if (!relative || !isSafeRelativeKey(relative)) {
      throw new BadRequestException('Khoa khong hop le');
    }
    const object = await this.store.get(relative);
    if (!object) throw new NotFoundException('Khong tim thay tep');
    res.setHeader('Content-Type', object.contentType);
    // Anh san pham la tai lieu tiep thi, nhung van khong de trinh duyet doan lai kieu tep.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(object.body);
  }
}

/**
 * Chan `..`, khoa tuyet doi va byte NUL TRUOC khi cham kho.
 *
 * `LocalMediaStore.get()` da co rao rieng, nhung kho S3/GCS thi khong: voi chung
 * `catalog/../media/x` chi la mot khoa hop le. Rao phai nam o BIEN GIOI HTTP, khong phai o mot
 * hien thuc kho cu the.
 */
export function isSafeRelativeKey(key: string): boolean {
  if (key.includes('\0') || key.startsWith('/') || /^[a-zA-Z]:/.test(key)) return false;
  return !key.split(/[\\/]/).some((segment) => segment === '..' || segment === '');
}
