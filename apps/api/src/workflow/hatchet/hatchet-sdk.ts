/**
 * SHIM — NOI DUY NHAT trong `apps/` duoc phep import `@hatchet-dev/typescript-sdk`.
 *
 * VI SAO PHAI CO MOT LOP MONG O DAY, chu khong import thang o moi noi can dung:
 *
 * 1. MA SAT ESM DA DO DUOC (POC §8.4). Repo la ESM thuan (`"type": "module"`,
 *    `moduleResolution: NodeNext`); SDK la CJS va KHONG khai `exports` map. Hau qua:
 *
 *      from '@hatchet-dev/typescript-sdk/v1'  ->  ERR_UNSUPPORTED_DIR_IMPORT + TS2307
 *      from '@hatchet-dev/typescript-sdk'     ->  chay duoc
 *
 *    Nghia la MOI vi du trong tai lieu chinh thuc (deu dung `/v1`) KHONG copy thang vao repo
 *    nay duoc. Neu de moi file tu import, moi lan co nguoi copy tu tai lieu la mot lan hong.
 *    Mot cho biet chuyen do la du.
 *
 * 2. GIA PHAI TRA cua duong import goc: no keo theo SDK v0 da khai tu, nen moi tien trinh in ra
 *    hai dong `DeprecationWarning` + mot dong `ConcurrencyLimitStrategy … have been moved`.
 *    Kho chiu, khong chan. Ghi o day de nguoi doc log khong di truy mot loi khong ton tai.
 *
 * 3. KHONG KHOA CHAT NHA CUNG CAP. Doi engine = viet mot adapter khac; chi file nay va
 *    `hatchet-workflow-engine.adapter.ts` phai doi. Tang nghiep vu khong biet Hatchet ton tai.
 *
 * KHONG khoi tao client o day. `HatchetClient.init()` doc bien moi truong va se NEM khi thieu
 * token — nen goi no luc import se lam sap ca bo test cua khach khong dung engine.
 */
export { HatchetClient } from '@hatchet-dev/typescript-sdk';
export type { HatchetClient as HatchetClientType } from '@hatchet-dev/typescript-sdk';
