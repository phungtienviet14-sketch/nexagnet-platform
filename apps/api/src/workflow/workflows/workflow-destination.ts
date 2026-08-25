/**
 * TEN DICH DEN LOGIC -> URL THAT. Quy tac nam DUNG MOT CHO, dung chung cho MOI khuon workflow.
 *
 * Truoc 25/08/2026 quy tac nay song trong `integration-handoff.steps.ts`. Khuon thu hai
 * (`sales-handoff-followup`) can y het phep doi do, va co hai duong di sai deu that:
 *
 *   sao chep    -> hai ban lech nhau, mot ben doi tien to ma ben kia khong;
 *   import cheo -> khuon nghiep vu phu thuoc khuon tich hop, mot quan he khong co that.
 *
 * Nen no ra day: khong khuon nao so huu no, ca hai cung dung.
 *
 * TRA VE KET QUA, KHONG NEM. Moi khuon co bo ma loi RIENG (`HandoffStepFailed`,
 * `FollowupStepFailed`) va bo nao cung muon `DESTINATION_NOT_CONFIGURED` mang dung kieu cua no.
 * Mot lop loi dung chung o day se ep ca hai khuon thua ke tu mot to tien khong ai can — nen ham
 * nay tra ve mo ta loi, con viec boc no vao kieu gi la cua noi goi.
 */

/** Tien to bien moi truong chua URL that cua mot dich den logic. */
export const DESTINATION_ENV_PREFIX = 'WORKFLOW_DESTINATION_';

/**
 * `destination` la mot slug (`^[a-z0-9][a-z0-9-]*$`, ep boi schema goi khach), nen phep doi nay
 * khong the sinh ra ten bien la.
 */
export function destinationEnvName(destination: string): string {
  return `${DESTINATION_ENV_PREFIX}${destination.toUpperCase().replaceAll('-', '_')}`;
}

export type DestinationLookup = { readonly url: string } | { readonly error: string };

/**
 * Doi ten logic thanh URL that.
 *
 * URL KHONG nam trong `tenants/<slug>/tenant.json` — goi khach nam trong git, va mot endpoint noi
 * bo cua khach khong thuoc ve do. Goi khach chi mang cai TEN; anh xa ten -> URL la cau hinh ha tang.
 */
export function resolveDestinationUrl(
  destination: string,
  env: NodeJS.ProcessEnv,
): DestinationLookup {
  const variable = destinationEnvName(destination);
  const raw = env[variable]?.trim();
  if (!raw) {
    return {
      error:
        `dich den '${destination}' chua co URL. Dat bien ${variable} trong khoi 'environment:' ` +
        `cua service worker.`,
    };
  }

  // Kiem o day chu khong de `fetch` tu nem: mot gia tri sai khuon la LOI CAU HINH cua ta, va no
  // phai mang ma cua ta chu khong phai mot `TypeError` cua runtime. Chan luon scheme khong phai
  // http(s) — `file://` di qua duoc thi mot bien dat nham bien thanh mot duong doc file.
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { error: `${variable} khong phai URL hop le` };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { error: `${variable} phai la http(s), dang la '${parsed.protocol}'` };
  }
  return { url: raw };
}
