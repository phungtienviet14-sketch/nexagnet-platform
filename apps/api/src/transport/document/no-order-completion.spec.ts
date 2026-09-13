import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * HAI DIEU KHONG DUOC TON TAI TRONG MIEN CHUNG TU — `#279` O2/O7.
 *
 * ============================================================================================
 *     1. KHONG mot dinh vi kho THO nao (bucket/key/path/URL).
 *     2. KHONG mot duong nao ket thuc mot DON.
 * ============================================================================================
 *
 * Ca hai deu la yeu cau ve thu KHONG DUOC CO, nen khong mot bai test hanh vi nao chung minh duoc
 * chung — cung khuon `no-auto-profit-distribution.spec.ts` cua `TX-08`.
 *
 * Dieu thu hai la bat bien trung tam ma ca `#274` lan `#279` O7 phat bieu:
 *
 *     bien nhan da ve  !=  don da ket thuc ve thuong mai
 *
 * Chup duoc mot to bien nhan, va ghi duoc rang no da ve toi van phong, deu la su that VAN HANH.
 * Ket thuc mot don la mot quyet dinh THUONG MAI cua Ke toan/Giam doc (Lane K), tren mot be mat
 * RIENG, voi mot ma quyen RIENG.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA = resolve(HERE, '../../../prisma/schema.prisma');

const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

const sourceFiles = readdirSync(HERE)
  .filter((name) => name.endsWith('.ts') && !name.endsWith('.spec.ts'))
  .sort();

const codeOf = (name: string): string => stripComments(readFileSync(join(HERE, name), 'utf8'));

describe('Khong mot dinh vi kho tho nao — DC-070', () => {
  it('co du tep de quet — mot thu muc rong se lam moi bai duoi day xanh gia', () => {
    expect(sourceFiles.length).toBeGreaterThan(10);
  });

  /**
   * `#279` O2: *"store stable opaque File IDs, never raw GCS/S3/local locator in public DTO"* va
   * *"no permanent public URL"*.
   *
   * Moi ten duoi day la mot ten THAT o mot mien khac cua repo (`TransportProofPhoto.locator`,
   * `MediaStore`, `gcs-media.store.ts`), nen su xuat hien cua chung o day co nghia la mot chi tiet
   * luu tru da lan vao mien nghiep vu.
   */
  const LOCATOR_TOKENS = [
    'locator',
    'bucket',
    'objectKey',
    'storageKey',
    'signedUrl',
    'publicUrl',
    'downloadUrl',
    'MediaStore',
    'gs://',
    's3://',
  ];

  for (const token of LOCATOR_TOKENS) {
    it(`khong mot tep nao nhac \`${token}\``, () => {
      const offenders = sourceFiles.filter((name) => codeOf(name).includes(token));
      expect(offenders, `\`${token}\` xuat hien o: ${offenders.join(', ')}`).toEqual([]);
    });
  }

  it('bang chung tu khong co cot dinh vi nao — chi mot ma tep DUC', () => {
    // CRLF -> LF: moc ket thuc model ben duoi tim '\n}\n'. Tren worktree Windows
    // (core.autocrlf=true) moc do khong khop -> indexOf tra -1 -> slice nuot ca phan
    // con lai cua tep, keo model khac vao vung quet. Blob trong git luon la LF.
    const schema = readFileSync(SCHEMA, 'utf8').replace(/\r\n/g, '\n');
    const start = schema.indexOf('model TransportOperationalDocument {');
    expect(start).toBeGreaterThan(0);
    const model = stripComments(schema.slice(start, schema.indexOf('\n}\n', start)));

    expect(model).toContain('fileId');
    for (const forbidden of ['locator', 'bucket', 'objectKey', 'storageKey', 'url']) {
      expect(model.toLowerCase(), forbidden).not.toContain(forbidden);
    }
  });
});

