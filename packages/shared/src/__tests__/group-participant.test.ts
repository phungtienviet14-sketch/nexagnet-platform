import { describe, expect, it } from 'vitest';
import {
  groupParticipantSchema,
  groupParticipantUpdateSchema,
  groupParticipantsQuerySchema,
} from '../group-participant.js';

const participant = {
  id: 'participant-1',
  groupId: 'group-1',
  externalUserId: 'user-1',
  displayName: 'Nguyen Van A',
  customerRank: 'unknown',
  operationalRole: 'unknown',
  handlingMode: 'inherit_group',
  active: true,
  source: 'zca_sync',
  lastSeenAt: '2026-08-03T01:00:00.000Z',
  syncedAt: '2026-08-03T01:00:00.000Z',
  createdAt: '2026-08-03T01:00:00.000Z',
  updatedAt: '2026-08-03T01:00:00.000Z',
} as const;

describe('GroupParticipant contracts', () => {
  it('accepts a participant with safe defaults and ISO timestamps', () => {
    expect(groupParticipantSchema.parse(participant)).toEqual(participant);
  });

  it('rejects unsupported rank, role, handling mode and unknown fields', () => {
    expect(groupParticipantSchema.safeParse({ ...participant, customerRank: 'vip' }).success).toBe(false);
    expect(groupParticipantSchema.safeParse({ ...participant, operationalRole: 'admin' }).success).toBe(false);
    expect(groupParticipantSchema.safeParse({ ...participant, handlingMode: 'auto_send' }).success).toBe(false);
    expect(groupParticipantSchema.safeParse({ ...participant, phone: '0900000000' }).success).toBe(false);
  });

  it('requires at least one classification change and rejects profile edits', () => {
    expect(groupParticipantUpdateSchema.safeParse({}).success).toBe(false);
    expect(groupParticipantUpdateSchema.safeParse({ customerRank: 'ctv' }).success).toBe(true);
    expect(groupParticipantUpdateSchema.safeParse({ displayName: 'Gia mao' }).success).toBe(false);
  });

  it('coerces the active query without accepting arbitrary boolean text', () => {
    expect(groupParticipantsQuerySchema.parse({ active: 'false' })).toMatchObject({ active: false });
    expect(groupParticipantsQuerySchema.safeParse({ active: 'yes' }).success).toBe(false);
    expect(groupParticipantsQuerySchema.safeParse({ extra: 'value' }).success).toBe(false);
  });
});
