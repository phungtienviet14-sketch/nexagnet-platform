export const USER_ROLES = ['SALE', 'MANAGER', 'ACCOUNTING', 'ADMIN'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export interface SessionIdentity {
  userId: string;
  credentialVersion: number;
}

export interface AuthenticatedUser {
  id: string;
  username: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: UserRole;
  credentialVersion: number;
  disabledAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
  passwordChangedAt: string | null;
}
