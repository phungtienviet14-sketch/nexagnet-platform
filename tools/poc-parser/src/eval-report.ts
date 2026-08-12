import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export function writeEvalReport(path: string, serialized: string): void {
  const target = resolve(path);
  const temporary = `${target}.tmp`;
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(temporary, `${serialized}\n`, { encoding: 'utf8', mode: 0o600 });
  renameSync(temporary, target);
}