describe('Khong mot duong nao ket thuc mot DON — DC-071', () => {
  /**
   * Tu vung KET THUC DON. Moi ten la mot khai niem THAT o `transport-acceptance` hoac
   * `transport-core`, nen su xuat hien cua chung o day co nghia la mien van hanh da voi sang truc
   * thuong mai.
   */
  const COMPLETION_TOKENS = [
    'CommercialAcceptance',
    'AcceptanceRepository',
    'AcceptanceService',
    'transitionOrder',
    'completeOrder',
    'MovementService',
    'settlementEligible',
    'OrderStatus',
  ];

  for (const token of COMPLETION_TOKENS) {
    it(`khong mot tep nao nhac \`${token}\``, () => {
      const offenders = sourceFiles
        // `acceptance-evidence.adapter.ts` la CONG mot chieu: no hien thuc mot cong CHI DOC cua
        // Lane K de Lane K hoi nguoc lai. No CO duoc nhac ten cong do, va chi cong do.
        .filter((name) => name !== 'acceptance-evidence.adapter.ts')
        .filter((name) => codeOf(name).includes(token));
      expect(offenders, `\`${token}\` xuat hien o: ${offenders.join(', ')}`).toEqual([]);
    });
  }

  /**
   * Va cong mot chieu do chi duoc nhac DUNG MOT ten cua Lane K: `AcceptanceEvidenceFacts` — mot lop
   * truu tuong co DUNG hai ham DOC. Neu mot ngay no `import` them `CommercialAcceptanceService`
   * hay `AcceptanceRepository`, bai nay do.
   */
  it('cong mot chieu sang Lane K chi cham vao mot lop truu tuong CHI DOC', () => {
    const adapter = codeOf('acceptance-evidence.adapter.ts');
    expect(adapter).toContain('AcceptanceEvidenceFacts');
    for (const forbidden of [
      'CommercialAcceptanceService',
      'AcceptanceRepository',
      'CommercialAcceptanceDecision',
    ]) {
      expect(adapter, forbidden).not.toContain(forbidden);
    }
  });

  /**
   * Va o TANG LUU TRU: bang ban giao khong duoc co mot khoa ngoai nao tro sang truc nghiem thu, va
   * khong duoc co mot cot trang thai nao tren chinh don.
   */
  it('bang ban giao khong tro sang truc nghiem thu', () => {
    // CRLF -> LF: moc ket thuc model ben duoi tim '\n}\n'. Tren worktree Windows
    // (core.autocrlf=true) moc do khong khop -> indexOf tra -1 -> slice nuot ca phan
    // con lai cua tep, keo model khac vao vung quet. Blob trong git luon la LF.
    const schema = readFileSync(SCHEMA, 'utf8').replace(/\r\n/g, '\n');
    const start = schema.indexOf('model TransportPhysicalReceiptHandover {');
    expect(start).toBeGreaterThan(0);
    const model = stripComments(schema.slice(start, schema.indexOf('\n}\n', start)));

    for (const forbidden of [
      'TransportCommercialAcceptance',
      'acceptanceId',
      'settlementEligible',
      'completedAt',
    ]) {
      expect(model, forbidden).not.toContain(forbidden);
    }
    // Va no PHAI tro toi mot don — khong co no, cac bai tren xanh tren mot bang khong tro toi dau.
    expect(model).toContain('TransportOrder');
  });

  /**
   * `#279` O8 — AI la UNG VIEN, khong phai su that.
   *
   * Cot ung vien ton tai, nhung khong mot ma nguon nao trong mien nay DOC no de quyet dinh viec gi.
   * Bai nay khoa dieu do: neu mot ngay `extractionCandidate` xuat hien trong mot nhanh `if`, no da
   * thoi la mot ung vien.
   */
  it('ung vien do may doc ra khong tham gia vao mot quyet dinh nao', () => {
    const decidingFiles = sourceFiles.filter(
      (name) => name.endsWith('lifecycle.ts') || name.endsWith('service.ts'),
    );
    expect(decidingFiles.length).toBeGreaterThan(2);
    for (const name of decidingFiles) {
      expect(codeOf(name), name).not.toContain('extractionCandidate');
    }
  });
});
