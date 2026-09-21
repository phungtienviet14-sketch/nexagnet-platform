import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { actorLabel } from '../customer-view';

/**
 * `#334` (UAT BUG-04) — man "Ket thuc don" in TEN nguoi quyet, khong in ma tai khoan tho.
 *
 * Hai dieu, doc tu CHINH ma nguon (cung khuon `field-contract.spec.ts`):
 *
 *   1. ban sao `OrderCompletionActorKind` o web khop `ACCEPTANCE_ACTOR_KINDS` cua may chu;
 *   2. `OrderCompletionView.tsx` khong DOC mot truong ma tho nao (`decidedBy`, `latestDecidedBy`).
 *      Man hinh khong can chung de lam gi ca — moi lan no doc chung la mot lan chung co the bi in.
 *
 * Bai trinh duyet `e2e/transport/order-completion-actor.spec.ts` do dieu thu ba: tren trang that,
 * khong o nao in ra mot ma co hinh dang cuid.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const API_TYPES = resolve(HERE, '../../../../api/src/transport/acceptance/acceptance.types.ts');
const API_ACTOR = resolve(HERE, '../../../../api/src/transport/acceptance/acceptance-actor.ts');
const WEB_TYPES = resolve(HERE, '../transport-types.ts');
const VIEW = resolve(HERE, '../views/OrderCompletionView.tsx');

/** Moi chuoi trong dau nhay don. */
const quotedIn = (block: string): readonly string[] =>
  block.split("'").filter((_, index) => index % 2 === 1);

const arrayLiterals = (source: string, name: string): readonly string[] => {
  const declared = source.indexOf(`${name} = [`);
  if (declared < 0) throw new Error(`Khong tim thay mang ${name}`);
  const start = source.indexOf('[', declared);
  const end = source.indexOf(']', start);
  return quotedIn(source.slice(start, end));
};

const unionMembers = (source: string, name: string): readonly string[] => {
  const start = source.indexOf(`export type ${name} =`);
  if (start < 0) throw new Error(`Khong tim thay union ${name} o web`);
  return quotedIn(source.slice(start, source.indexOf(';', start)));
};

const constantLiteral = (source: string, name: string): string => {
  const start = source.indexOf(`export const ${name} =`);
  if (start < 0) throw new Error(`Khong tim thay hang ${name}`);
  const [value] = quotedIn(source.slice(start, source.indexOf(';', start)));
  if (value === undefined) throw new Error(`Hang ${name} khong phai chuoi`);
  return value;
};

describe('nguoi quyet tren man ket thuc don — #334', () => {
  it('ban sao loai danh tinh khop may chu', () => {
    const api = arrayLiterals(readFileSync(API_TYPES, 'utf8'), 'ACCEPTANCE_ACTOR_KINDS');
    const web = unionMembers(readFileSync(WEB_TYPES, 'utf8'), 'OrderCompletionActorKind');

    // Neo nguoc: hai phep rut rong van `toEqual` nhau — bai do phai thay duoc gi do.
    expect(api).toContain('UNRESOLVED');
    expect([...web].sort()).toEqual([...api].sort());
  });

  it('man hinh KHONG doc truong ma tai khoan tho nao', () => {
    const view = readFileSync(VIEW, 'utf8');

    // Neo nguoc: view that su doc nhan — neu khong, bai duoi xanh chi vi view da doi ten file.
    expect(view).toContain('decidedByActor.label');
    expect(view).toContain('latestDecidedByActor.label');
    expect(view).not.toMatch(/\.(?:decidedBy|latestDecidedBy)\b/);
  });

  it('du lieu mau mang CUNG mot chu o may chu va o cac man web khac', () => {
    const seedId = constantLiteral(readFileSync(API_ACTOR, 'utf8'), 'SEED_DATA_ACTOR_ID');
    const seedLabel = constantLiteral(readFileSync(API_ACTOR, 'utf8'), 'SEED_DATA_ACTOR_LABEL');
    expect(actorLabel(seedId)).toBe(seedLabel);
  });
});
