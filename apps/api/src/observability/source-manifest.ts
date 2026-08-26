import { normalizeSourceLocation, type SourceContext, type SourceLocation } from '@netviet/shared';
import { SOURCE_MANIFEST } from './source-manifest.generated.js';
import type { ReleaseIdentity } from './trace-context.js';

/**
 * TRA CUU VI TRI MA NGUON cho mot dau vet chay.
 *
 * ---------------------------------------------------------------------------
 * DAY LA REGISTRY DUY NHAT, va no o TANG API — khong o web (muc 19).
 *
 * Web nhan `SourceLocation` da dung san trong `TraceNode`. No khong biet ten buoc nao ung voi
 * tep nao, va do la co y: mot ban sao cua bang nay ben web se troi khoi ban goc, roi hai man
 * hinh cua cung mot he thong se chi ve hai cho khac nhau.
 *
 * ---------------------------------------------------------------------------
 * VI SAO CO HAI CHI MUC:
 *
 * `decisions` — mot diem quyet dinh co N duong tu choi thi N duong do nam o N DONG khac nhau.
 *   `message.intake` duoc viet ra o BON cho trong `pipeline.service.ts` (dong 163/177/196/205),
 *   moi cho mot ma ly do. Tra cuu bang rieng `point` se luon tra ve dong dau tien — dung mot
 *   phan tu va sai ba phan tu, ma nguoi debug khong co cach nao biet minh dang o phan nao.
 *
 * `names` — ten BUOC. Chung khong di kem ly do, va chuoi ten duoc viet o dung ranh gioi nghiep
 *   vu ke ca khi lan goi `telemetry.step()` nam trong mot ham boc.
 *
 * ---------------------------------------------------------------------------
 * KHONG BIET THI IM. Moi duong o day ket thuc bang `null` chu khong bang mot phong doan.
 */

/** Mot muc trong bang — chinh la `SourceLocation` truoc khi qua cong kiem cua nen tang. */
export interface SourceManifestEntry {
  readonly functionName?: string;
  readonly filePath: string;
  /** Vang mat = ten do duoc viet ra o nhieu dong trong CUNG mot tep; tep dung, dong khong ro. */
  readonly line?: number;
}

export interface SourceManifest {
  /** URL repo tho, doc tu `package.json` cua nen tang. Chuan hoa o `@netviet/shared`. */
  readonly repositoryUrl?: string;
  /** `<mien>.<viec>` -> cho ten do duoc viet ra. Chi cac ten viet ra DUNG MOT cho. */
  readonly names: Readonly<Record<string, SourceManifestEntry>>;
  /** `<point>|<reason>` (hoac `<point>|*`) -> cho lan goi `decision()` duoc viet ra. */
  readonly decisions: Readonly<Record<string, SourceManifestEntry>>;
}

/** Ly do la mot bien luc bien dich -> muc dai dien cho MOI ly do cua diem do. */
const ANY_REASON = '*';

/** URL repo cua ban dang chay. Web khong tu suy ra no — nen tang noi. */
export function manifestRepositoryUrl(
  manifest: SourceManifest = SOURCE_MANIFEST,
): string | undefined {
  return manifest.repositoryUrl;
}

/** `gitSha` khi tang deploy khong biet minh dang chay commit nao. */
const UNKNOWN_SHA = 'unknown';

/**
 * DANH TINH MA NGUON cua ban dang chay — gan mot lan vao moi `TraceView`.
 *
 * `gitSha` lay DAY DU, khong cat ngan. `TelemetryRecord.release` cat con 12 ky tu vi no la thu
 * NGUOI DOC tren mot dong chat hep; con permalink la thu MAY DOC, va mot SHA cat ngan trong
 * `/blob/<sha>/…` la mot duong dan 404 cho o dung luc nguoi ta can no chay.
 *
 * `unknown` -> `undefined`: mot chuoi bao "khong biet" khong duoc phep di tiep nhu mot gia tri
 * that. Muc 16 muon console noi ro "khong xac dinh duoc ban phat hanh", va no chi noi duoc neu
 * truong nay VANG MAT chu khong mang chuoi `unknown`.
 */
export function currentSourceContext(
  release: ReleaseIdentity,
  manifest: SourceManifest = SOURCE_MANIFEST,
): SourceContext {
  const repositoryUrl = manifestRepositoryUrl(manifest);
  const releaseSha = release.gitSha !== UNKNOWN_SHA ? release.gitSha : undefined;
  return {
    ...(repositoryUrl ? { repositoryUrl } : {}),
    ...(releaseSha ? { releaseSha } : {}),
  };
}

/**
 * Vi tri ma nguon cua mot BUOC.
 *
 * Ten buoc trung o hai cho tro len da bi bo tu luc sinh bang, nen o day khong co cho nao phai
 * chon bua.
 */
export function sourceForStep(
  name: string,
  manifest: SourceManifest = SOURCE_MANIFEST,
): SourceLocation | null {
  return toLocation(manifest.names[name]);
}

/**
 * Vi tri ma nguon cua mot QUYET DINH.
 *
 * Thu tu tra cuu co chu y:
 *   1. `<point>|<reason>` — chinh xac toi dong, truong hop thuong gap;
 *   2. `<point>|*`        — lan goi viet ly do bang mot bien (vd `channel.send`), nen ca diem do
 *                           chi co MOT dong de chi toi, va do la mot cau tra loi dung;
 *   3. `null`.
 *
 * KHONG co buoc "lay dai mot muc nao do cua `point`". Do chinh la cho de bia ra mot dong sai.
 */
export function sourceForDecision(
  point: string,
  reason: string | undefined,
  manifest: SourceManifest = SOURCE_MANIFEST,
): SourceLocation | null {
  const exact = reason ? manifest.decisions[`${point}|${reason}`] : undefined;
  return toLocation(exact ?? manifest.decisions[`${point}|${ANY_REASON}`]);
}

/**
 * Moi muc deu di qua cong kiem cua nen tang truoc khi ra khoi tep nay.
 *
 * Bang duoc SINH RA, nen ta co the tin no — nhung "co the tin" khong phai ly do de bo cong kiem
 * duy nhat: mot ngay nao do bang co the duoc sinh tu mot goi khach mount ngoai, va luc do dong
 * nay la thu chan mot duong dan tuyet doi lot xuong web.
 */
function toLocation(entry: SourceManifestEntry | undefined): SourceLocation | null {
  if (!entry) return null;
  return normalizeSourceLocation(entry);
}
