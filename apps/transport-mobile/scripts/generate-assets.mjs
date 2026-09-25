#!/usr/bin/env node
/**
 * SINH ICON/SPLASH NATIVE tu MOT tep SVG (#394).
 *
 *   pnpm --filter @nexagnet/transport-mobile assets:generate
 *
 * Nguon: `assets/brand/nexagent-mark.svg`. Tep PNG duoc COMMIT (prebuild doc chung tu dia, va may
 * dung CI khong nen phai co sharp moi ra duoc icon), nhung KHONG sua tay: sua SVG roi chay lai.
 *
 * Moi bien the co mot rang buoc cua cua hang/he dieu hanh, va rang buoc do moi la ly do bien the
 * ton tai — khong phai "cho du bo":
 *   icon.png                     1024, KHONG kenh alpha. App Store tu choi icon co alpha (ITMS-90717),
 *                                va iOS tu bo goc, nen nen phu kin chu khong bo goc san.
 *   adaptive-icon.png            1024 tien canh trong suot. Launcher Android cat theo hinh rieng
 *                                (tron, giot nuoc, vuong bo goc) — noi dung phai nam trong vung
 *                                an toan giua (~61-66%) moi khong bi cat chu.
 *   adaptive-icon-monochrome.png Trang tren trong suot: Android 13+ to mau theo chu de (themed icon).
 *   splash-icon.png              512 trong suot; nen splash do expo-splash-screen to (sang/toi).
 *   favicon.png                  48 cho ban web xuat tu Expo.
 *
 * TAT DINH: cung SVG + cung ban sharp/libvips (khoa trong pnpm-lock) => cung byte. Khong nhung
 * metadata, khong bang mau, khong loc thich nghi — de mot lan chay lai khong sinh diff gia.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = join(ROOT, 'assets');
const SOURCE = join(ASSETS, 'brand', 'nexagent-mark.svg');

const TEAL = '#0E5C63';
const AMBER = '#F2A516';
const WHITE = '#FFFFFF';
const CANVAS = 1024;

/**
 * Tam + khung bao cua cum chu N + vach duong trong luoi 1024 (khop toa do trong SVG). Dung de thu
 * nho cum vao vung an toan cua adaptive icon ma khong lech tam.
 */
const GLYPH_BOX = { minX: 176, maxX: 848, minY: 200, maxY: 848 };

/**
 * Vung an toan adaptive icon: 66dp tren khung 108dp = 61%. Lay 0.61 (chat hon muc 66% hay duoc
 * noi) vi mot launcher cat tron se an vao goc cua vach duong truoc tien.
 */
const ADAPTIVE_SAFE_RATIO = 0.61;

function readDefs() {
  // Bo chu thich TRUOC khi tim: chu thich cua tep nguon nhac chu "<defs>" va se bi khop nham.
  const svg = readFileSync(SOURCE, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const match = /<defs>([\s\S]*?)<\/defs>/.exec(svg);
  if (!match) throw new Error(`${SOURCE}: thieu khoi <defs>`);
  for (const id of ['monogram', 'road']) {
    if (!match[1].includes(`id="${id}"`)) {
      throw new Error(`${SOURCE}: <defs> thieu id="${id}" — trinh sinh dua vao id nay`);
    }
  }
  return match[0];
}

function document(defs, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS} ${CANVAS}" width="${CANVAS}" height="${CANVAS}">${defs}${body}</svg>`;
}

function glyph(monogramFill, roadFill, transform = '') {
  const attr = transform === '' ? '' : ` transform="${transform}"`;
  return `<g${attr}><use href="#monogram" fill="${monogramFill}"/><use href="#road" fill="${roadFill}"/></g>`;
}

function safeZoneTransform() {
  const width = GLYPH_BOX.maxX - GLYPH_BOX.minX;
  const height = GLYPH_BOX.maxY - GLYPH_BOX.minY;
  const diagonal = Math.hypot(width, height);
  const scale = (CANVAS * ADAPTIVE_SAFE_RATIO) / diagonal;
  const cx = (GLYPH_BOX.minX + GLYPH_BOX.maxX) / 2;
  const cy = (GLYPH_BOX.minY + GLYPH_BOX.maxY) / 2;
  const half = CANVAS / 2;
  return `translate(${half} ${half}) scale(${scale.toFixed(4)}) translate(${-cx} ${-cy})`;
}

const PNG_OPTIONS = { compressionLevel: 9, adaptiveFiltering: false, palette: false };

async function render(svg, size, { opaque = false } = {}) {
  let image = sharp(Buffer.from(svg)).resize(size, size, { kernel: 'lanczos3' });
  // `flatten` + `removeAlpha` => PNG kieu mau 2 (RGB), khong con kenh alpha nao de App Store bat.
  if (opaque) image = image.flatten({ background: TEAL }).removeAlpha();
  return image.png(PNG_OPTIONS).toBuffer();
}

async function main() {
  const defs = readDefs();
  const tile = `<rect width="${CANVAS}" height="${CANVAS}" rx="224" fill="${TEAL}"/>`;
  const fullBleed = `<rect width="${CANVAS}" height="${CANVAS}" fill="${TEAL}"/>`;
  const safe = safeZoneTransform();

  const outputs = [
    {
      file: 'icon.png',
      svg: document(defs, fullBleed + glyph(WHITE, AMBER)),
      size: 1024,
      opaque: true,
    },
    { file: 'adaptive-icon.png', svg: document(defs, glyph(WHITE, AMBER, safe)), size: 1024 },
    {
      file: 'adaptive-icon-monochrome.png',
      svg: document(defs, glyph(WHITE, WHITE, safe)),
      size: 1024,
    },
    { file: 'splash-icon.png', svg: document(defs, tile + glyph(WHITE, AMBER)), size: 512 },
    { file: 'favicon.png', svg: document(defs, tile + glyph(WHITE, AMBER)), size: 48 },
  ];

  for (const output of outputs) {
    const png = await render(output.svg, output.size, { opaque: output.opaque === true });
    writeFileSync(join(ASSETS, output.file), png);
    const digest = createHash('sha256').update(png).digest('hex').slice(0, 16);
    process.stdout.write(
      `${output.file.padEnd(30)} ${output.size}x${output.size} ${String(png.length).padStart(7)} B  sha256:${digest}\n`,
    );
  }
}

await main();
