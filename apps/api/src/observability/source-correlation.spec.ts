import { describe, expect, it } from 'vitest';
import 'reflect-metadata';
import { buildGithubSourceUrl } from '@netviet/shared';
import { TURN_DECISIONS } from '../turns/turn-decisions.js';
import { ObservabilityModule } from './observability.module.js';
import { RecentTracesSink } from './recent-traces.sink.js';
import { TelemetryService } from './telemetry.service.js';
import { buildTraceView } from './trace-view.builder.js';
import { currentSourceContext, sourceForDecision, sourceForStep } from './source-manifest.js';

/**
 * TU MOT LUOT CHAY THAT VE DUNG DONG MA NGUON.
 *
 * ---------------------------------------------------------------------------
 * BAI KIEM NAY CHAY NGHIEP VU THAT, khong dung ban ghi gia.
 *
 * Do la ca diem cua no: gia tri duy nhat cua tinh nang nay la moi noi tren duong day — ten buoc
 * do `pipeline.service.ts` viet ra, khoa tra cuu do `trace-view.builder.ts` dung, muc trong bang
 * do trinh sinh ghi — cung dong y ve MOT chuoi. Mot bai kiem tu dung `TelemetryRecord` bang tay
 * se xanh ngay ca khi ba noi do lech nhau.
 *
 * Nen o day: chay `telemetry.step()` va `telemetry.decision()` that, roi hoi man hinh.
 */

const RELEASE_SHA = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';

function telemetryWith(sink: RecentTracesSink, gitSha = RELEASE_SHA): TelemetryService {
  const telemetry = new TelemetryService();
  telemetry.configure({
    release: { tenant: 'khach-test', environment: 'moi-truong-test', gitSha, source: 'manifest' },
    privacy: 'full',
    sinks: [sink],
  });
  return telemetry;
}

describe('bang vi tri ma nguon', () => {
  it('chi dung tep va dong cua mot ranh gioi nghiep vu co that', () => {
    const source = sourceForStep('conversation.resolve');

    expect(source).not.toBeNull();
    expect(source!.filePath).toBe('apps/api/src/pipeline/pipeline.service.ts');
    expect(source!.functionName).toMatch(/^PipelineService\./);
    expect(source!.line).toBeGreaterThan(0);
  });

  /**
   * `message.intake` co BON duong tu choi, moi duong mot ma ly do va moi duong mot DONG.
   *
   * Day la khac biet giua mot man hinh dung duoc va mot man hinh chi dung mot phan tu: tra cuu
   * chi bang `point` se luon dua ve dong dau tien, va nguoi debug khong co cach nao biet minh
   * dang doc nhanh nao.
   */
  it('phan biet duoc tung nhanh cua mot diem quyet dinh', () => {
    const reasons = ['ACCEPTED', 'DUPLICATE_MESSAGE', 'GROUP_NOT_MAPPED', 'PARTICIPANT_IGNORED'];
    const lines = reasons.map((reason) => sourceForDecision('message.intake', reason)?.line);

    expect(lines.every((line) => typeof line === 'number')).toBe(true);
    expect(new Set(lines).size).toBe(reasons.length);
  });

  it('khong bia mot vi tri cho ten khong co trong ma nguon', () => {
    expect(sourceForStep('khong.he.ton.tai')).toBeNull();
    expect(sourceForDecision('khong.he.ton.tai', 'GI_DO')).toBeNull();
  });

  it('chi mang toa do ma nguon — khong header, khong payload, khong bi mat', () => {
    const source = sourceForStep('conversation.resolve')!;
    expect(Object.keys(source).sort()).toEqual(['filePath', 'functionName', 'line']);
  });
});

describe('danh tinh ma nguon cua ban dang chay', () => {
  it('mang git SHA DAY DU, khong phai ban cat ngan de doc', () => {
    const context = currentSourceContext({
      tenant: 'khach-test',
      environment: 'moi-truong-test',
      gitSha: RELEASE_SHA,
      source: 'manifest',
    });

    expect(context.releaseSha).toBe(RELEASE_SHA);
    expect(context.repositoryUrl).toContain('github.com/');
  });

  it('bo trong `releaseSha` khi tang deploy khong biet commit nao dang chay', () => {
    const context = currentSourceContext({
      tenant: 'khach-test',
      environment: 'moi-truong-test',
      gitSha: 'unknown',
      source: 'none',
    });

    // KHONG duoc de chuoi `unknown` di tiep nhu mot gia tri that: man hinh phai noi "chua xac
    // dinh duoc ban phat hanh", va no chi noi duoc khi truong nay VANG MAT.
    expect(context.releaseSha).toBeUndefined();
    expect(buildGithubSourceUrl(context, { filePath: 'apps/api/src/main.ts', line: 1 })).toBeNull();
  });
});

