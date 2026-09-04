/**
 * PRINCIPAL (ai da xac thuc) va VAI GIAO THUC (ai duoc phat loai thong diep nao) — HAI THU KHAC NHAU.
 *
 * `ACTORS.*` (`CLAUDE_BUILDER`, `CHATGPT_REVIEWER`, ...) la VAI LOGIC cua giao thuc. Chung KHONG
 * BAO GIO la mot danh tinh GitHub. GitHub chi xac thuc duoc `comment.user.login` /
 * `performed_via_github_app.slug` — nhung gia tri nhu `nexagent-autopilot` hay ten dang nhap cua
 * chu repo. Gop hai khai niem lam mot chi con hai duong, ca hai deu sai:
 *
 *   1. dua principal that vao cho vai  -> thong diep HOP LE bi tu choi (principal != ten vai);
 *   2. suy vai tu LOAI thong diep      -> phan quyen thanh vong tron: "BUILD_READY do BUILDER phat
 *                                         vi no la BUILD_READY". Chung minh KHONG GI CA.
 *
 * Nen o day tach lam ba tang, va tang giua la thu duy nhat mang quyen:
 *
 *   principal (GitHub xac thuc)  --[so do cai dat]-->  vai duoc phep  --[MESSAGE_PRODUCERS]-->  loai
 *
 * So do cai dat (`PrincipalRegistry`) la CAU HINH cua tung ban trien khai — orchestrator (task sau)
 * dua vao qua `context`, giong moi bang chung khac (§13). Giao thuc V0 chi dinh nghia HINH DANG cua
 * no, cac BAT BIEN no phai thoa, va luat FAIL-CLOSED khi no thieu.
 *
 * Fail closed o moi buoc: khong principal = khong quyen; khong so do = khong quyen (KHONG PHAI
 * "ai cung duoc"); principal khong co trong so do = khong quyen.
 *
 * Tai lieu nguoi doc: docs/phat-trien/van-hanh/autopilot-protocol-v0.md §2.1
 */
import { ACTORS, MESSAGE_PRODUCERS, PRINCIPAL_KINDS, ROLE_CONFLICTS } from './constants.mjs';
import { REASONS, deny } from './reasons.mjs';

/**
 * @typedef {{ kind: 'APP' | 'USER', id: string }} Principal
 *   Danh tinh DA DUOC GITHUB XAC THUC. `APP` => `id` la app slug (`nexagent-autopilot`);
 *   `USER` => `id` la login. Khong bao gio la mot gia tri trong `ACTORS`.
 * @typedef {{ entries: ReadonlyArray<{ principal: Principal, roles: ReadonlyArray<string> }>, byKey: ReadonlyMap<string, ReadonlyArray<string>> }} PrincipalRegistry
 */

/** @type {ReadonlyArray<string>} */
const ROLE_VALUES = Object.freeze(Object.values(ACTORS));

/** Hau to GitHub gan vao login cua mot GitHub App khi no binh luan bang danh tinh app. */
const BOT_LOGIN_SUFFIX = '[bot]';

/**
 * Khoa tra cuu. Login/slug cua GitHub KHONG phan biet hoa thuong, nen `Nexagent-Autopilot` va
 * `nexagent-autopilot` phai la CUNG mot principal — neu khong, mot so do dung se im lang truot.
 * @param {Principal} principal
 */
const keyOf = (principal) => `${principal.kind}:${principal.id.toLowerCase()}`;

/** @param {unknown} value @returns {value is string} */
const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

/**
 * Mot principal hop le ve HINH DANG. Khong kiem no co quyen gi — do la viec cua so do.
 * @param {unknown} value
 * @returns {value is Principal}
 */
export function isPrincipal(value) {
  if (typeof value !== 'object' || value === null) return false;
  const { kind, id } = /** @type {Record<string, unknown>} */ (value);
  return (kind === PRINCIPAL_KINDS.APP || kind === PRINCIPAL_KINDS.USER) && isNonEmptyString(id);
}

/**
 * Dan xuat principal tu phan "ai gay ra" cua mot su kien GitHub (`comment`, `review`, `sender`...).
 * Ham THUAN TUY: khong goi mang, khong doan. Khong dan xuat duoc => `null` => cong dong.
 *
 * Ba duong, theo do tin cay giam dan:
 *   - `performed_via_github_app.slug` — GitHub noi thang comment nay do app nao phat;
 *   - login ket thuc bang `[bot]` — danh tinh app duoi dang login; CAT hau to de ve CUNG principal
 *     voi duong tren, neu khong thi `nexagent-autopilot[bot]` va `nexagent-autopilot` thanh hai
 *     principal khac nhau va so do dung van truot;
 *   - `user.login` thuong — mot con nguoi.
 *
 * @param {unknown} payload
 * @returns {Principal | null}
 */
