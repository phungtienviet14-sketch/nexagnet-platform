import { z } from 'zod';

export const CUSTOMER_RANKS = ['dai_ly', 'ctv', 'khach_le', 'unknown'] as const;
export const OPERATIONAL_ROLES = [
  'khach_hang',
  'sale',
  'ke_toan',
  'quan_ly',
  'ksnb',
  'bpvh',
  'ky_thuat',
  'unknown',
] as const;
export const HANDLING_MODES = ['inherit_group', 'process', 'ignore', 'manual_review'] as const;
/**
 * `message_stream` = hoc duoc tu chinh luong tin (ca zca lan Bot Platform deu kem uid + ten
 * nguoi gui o MOI tin). Can thiet vi `getGroupInfo` cua Zalo tra danh sach thanh vien RONG voi
 * tai khoan that (04/08/2026), ma Bot Platform thi khong co API thanh vien nao ca.
 */
export const PARTICIPANT_SOURCES = ['zca_sync', 'manual', 'message_stream'] as const;

export const customerRankSchema = z.enum(CUSTOMER_RANKS);
export const operationalRoleSchema = z.enum(OPERATIONAL_ROLES);
export const handlingModeSchema = z.enum(HANDLING_MODES);
export const participantSourceSchema = z.enum(PARTICIPANT_SOURCES);

const participantIdSchema = z.string().trim().min(1).max(128);
const optionalProfileTextSchema = z.string().trim().min(1).max(500).optional();
const isoTimestampSchema = z.string().datetime({ offset: true });

export const groupParticipantProfileSchema = z
  .object({
    externalUserId: participantIdSchema,
    globalId: participantIdSchema.optional(),
    displayName: z.string().trim().min(1).max(500),
    zaloName: optionalProfileTextSchema,
    avatarUrl: z.url().max(2_048).optional(),
  })
  .strict();

export const groupParticipantSchema = z
  .object({
    id: participantIdSchema,
    groupId: participantIdSchema,
    externalUserId: participantIdSchema,
    globalId: participantIdSchema.optional(),
    displayName: z.string().trim().min(1).max(500),
    zaloName: optionalProfileTextSchema,
    avatarUrl: z.url().max(2_048).optional(),
    customerRank: customerRankSchema,
    operationalRole: operationalRoleSchema,
    handlingMode: handlingModeSchema,
    active: z.boolean(),
    source: participantSourceSchema,
    lastSeenAt: isoTimestampSchema,
    syncedAt: isoTimestampSchema,
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
  })
  .strict();

export const groupParticipantUpdateSchema = z
  .object({
    customerRank: customerRankSchema.optional(),
    operationalRole: operationalRoleSchema.optional(),
    handlingMode: handlingModeSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Can co it nhat mot thay doi phan loai thanh vien',
  });

export const groupParticipantsQuerySchema = z
  .object({
    search: z.string().trim().min(1).max(100).optional(),
    customerRank: customerRankSchema.optional(),
    operationalRole: operationalRoleSchema.optional(),
    handlingMode: handlingModeSchema.optional(),
    active: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
  })
  .strict();

export const groupParticipantSyncSnapshotSchema = z
  .object({
    groupId: participantIdSchema,
    complete: z.boolean(),
    expectedCount: z.number().int().nonnegative(),
    members: z.array(groupParticipantProfileSchema),
    failedMemberIds: z.array(participantIdSchema),
  })
  .strict()
  .superRefine((snapshot, context) => {
    const observedIds = [
      ...snapshot.members.map((member) => member.externalUserId),
      ...snapshot.failedMemberIds,
    ];
    if (new Set(observedIds).size !== observedIds.length) {
      context.addIssue({ code: 'custom', message: 'UID thanh vien bi trung trong snapshot' });
    }
    if (observedIds.length !== snapshot.expectedCount) {
      context.addIssue({ code: 'custom', message: 'Snapshot khong du so thanh vien du kien' });
    }
    if (snapshot.complete && snapshot.failedMemberIds.length > 0) {
      context.addIssue({ code: 'custom', message: 'Snapshot day du khong duoc co UID that bai' });
    }
  });

export interface GroupParticipantSyncResult {
  groupId: string;
  complete: boolean;
  expectedCount: number;
  fetchedCount: number;
  failedCount: number;
  upsertedCount: number;
  deactivatedCount: number;
  syncedAt: string;
}

export type CustomerRank = (typeof CUSTOMER_RANKS)[number];
export type OperationalRole = (typeof OPERATIONAL_ROLES)[number];
export type HandlingMode = (typeof HANDLING_MODES)[number];
export type ParticipantSource = (typeof PARTICIPANT_SOURCES)[number];
export type GroupParticipantProfile = z.infer<typeof groupParticipantProfileSchema>;
export type GroupParticipant = z.infer<typeof groupParticipantSchema>;
export type GroupParticipantUpdate = z.infer<typeof groupParticipantUpdateSchema>;
export type GroupParticipantsQuery = z.infer<typeof groupParticipantsQuerySchema>;
export type GroupParticipantSyncSnapshot = z.infer<typeof groupParticipantSyncSnapshotSchema>;
