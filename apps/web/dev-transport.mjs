#!/usr/bin/env node
/**
 * Chay `next dev` voi GOI KHACH VAN TAI de xem duoc be mat nay tren may.
 *
 * Vi sao can mot tep rieng: `loadTenantConfig()` chon khach bang bien moi truong (`TENANT_DIR` uu
 * tien hon `TENANT`, va KHONG co mac dinh), con `.claude/launch.json` chi khai duoc lenh + cong,
 * khong khai duoc bien moi truong. Dat bien trong mot script `package.json` thi lai lech nhau giua
 * Windows va POSIX. Mot tep Node nho la cach chay dung o ca hai.
 *
 * Cong 3002 de KHONG dung vao `web` (3000) hay Playwright (3010).
 *
 * `NEXT_PUBLIC_API_URL=''` lam moi loi goi API thanh duong tuong doi, nen mo man hinh ma khong chay
 * API se cho ra dung trang thai loi THAT ma khach se thay — do la thu can xem, khong phai thu can che.
 */
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const tenantDir = resolve(here, '../../tenants/transport-preview');

const child = spawn(
  process.execPath,
  [resolve(here, 'node_modules/next/dist/bin/next'), 'dev', '-p', '3002'],
  {
    cwd: here,
    stdio: 'inherit',
    env: { ...process.env, TENANT_DIR: tenantDir, NEXT_PUBLIC_API_URL: '' },
  },
);

child.on('exit', (code) => process.exit(code ?? 0));