export function principalFromGithubEvent(payload) {
  if (typeof payload !== 'object' || payload === null) return null;
  const event = /** @type {Record<string, any>} */ (payload);
  const slug = event.performed_via_github_app?.slug;
  if (isNonEmptyString(slug)) {
    return Object.freeze({ kind: PRINCIPAL_KINDS.APP, id: slug.trim() });
  }
  const login = event.user?.login ?? event.login ?? event.sender?.login;
  if (!isNonEmptyString(login)) return null;
  const trimmed = login.trim();
  if (trimmed.toLowerCase().endsWith(BOT_LOGIN_SUFFIX)) {
    const slugFromLogin = trimmed.slice(0, -BOT_LOGIN_SUFFIX.length);
    if (!isNonEmptyString(slugFromLogin)) return null;
    return Object.freeze({ kind: PRINCIPAL_KINDS.APP, id: slugFromLogin });
  }
  return Object.freeze({ kind: PRINCIPAL_KINDS.USER, id: trimmed });
}

/**
 * Bat bien PHAN LAP NHIEM VU: mot principal khong duoc vua LAM vua DUYET.
 *
 * Day KHONG phai cau hinh cua ban trien khai — do la ly do ton tai cua hai cong doc lap. Neu mot
 * principal giu ca `CLAUDE_BUILDER` lan `CHATGPT_REVIEWER` thi no tu duyet code cua chinh no, va
 * `REVIEW_PASS` khong con la bang chung gi. Nen so do vi pham bi tu choi LUC DINH NGHIA, khong
 * doi den luc co mot thong diep that di qua.
 *
 * Duoc phep chung principal (va la du kien): App giu `{BUILDER, FIXER, ORCHESTRATOR,
 * RUNTIME_VERIFIER}`; tai khoan chu repo giu `{ARCHITECT, REVIEWER, HUMAN}` — soan hop dong roi
 * review code KHONG phai tu duyet cong viec cua chinh minh.
 *
 * @param {ReadonlyArray<string>} roles
 * @returns {{ role: string, conflictsWith: string } | null}
 */
function findRoleConflict(roles) {
  for (const [role, forbidden] of Object.entries(ROLE_CONFLICTS)) {
    if (!roles.includes(role)) continue;
    const clash = forbidden.find((other) => roles.includes(other));
    if (clash !== undefined) return { role, conflictsWith: clash };
  }
  return null;
}

/**
 * Dinh nghia so do cai dat principal -> vai. Hong ve hinh dang hay vi pham phan lap nhiem vu thi
 * TU CHOI NGAY — mot so do sai la mot lo hong phan quyen, khong phai mot canh bao.
 *
 * @param {ReadonlyArray<{ kind?: string, id?: string, principal?: Principal, roles?: ReadonlyArray<string> }>} entries
 * @returns {{ ok: true, registry: PrincipalRegistry } | import('./reasons.mjs').Denied}
 */
export function definePrincipalRegistry(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return deny(REASONS.PRINCIPAL_REGISTRY_INVALID, { problem: 'EMPTY' });
  }
  const byKey = new Map();
  const normalized = [];
  for (const entry of entries) {
    const principal = entry?.principal ?? { kind: entry?.kind, id: entry?.id };
    if (!isPrincipal(principal)) {
      return deny(REASONS.PRINCIPAL_REGISTRY_INVALID, { problem: 'BAD_PRINCIPAL', entry });
    }
    const roles = entry?.roles;
    if (!Array.isArray(roles) || roles.length === 0) {
      return deny(REASONS.PRINCIPAL_REGISTRY_INVALID, {
        problem: 'NO_ROLES',
        principal: `${principal.kind}:${principal.id}`,
      });
    }
    const unknown = roles.find((role) => !ROLE_VALUES.includes(role));
    if (unknown !== undefined) {
      return deny(REASONS.PRINCIPAL_REGISTRY_INVALID, {
        problem: 'UNKNOWN_ROLE',
        role: unknown,
        allowed: ROLE_VALUES,
      });
    }
    const conflict = findRoleConflict(roles);
    if (conflict) {
      return deny(REASONS.PRINCIPAL_ROLE_CONFLICT, {
        principal: `${principal.kind}:${principal.id}`,
        ...conflict,
      });
    }
    const key = keyOf(principal);
    if (byKey.has(key)) {
      return deny(REASONS.PRINCIPAL_REGISTRY_INVALID, { problem: 'DUPLICATE_PRINCIPAL', key });
    }
    const frozenPrincipal = Object.freeze({ kind: principal.kind, id: principal.id });
    const frozenRoles = Object.freeze([...new Set(roles)]);
    byKey.set(key, frozenRoles);
    normalized.push(Object.freeze({ principal: frozenPrincipal, roles: frozenRoles }));
  }
  return {
    ok: true,
    registry: Object.freeze({ entries: Object.freeze(normalized), byKey }),
  };
}

/**
 * Vai ma mot principal duoc phep khang dinh. Khong co trong so do => mang rong (khong phai "tat ca").
 * @param {PrincipalRegistry | undefined | null} registry
 * @param {Principal} principal
 * @returns {ReadonlyArray<string>}
 */
