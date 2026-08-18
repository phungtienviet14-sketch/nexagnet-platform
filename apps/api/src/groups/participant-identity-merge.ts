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
