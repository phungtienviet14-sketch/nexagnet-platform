import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { writeEvalReport } from './eval-report.js';

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('writeEvalReport', () => {
  it('creates a tenant-mounted report and leaves no partial file', () => {
    const directory = mkdtempSync(join(tmpdir(), 'netviet-golden-'));
    directories.push(directory);
    const path = join(directory, 'nested', 'report.json');

    writeEvalReport(path, '{"goLiveReady":false}');

    expect(readFileSync(path, 'utf8')).toBe('{"goLiveReady":false}\n');
    expect(() => readFileSync(`${path}.tmp`, 'utf8')).toThrow();
  });
});
