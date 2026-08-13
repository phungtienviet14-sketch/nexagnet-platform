import process from 'node:process';
// This deploy tool lives outside a pnpm workspace package. Resolve through apps/api, which owns
// both dependencies, instead of relying on a forbidden root-hoist that differs by pnpm layout.
import { PrismaClient } from '../../apps/api/node_modules/@prisma/client/default.js';
import { argon2id, hash } from '../../apps/api/node_modules/argon2/argon2.cjs';

const username = required('PILOT_OPERATOR_USERNAME');
const name = required('PILOT_OPERATOR_NAME');
const password = required('PILOT_OPERATOR_PASSWORD');
if (!/^[a-z0-9][a-z0-9._-]{2,63}$/i.test(username)) {
  throw new Error('PILOT_OPERATOR_USERNAME khong hop le.');
}
if (password.length < 12 || password.length > 128) {
  throw new Error('PILOT_OPERATOR_PASSWORD phai dai 12-128 ky tu.');
}

const prisma = new PrismaClient();
try {
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    if (existing.role !== 'ADMIN' || existing.disabledAt) {
      throw new Error(`Operator ${username} ton tai nhung khong phai ADMIN dang hoat dong.`);
    }
    // Deliberately never reset a credential during deploy. Password rotation is a separate,
    // audited operator action; silently replacing it here would invalidate active sessions.
    process.stdout.write(`Da co operator ${username}; giu nguyen credential.\n`);
  } else {
    await prisma.user.create({
      data: {
        username,
        name,
        passwordHash: await hash(password, { type: argon2id }),
        role: 'ADMIN',
        passwordChangedAt: new Date(),
      },
    });
    process.stdout.write(`Da tao operator ${username}; password khong duoc ghi log.\n`);
  }
} finally {
  await prisma.$disconnect();
}

function required(key) {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`Thieu ${key}.`);
  return value;
}
