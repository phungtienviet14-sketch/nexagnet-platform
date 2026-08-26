import { describe, expect, it } from 'vitest';
import { buildGithubSourceUrl } from '@netviet/shared';
import { TURN_DECISIONS } from '../turns/turn-decisions.js';
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
    release: { tenant: 'khach-test', environment: 'moi-truong-test', gitSha },
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
    });

    expect(context.releaseSha).toBe(RELEASE_SHA);
    expect(context.repositoryUrl).toContain('github.com/');
  });

  it('bo trong `releaseSha` khi tang deploy khong biet commit nao dang chay', () => {
    const context = currentSourceContext({
      tenant: 'khach-test',
      environment: 'moi-truong-test',
      gitSha: 'unknown',
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
    const context = currentSourceContext(telemetry.releaseIdentity());
    const view = buildTraceView(stored, context);
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

    const view = buildTraceView(
      sink.list(1)[0]!,
      currentSourceContext(telemetry.releaseIdentity()),
    );
    const node = view.nodes.find((candidate) => candidate.kind === 'state');

    expect(node).toBeDefined();
    expect(node?.source).toBeUndefined();
  });

  it('khong gan bat ky vi tri nao khi khong co danh tinh ma nguon', async () => {
    const sink = new RecentTracesSink();
    const telemetry = telemetryWith(sink);

    await telemetry.runTurn({ chatId: 'nhom-1' }, async () => {
      telemetry.decision({
        vocabulary: TURN_DECISIONS,
        point: 'message.intake',
        outcome: 'allowed',
        reason: 'ACCEPTED',
      });
    });

    // Khong truyen `sourceContext` -> khong co permalink. Vi tri van con (no thuoc ma nguon,
    // khong thuoc ban phat hanh), nhung khong duong nao dan ra ngoai.
    const view = buildTraceView(sink.list(1)[0]!);
    expect(view.sourceContext).toBeUndefined();
    expect(buildGithubSourceUrl({}, view.nodes[0]!.source!)).toBeNull();
  });
});
