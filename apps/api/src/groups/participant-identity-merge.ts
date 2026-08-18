import type { GroupParticipant } from '@netviet/shared';

/**
 * Gop DANH TINH thanh vien Zalo khi mot nguoi bi tach thanh hai hang.
 *
 * Vi sao cai nay ton tai: Zalo cho moi thanh vien HAI dinh danh — `externalUserId` (routing UID,
 * doi theo tai khoan zca dang doc) va `globalId` (on dinh). Bang co unique rieng cho tung cot, nen
 * cung mot nguoi co the nam o hai hang: mot hang do `synchronize` tao (co `globalId`), mot hang do
 * `recordSeen` tao tu luong tin (chi co routing UID, `globalId = null`).
 *
 * Ban dau code chi cho gop khi hang route con NGUYEN mac dinh (`source=message_stream` + ca ba
 * truong phan loai chua ai dung), con lai thi nem loi. Nhung tab "Thanh vien" ton tai chinh de Sale
 * phan loai nhung hang do, ma thao tac phan loai ghi `source='manual'` — tuc phan loai xong mot
 * nguoi la khoa luon hang do khoi dien duoc gop, va lan dong bo ke tiep hong vinh vien. Cang dung
 * dung tinh nang cang chac chan hong.
 *
 * Nay gop that: giu hang co `globalId` lam hang song, HUT phan loai tu hang kia sang. Bat bien la
 * KHONG BAO GIO lam mat cong phan loai cua nguoi van hanh.
 */

/** Gia tri mac dinh cua ba truong phan loai — "chua ai dung toi". */
const UNSET_CUSTOMER_RANK: GroupParticipant['customerRank'] = 'unknown';
const UNSET_OPERATIONAL_ROLE: GroupParticipant['operationalRole'] = 'unknown';
const UNSET_HANDLING_MODE: GroupParticipant['handlingMode'] = 'inherit_group';

/** Do "manh" cua nguon: phan loai tay thang tat ca, luong tin yeu nhat. Khong bao gio ha cap. */
const SOURCE_RANK: Record<GroupParticipant['source'], number> = {
  manual: 3,
  zca_sync: 2,
  message_stream: 1,
};

export interface ParticipantClassification {
  customerRank: GroupParticipant['customerRank'];
  operationalRole: GroupParticipant['operationalRole'];
  handlingMode: GroupParticipant['handlingMode'];
  source: GroupParticipant['source'];
}

/**
 * Xung dot THAT: mot routing UID dang thuoc ve mot `globalId` KHAC. Khong phai hai hang cua cung
 * mot nguoi, nen gop la gan nham nguoi — phai de nguoi van hanh quyet dinh.
 *
 * Mang theo du dinh danh de thong bao noi duoc "thanh vien nao", thay vi bat nguoi van hanh doan.
 */
export class GroupParticipantIdentityConflictError extends Error {
  constructor(
    readonly detail: {
      displayName: string;
      externalUserId: string;
      incomingGlobalId: string;
      conflictingGlobalId: string;
      conflictingParticipantId: string;
      stableParticipantId?: string;
    },
  ) {
    super(
      `Routing UID ${detail.externalUserId} dang thuoc ve mot thanh vien khac: ` +
        `Zalo bao globalId ${detail.incomingGlobalId} cho "${detail.displayName}", ` +
        `nhung hang ${detail.conflictingParticipantId} dang giu globalId ${detail.conflictingGlobalId}. ` +
        `Mo /settings > Thanh vien, xoa hoac sua mot trong hai hang roi dong bo lai.`,
    );
    this.name = 'GroupParticipantIdentityConflictError';
  }
}

/**
 * Hai hang cua CUNG mot nguoi -> mot bo phan loai duy nhat.
 *
 * Lay tung truong tu hang nao DA duoc dung toi; hang song (`stable`) thang khi ca hai deu da dat.
 * `source` lay muc CAO hon de khong ha cap — gop xong van phai la `manual` neu mot trong hai la
 * `manual`, neu khong lan dong bo sau lai coi hang do la rac va xoa mat phan loai.
 */
