/**
 * NGUON GOC KICH HOAT — cong quyet dinh mot Issue cong khai co duoc chay ma tren may nguoi dung.
 *
 * Repo nay la PUBLIC. Bat ky ai cung mo duoc mot Issue va dan vao do mot hop dong task trong y
 * nhu that. Neu "co hop dong hop le" la du dieu kien thi ai cung dieu khien duoc Claude Code tren
 * may chu repo. Nen cai mang quyen KHONG PHAI noi dung Issue, ma la SU KIEN GAN NHAN: ai la nguoi
 * GitHub xac thuc da gan `agent:ready`.
 *
 * Bon luat fail-closed, moi luat mot ma rieng:
 *   - khong co so do tin cay cuc bo        -> TRIGGER_ALLOWLIST_MISSING (thieu != ai cung duoc)
 *   - khong doc duoc / khong co su kien gan -> TRIGGER_EVENT_MISSING
 *   - co su kien nhung khong xac dinh duoc ai -> TRIGGER_PRINCIPAL_UNKNOWN
 *   - biet ai, nhung khong nam trong so do  -> TRIGGER_PRINCIPAL_NOT_ALLOWED
 *
 * Danh tinh duoc dan xuat bang `principalFromGithubEvent` CUA GIAO THUC — khong viet lai luat
 * `[bot]`/app-slug o day. Thu duy nhat them vao la mot bo chuyen doi HINH DANG: su kien dong thoi
 * gian dung khoa `actor`, con giao thuc doc `user`/`sender`.
 */
import { principalFromGithubEvent } from '@netviet/autopilot-protocol/validator/index.mjs';
import { REASONS, deny } from './errors.mjs';

/**
 * Bo chuyen doi HINH DANG (khong phai ngu nghia): `{ actor }` cua timeline -> `{ user }` ma
 * `principalFromGithubEvent` da hieu. Uu tien `performed_via_github_app` duoc giu nguyen, nen
 * duong tin cay nhat cua giao thuc van la duong tin cay nhat o day.
 * @param {Record<string, any>} event
 */
export function timelineEventPrincipal(event) {
  return principalFromGithubEvent({
    performed_via_github_app: event?.performed_via_github_app,
    user: event?.actor,
  });
}

/**
 * @param {ReadonlyArray<{ kind: string, id: string }>} allowlist
 * @param {{ kind: string, id: string }} principal
 */
function isAllowed(allowlist, principal) {
  return allowlist.some(
    (entry) =>
      entry.kind === principal.kind && entry.id.toLowerCase() === principal.id.toLowerCase(),
  );
}

/**
 * @param {object} input
 * @param {Record<string, any>} input.issue than Issue nhu GitHub tra ve
 * @param {ReadonlyArray<Record<string, any>>} input.timeline
 * @param {string} input.readyLabel
 * @param {ReadonlyArray<{ kind: string, id: string }>} input.allowlist
 * @returns {{ ok: true, principal: { kind: string, id: string }, event: { id: unknown, createdAt: string | null } } | import('./errors.mjs').Denied}
 */
export function evaluateTriggerProvenance({ issue, timeline, readyLabel, allowlist }) {
  if (!Array.isArray(allowlist) || allowlist.length === 0) {
    return deny(REASONS.TRIGGER_ALLOWLIST_MISSING);
  }
  // Nhan phai con TREN Issue LUC NAY. Mot su kien gan nhan trong qua khu ma nhan da bi go la mot
  // task da bi RUT LAI — chay no la lam nguoc y nguoi da go.
  const labels = Array.isArray(issue?.labels) ? issue.labels : [];
  const present = labels.some(
    (label) => (typeof label === 'string' ? label : label?.name) === readyLabel,
  );
  if (!present) return deny(REASONS.READY_LABEL_MISSING, { label: readyLabel });

  const labelEvents = (Array.isArray(timeline) ? timeline : []).filter(
    (event) => event?.event === 'labeled' && event?.label?.name === readyLabel,
  );
  if (labelEvents.length === 0) return deny(REASONS.TRIGGER_EVENT_MISSING, { label: readyLabel });

  // Nhieu lan gan/go thi lan GAN GAN NHAT la lan dang co hieu luc. Khong xep hang duoc theo thoi
  // gian thi khong ket luan duoc ai dang chiu trach nhiem => tu choi, khong doan.
  const undated = labelEvents.filter((event) => typeof event?.created_at !== 'string');
  if (undated.length > 0 && labelEvents.length > 1) {
    return deny(REASONS.TRIGGER_EVIDENCE_AMBIGUOUS, { events: labelEvents.length });
  }
  const latest = [...labelEvents].sort((a, b) =>
    String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')),
  )[labelEvents.length - 1];

  const principal = timelineEventPrincipal(latest);
  if (principal === null) return deny(REASONS.TRIGGER_PRINCIPAL_UNKNOWN, { label: readyLabel });
  if (!isAllowed(allowlist, principal)) {
    return deny(REASONS.TRIGGER_PRINCIPAL_NOT_ALLOWED, {
      principal: `${principal.kind}:${principal.id}`,
    });
  }
  return {
    ok: /** @type {const} */ (true),
    principal,
    event: { id: latest?.id ?? null, createdAt: latest?.created_at ?? null },
  };
}
