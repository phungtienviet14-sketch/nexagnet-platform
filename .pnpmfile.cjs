/**
 * THEM UNG DUNG DI DONG KHONG DUOC DOI DO THI PHU THUOC CUA BAT KY APP NAO KHAC (#394).
 *
 * Mot peer TUY CHON khong duoc cai khi khong ai co no. Nhung ngay khi goi do co mat o BAT KY dau
 * trong workspace, pnpm dung no de thoa peer — va do thi cua nhung app KHONG lien quan gi thay doi
 * theo. Do 25/09/2026 khi them `apps/transport-mobile` (Expo SDK 57, react-native 0.86.3), cay cua
 * Expo mang theo bon goi va chung lan sang nam importer khac:
 *
 *   react-native              -> apps/api (adminjs -> react-redux@8, react-i18next@12)
 *   babel-plugin-react-compiler -> apps/web, apps/marketing (next@15)
 *   lightningcss, terser      -> moi goi dung vitest (vite@7)
 *
 * Nang nhat la dong dau: stage `deps` cua `deploy/netviet/Dockerfile` cai `--frozen-lockfile`
 * theo lockfile, nen image MAY CHU se keo react-native + metro + @react-native/* (hang tram MB,
 * ghep voi react@18.3.1 cua adminjs — mot to hop khong ai chay) du KHONG mot dong ma nao nap chung.
 * Ba dong sau nhe hon nhung cung loai: doi do thi cua app web dang chay that vi mot app khac.
 *
 * Moi muc duoi day go DUNG MOT peer tuy chon khoi DUNG MOT goi, va moi muc deu dung vi ly do cu
 * the: AdminJS la panel web (khong bao gio chay tren React Native); `next` chi nap
 * babel-plugin-react-compiler khi bat `experimental.reactCompiler` (hai app web deu khong bat);
 * vite chi dung lightningcss/terser khi cau hinh `css.transformer`/`build.minify` chon chung (ca
 * repo khong chon). Neu sau nay mot app THAT SU can mot peer nao o day, hay khai no la dependency
 * truc tiep cua app do VA go dong tuong ung o day — dung de no lot vao qua cay cua Expo.
 *
 * Khoa hoi quy: `deploy/netviet/mobile-dependency-isolation.contract.test.mjs` doc lockfile va doi
 * moi importer ngoai `apps/transport-mobile` khong nhac toi bat ky goi nao trong danh sach nay.
 *
 * Tep nay PHAI co mat o moi noi chay `pnpm install --frozen-lockfile`: pnpm ghi
 * `pnpmfileChecksum` vao lockfile va tu choi cai dat neu tep vang mat hoac khac (do 25/09/2026:
 * ERR_PNPM_LOCKFILE_CONFIG_MISMATCH). Vi vay Dockerfile COPY no o stage `deps`.
 */
const OPTIONAL_PEERS_TO_DROP = {
  'react-redux': ['react-native'],
  'react-i18next': ['react-native'],
  next: ['babel-plugin-react-compiler'],
  vite: ['lightningcss', 'terser'],
};

function withoutKeys(record, keys) {
  if (!record) return record;
  return Object.fromEntries(Object.entries(record).filter(([key]) => !keys.includes(key)));
}

function readPackage(pkg) {
  const drop = OPTIONAL_PEERS_TO_DROP[pkg.name];
  if (!drop || !pkg.peerDependencies) return pkg;
  // Chi go peer TUY CHON. Mot peer bat buoc ma bi go se bien thanh loi luc chay, im lang.
  const optional = drop.filter((name) => pkg.peerDependenciesMeta?.[name]?.optional === true);
  if (optional.length === 0) return pkg;
  return {
    ...pkg,
    peerDependencies: withoutKeys(pkg.peerDependencies, optional),
    peerDependenciesMeta: withoutKeys(pkg.peerDependenciesMeta, optional),
  };
}

module.exports = { hooks: { readPackage }, OPTIONAL_PEERS_TO_DROP };
