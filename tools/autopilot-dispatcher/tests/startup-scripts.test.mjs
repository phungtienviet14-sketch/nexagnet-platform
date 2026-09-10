/**
 * Cong cu cai dat khoi dong cung — bang chung "khong ghi gi" trong pham vi task nay.
 *
 * Hai lop: mot lop TINH doc chinh script (chay o moi noi, ke ca CI Linux), va mot lop THAT chay
 * script bang PowerShell roi kiem khong co scheduled task nao xuat hien (chi chay khi may co
 * PowerShell). Lop tinh la lop bat buoc; lop that la bang chung bo sung.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { PACKAGE_ROOT, removeDir, tempDir } from './helpers.mjs';

/** @type {string | null | undefined} */
let cachedShell;

const SCRIPTS = ['install-startup.ps1', 'uninstall-startup.ps1'];
const read = (name) => fs.readFileSync(path.join(PACKAGE_ROOT, 'scripts', name), 'utf8');

/**
 * Bo chu thich va CHUOI cua PowerShell truoc khi quet lenh.
 *
 * Ban ke hoach dry-run IN RA chinh lenh go ("schtasks /delete ...") de nguoi van hanh copy duoc.
 * Mot bo quet ngay tho se doc dong chu do thanh "script chay lenh xoa truoc cong -Execute" — mot
 * bao dong gia lam hong dung bai test dang bao ve cai gi. Chuoi la DU LIEU; chi lenh tran moi la
 * lenh. Do dai duoc giu nguyen (thay bang dau cach) de chi so vi tri van so sanh duoc.
 * @param {string} text
 */
function stripPowerShellLiterals(text) {
  // `.` khong khop xuong dong, nen thay tung ky tu bang dau cach giu nguyen so dong VA do dai —
  // nho vay cac chi so vi tri ben duoi van so sanh duoc voi nhau.
  const blank = (match) => match.replace(/./g, ' ');
  return text
    .replace(/<#[^]*?#>/g, blank)
    .replace(/'[^']*'/g, blank)
    .replace(/"[^"]*"/g, blank)
    .replace(/#.*/g, blank);
}

/** Cac lenh THUC SU thay doi may. Moi lenh nay phai nam sau cong `-Execute`. */
const MUTATING_CMDLETS = [
  'Register-ScheduledTask',
  'Unregister-ScheduledTask',
  'New-ItemProperty',
  'Set-ItemProperty',
  'schtasks /create',
  'schtasks /delete',
  'New-Service',
];

test('both scripts declare -Execute as an opt-in switch that defaults to off', () => {
  for (const name of SCRIPTS) {
    const text = read(name);
    assert.match(text, /\[switch\]\$Execute/, `${name} has no -Execute switch`);
    assert.equal(/\$Execute\s*=\s*\$true/.test(text), false, `${name} defaults -Execute to true`);
    assert.match(text, /if\s*\(\s*-not\s+\$Execute\s*\)/, `${name} has no dry-run early exit`);
  }
});

test('every mutating command sits after the dry-run exit', () => {
  for (const name of SCRIPTS) {
    const text = stripPowerShellLiterals(read(name));
    const guardIndex = text.search(/if\s*\(\s*-not\s+\$Execute\s*\)/);
    assert.ok(guardIndex > 0, `${name} has no guard`);
    for (const cmdlet of MUTATING_CMDLETS) {
      const at = text.indexOf(cmdlet);
      if (at < 0) continue;
      assert.ok(at > guardIndex, `${name} runs ${cmdlet} before the dry-run guard`);
    }
  }
});

test('the dry-run branch exits before reaching any mutating command', () => {
  for (const name of SCRIPTS) {
    const text = stripPowerShellLiterals(read(name));
    const guardIndex = text.search(/if\s*\(\s*-not\s+\$Execute\s*\)/);
    const exitIndex = text.indexOf('exit 0', guardIndex);
    assert.ok(exitIndex > guardIndex, `${name} dry-run branch does not exit`);
    for (const cmdlet of MUTATING_CMDLETS) {
      const at = text.indexOf(cmdlet);
      if (at < 0) continue;
      assert.ok(at > exitIndex, `${name} could reach ${cmdlet} without -Execute`);
    }
  }
});

test('the install plan prints a rollback command and opens no network port', () => {
  const text = read('install-startup.ps1');
  assert.match(text, /rollback/i);
  assert.match(text, /schtasks \/delete/);
  assert.match(text, /outbound-only/i);
  for (const pattern of [/New-NetFirewallRule/, /netsh\s+.*firewall/i, /-Port\b/]) {
    assert.equal(pattern.test(text), false, `install script touches networking: ${pattern}`);
  }
});

test('neither script embeds a credential or reads one', () => {
  for (const name of SCRIPTS) {
    const text = read(name);
    for (const pattern of [
      /ghp_/,
      /github_pat_/,
      /sk-ant-/,
      /gh auth token/,
      /ConvertTo-SecureString/,
    ]) {
      assert.equal(pattern.test(text), false, `${name} matches ${pattern}`);
    }
  }
});

test('running the installer without -Execute registers nothing', { skip: skipReason() }, (t) => {
  const dir = tempDir('ps');
  t.after(() => removeDir(dir));
  const configPath = path.join(dir, 'dispatcher.config.json');
  fs.writeFileSync(configPath, '{}', 'utf8');
  const taskName = 'NexagentDispatcherDryRunProbe';

  assert.equal(scheduledTaskExists(taskName), false, 'probe task must not exist beforehand');

  const result = spawnSync(
    powerShellBin(),
    [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      path.join(PACKAGE_ROOT, 'scripts', 'install-startup.ps1'),
      '-ConfigPath',
      configPath,
      '-TaskName',
      taskName,
    ],
    { encoding: 'utf8', timeout: 120_000 },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /DRY-RUN/);
  assert.match(result.stdout, /nothing was registered/i);
  assert.equal(scheduledTaskExists(taskName), false, 'a scheduled task appeared during a dry run');
});

function powerShellBin() {
  if (cachedShell !== undefined) return cachedShell;
  cachedShell = null;
  for (const bin of ['pwsh', 'powershell']) {
    // Tren Windows, spawn mot bo boc `.cmd`/`.bat` ma khong co shell NEM EINVAL (siet lai sau
    // CVE-2024-27980) thay vi tra ve mot ma loi. Nen phai bat, khong the chi doc `status`.
    try {
      const probe = spawnSync(bin, ['-NoProfile', '-NonInteractive', '-Command', 'exit 0'], {
        timeout: 60_000,
      });
      if (probe.status === 0) {
        cachedShell = bin;
        break;
      }
    } catch {
      continue;
    }
  }
  return cachedShell;
}

/** Bo qua o moi noi khong co Task Scheduler (CI Linux): o do lop tinh o tren da du. */
function skipReason() {
  if (process.platform !== 'win32') return 'Windows Task Scheduler only';
  return powerShellBin() === null ? 'PowerShell not available' : false;
}

/** Hoi DUNG MOT ten task — nhanh, khong liet ke ca may. @param {string} name */
function scheduledTaskExists(name) {
  try {
    const probe = spawnSync('schtasks', ['/query', '/tn', name], {
      encoding: 'utf8',
      timeout: 60_000,
    });
    return probe.status === 0;
  } catch {
    return false;
  }
}
