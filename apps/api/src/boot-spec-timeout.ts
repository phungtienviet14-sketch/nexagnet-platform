/**
 * TRAN THOI GIAN cua cac bai `*.boot.spec.ts`.
 *
 * ============================================================================================
 * VI SAO 60 GIAY LA MOT CON SO SAI, VA SAI THEO KIEU KHO THAY NHAT
 * ============================================================================================
 *
 * Moi bai boot spec `spawnSync` mot tien trinh `tsx` roi dung no de dung ca mot ung dung Nest
 * that. Do la mot viec CHAM theo ban chat, khong phai vi ai do viet cham.
 *
 * Do duoc tren may 8 nhan, 08/09/2026:
 *
 *   · chay RIENG, mot worker   -> `knowledge-only` het **59.0s**, `neutral-tenant` het **34.1s**
 *   · chay ca bo, hai worker   -> ca hai cham tran: **60.5s**, roi do
 *   · chay ca bo, tam worker   -> sau tep do, kem `Timeout calling "onTaskUpdate"`
 *
 * Nghia la voi tran 60s, bai cham nhat con **mot giay** bien an toan khi may HOAN TOAN RANH. Bat
 * ky thu gi chay cung — mot ban dich khac, mot container, mot phien lam viec thu hai — deu day no
 * qua vach. Va khi no qua vach, thu bao ra KHONG PHAI mot assertion sai: tien trinh con bi giet,
 * nen loi doc len giong het mot lan boot hong that su.
 *
 * Do la phan dat nhat cua van de. Mot bai do vi tai may trong khong khac gi mot bai do vi ma
 * hong, nen moi lan no do lai ton mot vong chan doan de ket luan rang khong co gi hong ca.
 *
 * ============================================================================================
 * NEN TRAN NAY LA CAU HINH, KHONG PHAI HANG SO
 * ============================================================================================
 *
 * Mac dinh 180 giay cho bai cham nhat gap ba lan bien an toan. Day KHONG phai noi long mot phep
 * kiem: bai van kiem dung mot dieu nhu cu — ung dung co boot duoc voi dung bo capability do
 * khong. Cai duoc noi long chi la thoi gian cho, va thoi gian cho chua bao gio la thu ma bai nay
 * dinh khang dinh.
 *
 * `BOOT_SPEC_TIMEOUT_MS` cho phep siet lai o mot may chay CI on dinh, hoac noi ra them o mot may
 * dev dang ban.
 */

const DEFAULT_BOOT_SPAWN_TIMEOUT_MS = 180_000;

const parsed = Number(process.env.BOOT_SPEC_TIMEOUT_MS);

/** Tran cua tien trinh con (`spawnSync`). */
export const BOOT_SPAWN_TIMEOUT_MS =
  Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_BOOT_SPAWN_TIMEOUT_MS;

/**
 * Tran cua chinh bai kiem, LUON lon hon tran cua tien trinh con.
 *
 * Thu tu nay quan trong: neu vitest bo cuoc TRUOC khi tien trinh con bi giet thi bao loi se la
 * "test timed out" — khong kem stdout/stderr cua tien trinh con, tuc mat sach manh chung de biet
 * ung dung hong o dau. De tien trinh con chet truoc thi bai kiem con doc duoc loi that cua no.
 */
export const BOOT_TEST_TIMEOUT_MS = BOOT_SPAWN_TIMEOUT_MS + 10_000;