export function rolesOf(registry, principal) {
  if (!registry?.byKey || !isPrincipal(principal)) return Object.freeze([]);
  return registry.byKey.get(keyOf(principal)) ?? Object.freeze([]);
}

/**
 * CONG PHAN QUYEN cua giao thuc: principal da xac thuc nay co duoc phat loai thong diep nay khong?
 *
 * Sau duong tu choi, sau ma rieng — khong duong nao gop, va khong duong nao "coi nhu qua":
 *
 *   PRINCIPAL_UNKNOWN               khong co / hong hinh dang danh tinh da xac thuc
 *   ACTOR_WITHOUT_PRINCIPAL         chi co ten vai tho, khong co provenance dung sau no
 *   PRINCIPAL_REGISTRY_MISSING      khong co so do cai dat  (thieu so do != ai cung duoc)
 *   PRODUCER_UNKNOWN                biet AI, nhung principal nay khong giu vai nao
 *   UNKNOWN_ROLE                    vai duoc khang dinh khong ton tai trong giao thuc
 *   ROLE_NOT_AUTHORIZED_FOR_PRINCIPAL  vai co that, nhung principal nay khong duoc giu no
 *   WRONG_PRODUCER                  principal co vai, nhung khong vai nao phat duoc loai nay
 *
 * `assertedRole` la TUY CHON va chi de THU HEP: mot principal giu nhieu vai (App giu ca BUILDER lan
 * ORCHESTRATOR) co the noi ro no dang dong vai nao. No khong bao gio MO RONG quyen — van phai nam
 * trong so do. Khong khang dinh thi vai hieu luc duoc lay tu giao cua (vai cua principal) va
 * (nguoi phat hop le cua loai) — mot phep giao THAT, khong phai suy tu loai thong diep.
 *
 * @param {{ principal?: unknown, registry?: PrincipalRegistry | null, type: string, assertedRole?: unknown, actor?: unknown }} input
 * @returns {{ ok: true, role: string | null, roles: ReadonlyArray<string>, principal: Principal } | import('./reasons.mjs').Denied}
 */
export function authorizeProducer({ principal, registry, type, assertedRole, actor }) {
  const allowed = MESSAGE_PRODUCERS[type];
  if (allowed === undefined) return deny(REASONS.UNKNOWN_MESSAGE_TYPE, { type });
  if (!isPrincipal(principal)) {
    // Ban truoc nhan `context.actor` = mot chuoi vai. Mot orchestrator viet theo hinh dang cu se
    // gui ten vai ma khong co provenance — chinh la duong tautology o dau tep. Cho no MOT MA RIENG
    // de nguoi hien thuc doc ra ngay minh thieu gi, thay vi mot "khong biet ai phat" chung chung.
    const legacy = assertedRole ?? actor;
    if (isNonEmptyString(legacy)) {
      return deny(REASONS.ACTOR_WITHOUT_PRINCIPAL, { role: legacy, type });
    }
    return deny(REASONS.PRINCIPAL_UNKNOWN, { type, allowedRoles: allowed });
  }
  if (!registry?.byKey || registry.byKey.size === 0) {
    return deny(REASONS.PRINCIPAL_REGISTRY_MISSING, {
      principal: `${principal.kind}:${principal.id}`,
      type,
    });
  }
  const roles = rolesOf(registry, principal);
  if (roles.length === 0) {
    return deny(REASONS.PRODUCER_UNKNOWN, {
      principal: `${principal.kind}:${principal.id}`,
      type,
      allowedRoles: allowed,
    });
  }
  const claim = assertedRole ?? actor;
  if (claim !== undefined && claim !== null) {
    if (!isNonEmptyString(claim) || !ROLE_VALUES.includes(claim)) {
      return deny(REASONS.UNKNOWN_ROLE, { role: claim, allowed: ROLE_VALUES });
    }
    if (!roles.includes(claim)) {
      return deny(REASONS.ROLE_NOT_AUTHORIZED_FOR_PRINCIPAL, {
        principal: `${principal.kind}:${principal.id}`,
        role: claim,
        granted: roles,
      });
    }
  }
  const candidates = (isNonEmptyString(claim) ? [claim] : roles).filter((role) =>
    allowed.includes(role),
  );
  if (candidates.length === 0) {
    return deny(REASONS.WRONG_PRODUCER, {
      principal: `${principal.kind}:${principal.id}`,
      type,
      granted: roles,
      allowed,
    });
  }
  return {
    ok: true,
    // Vai hieu luc chi xac dinh khi giao con DUNG MOT phan tu. Nhieu phan tu van la HOP LE (App
    // duoc phat BUILD_READY du no giu ca BUILDER lan FIXER) — chi la khong ghi duoc vai nao, nen
    // ghi `null` thay vi chon bua mot cai roi bia ra mot provenance khong dung.
    role: candidates.length === 1 ? candidates[0] : null,
    roles: Object.freeze([...candidates]),
    principal: Object.freeze({ kind: principal.kind, id: principal.id }),
  };
}