export function mergeClassification(
  stable: ParticipantClassification,
  absorbed: ParticipantClassification,
): ParticipantClassification {
  return {
    customerRank:
      stable.customerRank !== UNSET_CUSTOMER_RANK ? stable.customerRank : absorbed.customerRank,
    operationalRole:
      stable.operationalRole !== UNSET_OPERATIONAL_ROLE
        ? stable.operationalRole
        : absorbed.operationalRole,
    handlingMode:
      stable.handlingMode !== UNSET_HANDLING_MODE ? stable.handlingMode : absorbed.handlingMode,
    source:
      SOURCE_RANK[absorbed.source] > SOURCE_RANK[stable.source] ? absorbed.source : stable.source,
  };
}

/**
 * Bo `globalId` khi Zalo tra CUNG mot gia tri cho nhieu NGUOI khac nhau.
 *
 * Quan sat tren pilot 18/08/2026: hai nguoi khac nhau o hai nhom khac nhau — "Phung Viet"
 * (uid 6393514232638846563) va "Hieu" (uid 5502489242612647045) — deu mang
 * `globalId = GS9MS5FE2V7D9R7EMDKJU3KDQMTOJEO0`. Kieu cua zca-js khai `globalId: string` cho tung
 * ho so, nhung du lieu that cho thay Zalo KHONG bao dam gia tri nay duy nhat theo nguoi (nghi can:
 * thanh vien khong phai ban be thi tra ve mot gia tri dung chung).
 *
 * Mot gia tri trung nhau giua hai nguoi thi khong con la dinh danh, va giu lai la tu ban vao chan:
 *
 *   1. Bang co `@@unique([groupId, globalId])` -> ca nhom chi nhet duoc DUNG MOT hang.
 *   2. `synchronize` tim hang theo `globalId` TRUOC routing UID, nen thanh vien thu hai tim thay
 *      hang cua thanh vien thu nhat va GHI DE len no. Dong bo 5 nguoi -> con dung 1 hang, trong
 *      khi bao cao van noi "5" vi `upsertedCount` dem theo input.
 *
 * Nen: `globalId` nao ung voi >1 routing UID trong cung snapshot thi BO khoi tat ca thanh vien
 * mang no, quay ve dinh danh bang routing UID. Doi lai la mat kha nang giu phan loai khi UID doi
 * theo tai khoan zca — nhung mot `globalId` dung chung von khong mang thong tin gi de ma giu.
 *
 * Dem theo UID PHAN BIET chu khong theo so lan xuat hien: cung mot nguoi lot vao snapshot hai lan
 * la trung lap vo hai, khong phai xung dot danh tinh.
 */
export function dropAmbiguousGlobalIds<T extends { externalUserId: string; globalId?: string }>(
  members: readonly T[],
): { members: T[]; ambiguousGlobalIds: string[] } {
  const uidsByGlobalId = new Map<string, Set<string>>();
  for (const member of members) {
    if (!member.globalId) continue;
    const bucket = uidsByGlobalId.get(member.globalId) ?? new Set<string>();
    bucket.add(member.externalUserId);
    uidsByGlobalId.set(member.globalId, bucket);
  }
  const ambiguous = new Set(
    [...uidsByGlobalId].filter(([, uids]) => uids.size > 1).map(([globalId]) => globalId),
  );
  if (ambiguous.size === 0) return { members: [...members], ambiguousGlobalIds: [] };
  return {
    members: members.map((member) => {
      if (!member.globalId || !ambiguous.has(member.globalId)) return member;
      const { globalId: _ambiguous, ...rest } = member;
      return rest as unknown as T;
    }),
    ambiguousGlobalIds: [...ambiguous],
  };
}
