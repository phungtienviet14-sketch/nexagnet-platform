import { z } from 'zod';
import { USER_ROLES } from './auth.types.js';

const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9._-]*$/i, 'Tên đăng nhập chỉ gồm chữ, số, dấu chấm, gạch nối');

const passwordSchema = z.string().min(12).max(128);

export const loginSchema = z
  .object({ username: usernameSchema, password: z.string().min(1).max(128) })
  .strict();

export const createUserSchema = z
  .object({
    username: usernameSchema,
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().email().max(254).nullable().optional(),
    phone: z.string().trim().min(8).max(24).nullable().optional(),
    password: passwordSchema,
    role: z.enum(USER_ROLES),
  })
  .strict();

export const resetPasswordSchema = z.object({ password: passwordSchema }).strict();

export const changePasswordSchema = z
  .object({ currentPassword: z.string().min(1).max(128), newPassword: passwordSchema })
  .strict()
  .refine((value) => value.currentPassword !== value.newPassword, {
    path: ['newPassword'],
    message: 'Mật khẩu mới phải khác mật khẩu hiện tại',
  });

export const assignRoleSchema = z.object({ role: z.enum(USER_ROLES) }).strict();

export const disableUserSchema = z.object({ confirmed: z.literal(true) }).strict();

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type AssignRoleInput = z.infer<typeof assignRoleSchema>;