describe('man hinh chan doan', () => {
  it('dan duoc tu mot quyet dinh that toi permalink cua dung ban phat hanh', async () => {
    const sink = new RecentTracesSink();
    const telemetry = telemetryWith(sink);

    await telemetry.runTurn({ chatId: 'nhom-1', channel: 'zca_listener' }, async () => {
      telemetry.decision({
        vocabulary: TURN_DECISIONS,
        point: 'message.intake',
        outcome: 'denied',
        reason: 'GROUP_NOT_MAPPED',
      });
    });

    const stored = sink.list(1)[0]!;
    const view = buildTraceView(stored);
    const node = view.nodes.find((candidate) => candidate.reason === 'GROUP_NOT_MAPPED');

    expect(node?.source?.filePath).toBe('apps/api/src/pipeline/pipeline.service.ts');
    expect(node?.source?.line).toBe(sourceForDecision('message.intake', 'GROUP_NOT_MAPPED')!.line);

    const url = buildGithubSourceUrl(view.sourceContext!, node!.source!);
    expect(url).toBe(
      `https://github.com/phungtienviet14-sketch/nexagnet-platform/blob/${RELEASE_SHA}/` +
        `apps/api/src/pipeline/pipeline.service.ts#L${node!.source!.line}`,
    );
  });

  /**
   * MUC 17 (E): THIEU VI TRI THI MAN HINH VAN PHAI DUNG DAY DU.
   *
   * Mot chuyen trang thai khong co cho tra cuu — va do la trang thai BINH THUONG, khong phai loi.
   * Neu thieu vi tri lam rot mot nut khoi cay thi tinh nang chan doan nay da an di chinh thu no
   * sinh ra de hien.
   */
  it('van ve du cay khi mot nut khong co vi tri ma nguon', async () => {
    const sink = new RecentTracesSink();
    const telemetry = telemetryWith(sink);

    await telemetry.runTurn({ orderId: 'don-1', channel: 'operator_console' }, async () => {
      telemetry.stateChange({ entity: 'Order', entityId: 'don-1', from: 'draft', to: 'sent' });
    });

    const view = buildTraceView(sink.list(1)[0]!);
    const node = view.nodes.find((candidate) => candidate.kind === 'state');

    expect(node).toBeDefined();
    expect(node?.source).toBeUndefined();
  });

  /**
   * KHONG BIET RELEASE THI MAT LIEN KET, KHONG MAT VI TRI.
   *
   * Hai thu nay thuoc hai tang khac nhau va bai kiem nay giu chung tach nhau: `filePath`/`line`
   * thuoc MA NGUON (bang tra cuu duoc sinh luc build, luon biet), con permalink thuoc BAN PHAT
   * HANH (chi biet khi doc duoc `release.json`). Gop chung lam mot se lam man hinh chan doan
   * mat luon ca dong ma chi vi khong mount duoc manifest — dung luc nguoi ta can no nhat.
   */
  it('mat lien ket khi khong biet release, nhung van giu vi tri ma nguon', async () => {
    const sink = new RecentTracesSink();
    // `gitSha: 'unknown'` = tien trinh nay khong doc duoc `release.json` (vd chay local).
    const telemetry = telemetryWith(sink, 'unknown');

    await telemetry.runTurn({ chatId: 'nhom-1' }, async () => {
      telemetry.decision({
        vocabulary: TURN_DECISIONS,
        point: 'message.intake',
        outcome: 'allowed',
        reason: 'ACCEPTED',
      });
    });

    const view = buildTraceView(sink.list(1)[0]!);
    const node = view.nodes[0]!;

    // Vi tri VAN CON — no thuoc ma nguon, khong thuoc ban phat hanh.
    expect(node.source?.filePath).toBe('apps/api/src/pipeline/pipeline.service.ts');
    expect(node.source?.line).toBeGreaterThan(0);
    // Nhung khong duong nao dan ra ngoai: khong co SHA thi khong co blob de tro toi.
    expect(view.sourceContext?.releaseSha).toBeUndefined();
    expect(buildGithubSourceUrl(view.sourceContext!, node.source!)).toBeNull();
  });
});

/**
 * DI: CAI GIU CHO DANH TINH RELEASE KHONG AM THAM BIEN MAT.
 *
 * `TraceController` tiem `TelemetryService` de tra loi "ban nao dang chay" o VO BOC cua danh
 * sach trace — cau hoi do van thuoc ve tien trinh, khong thuoc ve tung luot. Mot lan go nham
 * `exports` se lam cau tra loi do bien mat MA KHONG CO GI DO O DAU.
 *
 * Repo nay khong cai `@nestjs/testing` va khong dung `createTestingModule` o dau (xem
 * `di-reachability.contract.spec.ts`: hop dong DI duoc kiem qua chinh day noi cua san pham).
 * Nen o day ta khoa dung BAT BIEN lam phep tiem do giai duoc: module la `@Global()` VA no XUAT
 * `TelemetryService`. Mat mot trong hai thi `@Optional()` lang le tra ve `undefined`.
 *
 * `RecentTracesSink` di kem trong cung phep kiem vi no la BANG CHUNG: controller do da tiem no
 * (khong `@Optional()`) va dang chay that tren gd1-test, tuc duong giai nay co that.
 */
describe('day noi DI cua man hinh chan doan', () => {
  it('ObservabilityModule la @Global() va xuat ca hai thu man hinh can', () => {
    expect(Reflect.getMetadata('__module:global__', ObservabilityModule)).toBe(true);

    const exported = Reflect.getMetadata('exports', ObservabilityModule) as unknown[];
    expect(exported).toContain(TelemetryService);
    expect(exported).toContain(RecentTracesSink);
  });
});
