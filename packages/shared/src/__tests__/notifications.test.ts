import { describe, expect, it } from 'vitest';
import { zaloNotificationConfigSchema } from '../notifications.js';

describe('zaloNotificationConfigSchema defaults', () => {
  it('is disabled and has no implicit recipients', () => {
    expect(zaloNotificationConfigSchema.parse({})).toEqual({
      enabled: false,
      targetMemberNames: [],
      targetMemberIds: [],
      targetGroupIds: [],
    });
  });

  it('preserves explicitly configured recipients', () => {
    expect(
      zaloNotificationConfigSchema.parse({
        enabled: true,
        targetMemberNames: ['Runtime Operator'],
        targetMemberIds: ['member-1'],
        targetGroupIds: ['group-1'],
      }),
    ).toEqual({
      enabled: true,
      targetMemberNames: ['Runtime Operator'],
      targetMemberIds: ['member-1'],
      targetGroupIds: ['group-1'],
    });
  });
});
