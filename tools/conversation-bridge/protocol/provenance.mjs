/**
 * AI DUOC PHEP DANH THUC REVIEWER — cong provenance cua cau noi.
 *
 * Comment GitHub tren mot repo PUBLIC la dau vao khong tin cay: bat ky ai cung dan duoc dung khoi
 * van ban carrier vao mot comment. Neu cau noi tin van ban do thi ai cung goi duoc ChatGPT day.
 *
 * Nen o day KHONG doc mot chu nao trong than comment. Chi doc METADATA ma GitHub xac thuc:
 * `performed_via_github_app.slug` va `user.login` — thu ma nguoi binh luan khong tu dat duoc.
 * `AUTHOR=` / `ROLE=` viet trong than comment KHONG bao gio di toi day (#204 §4).
 *
 * Ba tang cua Giao thuc V0 duoc dung nguyen ven, khong tu che lai:
 *
 *   principal (GitHub xac thuc) --[so do cuc bo]--> vai --[MESSAGE_PRODUCERS]--> REVIEW_REQUEST
 *
 * So do la CAU HINH CUC BO (`config.allowedProducers`), khong phai phep mau theo ten chu repo:
 * khong co ID nao duoc viet cung trong ma nguon nay.
 */
import {
  authorizeProducer,
  definePrincipalRegistry,
  MESSAGE_TYPES,
  principalFromGithubEvent,
} from '@netviet/autopilot-protocol/validator/index.mjs';
import { BRIDGE_REASONS, rejected } from '../extension/shared/states.js';

/**
 * @typedef {{ kind: string, id: string }} Principal
 * @typedef {import('@netviet/autopilot-protocol/validator/principal.mjs').PrincipalRegistry} PrincipalRegistry
 */

/**
 * Dung so do principal tu cau hinh cuc bo. So do rong/hong => KHONG co so do => cong dong.
 * @param {ReadonlyArray<{ kind?: string, id?: string, roles?: ReadonlyArray<string> }> | undefined} allowedProducers
 * @returns {{ ok: true, registry: PrincipalRegistry } | import('../extension/shared/states.js').Rejection}
 */
export function registryFromConfig(allowedProducers) {
  const defined = definePrincipalRegistry(
    /** @type {ReadonlyArray<any>} */ (allowedProducers ?? []),
  );
  if (!defined.ok) {
    return rejected(BRIDGE_REASONS.REGISTRY_UNUSABLE, { protocolReason: defined.reason });
  }
  return { ok: true, registry: defined.registry };
}

/**
 * Metadata comment -> principal -> co duoc phat REVIEW_REQUEST khong.
 *
 * `commentMetadata` la doi tuong comment THO cua REST API GitHub. Ta chi cham vao cac truong
 * danh tinh cua no; `body` khong duoc doc o day va khong bao gio ra khoi day.
 *
 * @param {{ commentMetadata: unknown, registry: PrincipalRegistry }} input
 * @returns {{ ok: true, principal: Principal, roles: ReadonlyArray<string> } | import('../extension/shared/states.js').Rejection}
 */
export function authorizeCarrierProducer({ commentMetadata, registry }) {
  const principal = principalFromGithubEvent(commentMetadata);
  if (principal === null) {
    return rejected(BRIDGE_REASONS.PRINCIPAL_UNKNOWN);
  }
  // KHONG truyen `assertedRole`: cau noi khong co nguon nao dang tin cay de lay mot vai tu khai,
  // va truyen mot vai lay tu than comment chinh la lo hong ma §4 cam. De trong => vai hieu luc la
  // giao cua (vai cua principal trong so do) va (nguoi phat hop le cua REVIEW_REQUEST).
  const authorized = authorizeProducer({
    principal,
    registry,
    type: MESSAGE_TYPES.REVIEW_REQUEST,
  });
  if (!authorized.ok) {
    return rejected(BRIDGE_REASONS.PRODUCER_NOT_AUTHORIZED, {
      protocolReason: authorized.reason,
      principalKind: principal.kind,
    });
  }
  return { ok: true, principal: authorized.principal, roles: authorized.roles };
}
