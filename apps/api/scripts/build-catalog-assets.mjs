#!/usr/bin/env node
/**
 * Dung ANH CATALOG SAN PHAM tu goi tai lieu khach gui, roi ghi `assets[]` vao content-manifest.
 *
 * VI SAO CAN: khach da gui 682 anh + 106 video (thu muc "Ảnh sản phẩm"/"Video sản phẩm" cho tung
 * san pham), nhung manifest truoc 15/08/2026 co `assets: []` — khong mot tam nao vao he thong, nen
 * agent tu van khong bao gio gui duoc anh du tai lieu khach (muc 1.1) yeu cau ro.
 *
 * VI SAO KHONG BUNDLE VIDEO: 106 video = ~7 GB. Anh sau khi ha xuong webp 1280px chi con vai chuc
 * MB nen di kem ban phat hanh duoc; video thi khong. Video BUOC phai di bang link (YouTube/Drive
 * cua khach) — script nay dem va bao cao, khong nhung vao.
 *
 * Anh dat ten theo HASH NOI DUNG: chay lai nhieu lan khong sinh ban trung, va khoa la bat bien nen
 * route catalog moi dam duoc `Cache-Control: immutable`.
 *
 * Chay:
 *   node apps/api/scripts/build-catalog-assets.mjs --base-url https://api.example.test
 *   node apps/api/scripts/build-catalog-assets.mjs --dry-run
 */
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * Thu muc khach dat ten theo cach ho goi san pham, khong theo SKU. Anh xa nay la CHU Y thu cong —
 * doan bang chuoi gan giong se gan nham anh vao san pham khac, ma trong nhom dai ly thi mot tam
 * anh sai san pham la mot sai sot that.
 */
const FOLDER_TO_SKU = {
  'EUS Felix': 'FELIX',
  'Máy nước nóng Clage': 'CLAGE-CEX9',
  'Máy ép chậm Princess': 'PRINCESS-EASYFILL',
  'NCKD Princess': 'PRINCESS-12L',
  'ULTTY AROMA': 'AROMA',
  'ULTTY B23': 'B23',
  'ULTTY CR018HM_': 'SKJ-CR018HM',
  'ULTTY CR022': 'SKJ-CR022',
  'ULTTY ELNA': 'ELNA',
  'ULTTY ELNI': 'ELNI',
  'ULTTY HERCULES': 'HERCULES',
  'ULTTY MKL': 'MKL',
  'ULTTY SCW18': 'SCW18',
  'ULTTY V08': 'V08',
  'ULTTY WFX': 'WFX',
  'ULTTY bình điện phân CRS01': 'SKJ-CRS01',
  'ULTTY chậu quay rau PF360': 'COMBO-WFX-PF360',
  // ULTTY BB_ tach hai mau qua thu muc con — xu ly rieng ben duoi.
  // SUNTEC: khach co anh nhung danh muc 19 SKU khong co ma nao khop -> bao cao, khong doan.
};

/** Thu muc con cua "ULTTY BB_" -> SKU. BB co hai mau, moi mau la mot SKU rieng. */
const BB_SUBFOLDER_TO_SKU = { 'BB grey_': 'BB-GREY', 'BB rose': 'BB-ROSE' };

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.avi']);
/** Anh trong nhom Zalo hien nho; 1280px la du net ma khong keo nang ban phat hanh. */
const MAX_DIMENSION = 1280;
const WEBP_QUALITY = 80;

const isImage = (file) => IMAGE_EXTENSIONS.has(extname(file).toLowerCase());
const isVideo = (file) => VIDEO_EXTENSIONS.has(extname(file).toLowerCase());

function parseArgs(argv) {
  const args = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) args.set(key, 'true');
    else {
      args.set(key, next);
      i += 1;
    }
  }
  return {
    source:
      args.get('source') ??
      join(
        REPO_ROOT,
        'docs/khach-hang/ultty/nguon-goc/ho-so-khao-sat/gd1/AI Zalo_/FAQ bộ sản phẩm_',
      ),
    out: args.get('out') ?? join(REPO_ROOT, 'catalog-assets'),
    manifest: args.get('manifest') ?? join(REPO_ROOT, 'tenants/ultty/data/content-manifest.json'),
    // Mac dinh RONG = locator TUONG DOI. Goi khach khong duoc nhung ten mien: mot goi phai chay
    // duoc tren ca local, demo va pilot, ma ba noi do khac ten mien. API ghep PUBLIC_BASE_URL
    // luc GUI (xem `absoluteLocator` trong content.service.ts).
    baseUrl: (args.get('base-url') ?? '').replace(/\/+$/, ''),
    perSku: Number.parseInt(args.get('per-sku') ?? '6', 10),
    dryRun: args.get('dry-run') === 'true',
  };
}

