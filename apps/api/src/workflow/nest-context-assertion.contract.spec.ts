import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * HOP DONG: KHONG BAO GIO DUA MOT CONTEXT NEST VAO MOT KHANG DINH.
 *
 * ---------------------------------------------------------------------------
 * SU CO THAT (23/08/2026) — va ly do file nay ton tai:
 *
 * Khi noi cong tac `WORKFLOW_ENGINE` vao `workflow.module.ts`, bai `workflow-di-matrix.spec.ts`
 * khong do mot khang dinh sai — no lam CHET TIEN TRINH:
 *
 *     FATAL ERROR: Ineffective mark-compacts near heap limit — 4 GB, ~2,5 phut
 *
 * Chan doan ban dau la "hong moi truong" hoac "vong import". Ca hai deu SAI. Nguyen nhan that:
 *
 *     await expect(boot()).rejects.toThrow(/WORKFLOW_ENGINE_TOKEN_MISSING/);
 *
 * Cong tac mac dinh `off` lam boot KHONG con nem nua (dung nhu thiet ke). Khi promise RESOLVE,
 * vitest dung mot `AssertionError` mang `showDiff: true` va `actual` = chinh
 * `NestApplicationContext` vua boot — doi tuong giu `container`: moi module, moi provider, ca do
 * thi DI, PrismaClient, SDK Hatchet. Vitest tuan tu hoa `actual` de ve diff va gui qua IPC ve
 * tien trinh bao cao, roi di bo qua mot do thi khong lo va co chu trinh cho den khi het heap.
 *
 * DO DUOC, va con so nay la ca bai hoc:
 *
 *     err.message  =  71 ky tu                              <- doc thi tuong vo hai
 *     err.actual   =  NestApplicationContext, co `container` <- ca 4 GB nam o day
 *
 * Nen mot khang dinh SAI (dang le mot dong doc trong mot giay) hien ra thanh mot cu OOM ba phut
 * khong doc duoc — va nguoi doc se di do moi truong thay vi doc khang dinh. Cai gia that khong
 * phai bo nho; la thoi gian chan doan bi danh lac huong.
 *
 * ---------------------------------------------------------------------------
 * LUAT: mot bai muon khang dinh "boot phai nem" thi phai THU GON ket cuc truoc — bat loi, lay
 * `message`, roi khang dinh tren CHUOI. Khuon tham chieu: `bootOutcome()` trong
 * `workflow-di-matrix.spec.ts`.
 *
 * KHONG sua bang cach tang heap: tang heap chi doi ba phut thanh sau phut.
 */

const SPEC_DIR = dirname(fileURLToPath(import.meta.url));

/**
 * Mien tru phai KEM LY DO — cung quy uoc voi `secrets-passthrough.contract.test.mjs`. Mot danh
 * sach mien tru khong loi giai se bien thanh cho de rac trong ba thang.
 */
const EXEMPT: Readonly<Record<string, string>> = {
  'nest-context-assertion.contract.spec.ts':
    'Chinh file nay. No PHAI chua khuon nguy hiem duoi dang chuoi de bai CHONG XANH GIA co cai ' +
    'ma do. Khong mien tru thi bo quet se to cao chinh bang chung cua no.',
};

