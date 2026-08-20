import { z } from 'zod';

export const leadPayloadSchema = z
  .object({
    leadId: z.string().trim().min(1).max(128).optional(),
    fullName: z.string().trim().min(1).max(120),
    phone: z.string().trim().min(6).max(30),
    email: z.string().trim().email().max(150),
    company: z.string().trim().min(1).max(200),
    workflow: z.string().trim().min(1).max(100),
    note: z.string().trim().max(1000).optional().default(''),
    source: z.string().trim().max(100).optional().default('nexagnet247.com/demo'),
    createdAt: z.string().optional(),
  })
  .strict();

export type LeadPayload = z.infer<typeof leadPayloadSchema>;

export const emailNotificationConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    host: z.string().trim().max(255).default(''),
    port: z.number().int().min(1).max(65535).default(587),
    secure: z.boolean().default(false),
    user: z.string().trim().max(255).default(''),
    pass: z.string().trim().max(255).default(''),
    from: z.string().trim().max(255).default(''),
    recipients: z.array(z.string().trim().email().max(150)).max(20).default([]),
  })
  .strict();

export type EmailNotificationConfig = z.infer<typeof emailNotificationConfigSchema>;

export const zaloNotificationConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    targetMemberNames: z
      .array(z.string().trim().min(1).max(100))
      .max(10)
      .default([]),
    targetMemberIds: z.array(z.string().trim().min(1).max(128)).max(10).default([]),
    targetGroupIds: z.array(z.string().trim().min(1).max(128)).max(10).default([]),
  })
  .strict();

export type ZaloNotificationConfig = z.infer<typeof zaloNotificationConfigSchema>;

export const notificationSettingsSchema = z
  .object({
    email: emailNotificationConfigSchema,
    zalo: zaloNotificationConfigSchema,
  })
  .strict();

export type NotificationSettings = z.infer<typeof notificationSettingsSchema>;

export const leadDispatchResultSchema = z
  .object({
    leadId: z.string(),
    zalo: z.object({
      success: z.boolean(),
      message: z.string().optional(),
      recipientsSent: z.array(z.string()).optional(),
    }),
    email: z.object({
      success: z.boolean(),
      message: z.string().optional(),
      recipientsSent: z.array(z.string()).optional(),
    }),
    dispatchedAt: z.string(),
  })
  .strict();

export type LeadDispatchResult = z.infer<typeof leadDispatchResultSchema>;

export const testEmailPayloadSchema = z
  .object({
    to: z.string().trim().email().max(150).optional(),
    config: emailNotificationConfigSchema.optional(),
  })
  .strict();

export type TestEmailPayload = z.infer<typeof testEmailPayloadSchema>;

export const testZaloPayloadSchema = z
  .object({
    targetNames: z.array(z.string().trim().min(1).max(100)).max(10).optional(),
    targetMemberIds: z.array(z.string().trim().min(1).max(128)).max(10).optional(),
    targetGroupId: z.string().trim().min(1).max(128).optional(),
  })
  .strict();

export type TestZaloPayload = z.infer<typeof testZaloPayloadSchema>;
