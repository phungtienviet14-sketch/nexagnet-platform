import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

/**
 * CACH LY DU LIEU GIUA CAC KHACH — kiem tra IMAGE THAT, khong phai kiem .dockerignore.
 *
 * Image `deploy/netviet/Dockerfile` la ban CHUNG cho moi khach. Truoc 12/08/2026 no `COPY . .` ca
 * cay `tenants/`, nghia la gia si, dieu khoan cong no va chat ID nhom Zalo cua MOI khach deu nam
 * trong image; khach tu host chi can `docker save` la doc duoc so lieu cua khach khac.
 *
 * Kiem .dockerignore thoi thi khong du: mot `COPY` viet sai, mot lop base ke thua, hay mot buoc
 * build sinh file deu co the dua du lieu vao ma file cau hinh van "dung". Nen test nay mo image ra
 * xem that. Va no CO Y khong biet ten khach nao — moi khang dinh deu la ve CAU TRUC.
 *
 * Chay:
 *   docker build -f deploy/netviet/Dockerfile -t netviet-zalo:test .
 *   APP_IMAGE=netviet-zalo:test node --test deploy/netviet/image-isolation.contract.mjs
 *
 * Thieu APP_IMAGE -> skip, de `pnpm test` khong bat buoc phai co Docker.
 */

const IMAGE = process.env.APP_IMAGE?.trim();

/** Chay mot lenh shell BEN TRONG image, tra ve stdout da trim. */
function inImage(shellCommand) {
  return execFileSync('docker', ['run', '--rm', IMAGE, 'sh', '-c', shellCommand], {
    encoding: 'utf8',
    timeout: 120_000,
  }).trim();
}

const skip = IMAGE ? false : 'Dat APP_IMAGE=<image ref> de chay kiem tra nay';

test('image khong chua goi khach nao', { skip }, () => {
  // Tu in CO/KHONG thay vi de `test -e` quyet dinh ma thoat: ma thoat khac 0 se lam execFileSync
  // nem, va ta mat luon ket qua can doc.
  assert.equal(
    inImage('test -e /app/tenants && echo CO || echo KHONG'),
    'KHONG',
    'image van con thu muc /app/tenants — goi khach dang di theo image',
  );
});

test('khong file du lieu khach nao lot vao image bang duong khac', { skip }, () => {
  // Quet CA image chu khong rieng /app: mot COPY viet sai co the tha file o bat ky dau.
  // Bo qua node_modules (thu vien co the co file trung ten, khong lien quan goi khach).
  const found = inImage(
    'find / -xdev \\( -name knowledge.json -o -name tenant.json -o -name demo-messages.json \\) ' +
      "-not -path '*/node_modules/*' 2>/dev/null || true",
  );

  assert.equal(found, '', `image con file du lieu khach:\n${found}`);
});

test('bo DU LIEU khach chu khong bo CODE dung chung', { skip }, () => {
  // Luoi an toan cho chinh hai test tren: neu ai do lo tay loai ca packages/tenant khoi image thi
  // hai test tren van xanh mot cach vo nghia, con he thong thi khong boot duoc.
  assert.equal(
    inImage('test -d /app/packages/tenant/dist && echo CO || echo KHONG'),
    'CO',
    'loader goi khach bien mat khoi image — da loai qua tay',
  );
});
