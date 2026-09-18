import type { UniqueIndexRef } from '../config/storage-conflict.js';

/**
 * INDEX MOT PHAN cua nen tang tep — `#287` P2.
 *
 * Cung khuon voi `transport/storage-conflict.ts` va `costing/costing-storage-conflict.ts`: co che
 * nhan dien nam o `config/storage-conflict.ts`, con DANH SACH INDEX thuoc ve mien so huu bang.
 *
 * Vi sao mot hang so chu khong mot chuoi go tay o cho bat: Prisma KHONG bao ten index ra ngoai —
 * no doi nguoc ten constraint thanh TEN TRUONG (`meta.target`). Mot phep so sanh chuoi tren thong
 * diep se xanh o cuc bo va do tren Postgres, va do la mot lan hong da xay ra that o `#80`.
 */
export const PLATFORM_FILE_ACTIVE_LINK: UniqueIndexRef = {
  indexName: 'PlatformFileLink_activeLink_key',
  model: 'PlatformFileLink',
  /**
   * `meta.target` cua Prisma liet ke CA BON cot cua unique. Doi chieu tren `fileId` la du de phan
   * biet: tren bang nay chi co dung hai unique — khoa chinh `id`, va index mot phan nay.
   */
  column: 'fileId',
};