interface Offence {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

/**
 * Mot dong BINH LUAN nhac lai khuon nguy hiem la thu ta MUON co — ca hai file duoi day deu giai
 * thich cai bay bang chinh no. Bo quet chi soi MA CHAY.
 */
const isComment = (text: string): boolean => /^\s*(\/\/|\/?\*)/.test(text);

const looksDangerous = (text: string): boolean =>
  !isComment(text) &&
  text.includes('.rejects') &&
  /expect\(\s*[A-Za-z_$]*[Bb]oot[\w$]*\s*\(/.test(text);

/**
 * Tim `expect(<ham co chu 'boot'>(...)).rejects` — khuon duy nhat da gay ra su co.
 *
 * GIOI HAN da biet, ghi ro thay vi de nguoi doc tu phat hien: bo quet doc TUNG DONG, nen mot
 * lenh trai dai nhieu dong se lot. No la mot cai chan, khong phai mot bo phan tich cu phap — va
 * mot cai chan bat dung khuon da no mot lan van dang gia hon khong co gi.
 */
function scan(): readonly Offence[] {
  const offences: Offence[] = [];
  for (const file of readdirSync(SPEC_DIR).filter((name) => name.endsWith('.spec.ts'))) {
    if (file in EXEMPT) continue;
    const lines = readFileSync(join(SPEC_DIR, file), 'utf8').split(/\r?\n/);
    lines.forEach((text, index) => {
      if (looksDangerous(text)) offences.push({ file, line: index + 1, text: text.trim() });
    });
  }
  return offences;
}

describe('hop dong: khang dinh khong duoc om mot context Nest', () => {
  it('khong spec workflow nao dua thang mot ham boot vao `.rejects`', () => {
    const offences = scan();

    // Thong bao phai NOI RA phai sua the nao. Mot cau "vi pham hop dong" khong giup ai luc 2 gio
    // sang; mot cau chi ra khuon thay the thi sua duoc trong mot phut.
    expect(
      offences.map((o) => `${o.file}:${o.line}  ${o.text}`),
      'Dung `expect(boot()).rejects` — khi boot KHONG nem, vitest tuan tu hoa ca do thi DI lam ' +
        '`actual` va lam het heap (~4 GB). Thu gon ket cuc truoc: bat loi, lay `message`, roi ' +
        'khang dinh tren chuoi. Xem `bootOutcome()` trong `workflow-di-matrix.spec.ts`.',
    ).toEqual([]);
  });

  it('CHONG XANH GIA: bo quet that su nhin thay khuon nguy hiem khi no xuat hien', () => {
    // Neu regex o tren hong, bai tren se "xanh" ma khong do gi. Bai nay do chinh bo quet.
    expect(
      looksDangerous('    await expect(bootWorker()).rejects.toThrow(/WORKFLOW_WORKER_VERSION/);'),
    ).toBe(true);
    expect(looksDangerous('    const outcome = await bootOutcome();')).toBe(false);
    expect(looksDangerous('    await expect(handoff()).rejects.toThrow(/X/);')).toBe(false);
    // Va bo quet phai BO QUA binh luan — neu khong, moi loi giai thich cai bay lai bi to cao la
    // cai bay, va nguoi ta se sua bang cach XOA loi giai thich.
    expect(looksDangerous(' *     await expect(boot()).rejects.toThrow(/RE/);')).toBe(false);
    expect(looksDangerous('    // khong dung `expect(bootWorker()).rejects` o day')).toBe(false);
  });

  it('ly do cua vitest van dung: khang dinh `.rejects` that bai mang theo gia tri da resolve lam `actual`', async () => {
    // Day la CO CHE, do truc tiep chu khong phai nho lai. Neu mot ban vitest sau nay thoi dinh
    // kem `actual`, bai nay se do — va luc do hop dong o tren co the noi long, nhung phai la mot
    // quyet dinh duoc noi ra dua tren mot phep do, khong phai mot phong doan.
    const sentinel = { toi: 'la gia tri da resolve' };
    let captured: Record<string, unknown> | undefined;

    try {
      await expect(Promise.resolve(sentinel)).rejects.toThrow(/khong-bao-gio-khop/);
    } catch (error) {
      captured = error as Record<string, unknown>;
    }

    expect(captured).toBeDefined();
    // `actual` la CHINH doi tuong da resolve — khong phai ban sao, khong phai tom tat. Doi tuong
    // do, trong su co that, la ca mot ung dung Nest.
    expect(captured?.actual).toBe(sentinel);
    expect(captured?.showDiff).toBe(true);
    // Va `message` thi ngan — day la ly do su co nay danh lua duoc nguoi chan doan.
    expect(String(captured?.message).length).toBeLessThan(200);
  });
});