async function listFiles(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listFiles(full)));
    else out.push(full);
  }
  return out;
}

/** Thu muc anh cua mot san pham; khach dat ten khong dong nhat nen do nhieu bien the. */
async function findMediaDir(productDir, kind) {
  const wanted = kind === 'image' ? ['ảnh', 'anh', 'hình', 'hinh'] : ['video'];
  const entries = await readdir(productDir, { withFileTypes: true }).catch(() => []);
  const match = entries.find(
    (entry) => entry.isDirectory() && wanted.some((word) => entry.name.toLowerCase().includes(word)),
  );
  // Khong co thu muc con thi anh nam thang trong thu muc san pham.
  return match ? join(productDir, match.name) : productDir;
}

async function collectBySku(sourceDir) {
  const bySku = new Map();
  const unmapped = [];
  const entries = await readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const productDir = join(sourceDir, entry.name);

    if (entry.name === 'ULTTY BB_') {
      for (const [sub, sku] of Object.entries(BB_SUBFOLDER_TO_SKU)) {
        const dir = join(productDir, sub);
        bySku.set(sku, {
          images: (await listFiles(await findMediaDir(dir, 'image'))).filter(isImage),
          videos: (await listFiles(dir)).filter(isVideo),
        });
      }
      continue;
    }

    const sku = FOLDER_TO_SKU[entry.name];
    if (!sku) {
      const files = await listFiles(productDir);
      unmapped.push({ folder: entry.name, images: files.filter(isImage).length });
      continue;
    }
    bySku.set(sku, {
      images: (await listFiles(await findMediaDir(productDir, 'image'))).filter(isImage),
      videos: (await listFiles(productDir)).filter(isVideo),
    });
  }
  return { bySku, unmapped };
}

/**
 * Chon anh dai dien. Sap theo ten de ket qua ON DINH giua cac lan chay (readdir khong dam bao thu
 * tu): manifest doi moi lan chay se lam moi lan seed lai sinh ra ban ghi moi.
 */
function pickImages(files, limit) {
  return [...files].sort((left, right) => left.localeCompare(right, 'vi')).slice(0, limit);
}

async function convert(file) {
  const source = await readFile(file);
  const body = await sharp(source)
    .rotate()
    .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
  return { body, hash: createHash('sha256').update(body).digest('hex').slice(0, 16) };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  console.log(`Nguon : ${options.source}`);
  console.log(`Dich  : ${options.out}`);
  console.log(`Base  : ${options.baseUrl}`);
  console.log(`Moi SKU lay toi da ${options.perSku} anh${options.dryRun ? ' (DRY RUN)' : ''}\n`);

  const { bySku, unmapped } = await collectBySku(options.source);
  const assets = [];
  let bytes = 0;
  let videoCount = 0;

  for (const [sku, media] of [...bySku].sort()) {
    videoCount += media.videos.length;
    const picked = pickImages(media.images, options.perSku);
    for (const [index, file] of picked.entries()) {
      const { body, hash } = await convert(file);
      const key = `${sku}/${hash}.webp`;
      bytes += body.length;
      if (!options.dryRun) {
        await mkdir(dirname(join(options.out, key)), { recursive: true });
        await writeFile(join(options.out, key), body);
      }
      assets.push({
        externalId: `img-${sku}-${hash}`,
        kind: 'image',
        title: `${sku} — ảnh ${index + 1}`,
        locator: `${options.baseUrl}/media/catalog/${key}`,
        mimeType: 'image/webp',
        productSkus: [sku],
        status: 'draft',
      });
    }
    console.log(
      `${sku.padEnd(20)} ${String(picked.length).padStart(2)}/${String(media.images.length).padStart(3)} anh` +
        `  ${String(media.videos.length).padStart(3)} video (khong nhung)`,
    );
  }

  const manifest = JSON.parse(await readFile(options.manifest, 'utf8'));
  // Chi thay phan `assets`; faqs/advice/links do nguoi bien tap giu, khong duoc dap.
  const updated = { ...manifest, assets };
  if (!options.dryRun) {
    await writeFile(options.manifest, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');
  }

  console.log(`\n${assets.length} anh, ${(bytes / 1048576).toFixed(1)} MB sau khi ha webp.`);
  console.log(`Giu nguyen ${manifest.faqs?.length ?? 0} FAQ, ${manifest.links?.length ?? 0} link.`);
  console.log(
    `\n${videoCount} video KHONG duoc nhung (qua nang cho ban phat hanh) — can link YouTube/Drive tu khach.`,
  );
  if (unmapped.length) {
    console.log('\nThu muc CHUA co SKU (khong doan, can hoi khach):');
    for (const item of unmapped) console.log(`  - ${item.folder} (${item.images} anh)`);
  }
}

await main();
