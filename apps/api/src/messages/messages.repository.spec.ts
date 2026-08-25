import { describe, expect, it } from 'vitest';
import type { ChannelMessage } from '@netviet/shared';
import { InMemoryMessagesRepository } from './messages.repository.js';

function msg(externalMessageId: string): ChannelMessage {
  return {
    externalMessageId,
    platform: 'zalo',
    source: 'bot_webhook',
    chatType: 'group',
    externalChatId: 'g-test',
    text: 'gui 10 ghe felix',
    sentAt: new Date('2026-07-11T00:00:00.000Z'),
  };
}

/** Mot luot trong mach hoi thoai — de dat `sentAt` BANG NHAU mot cach co chu y. */
function turn(externalMessageId: string, text: string, sentAt: Date): ChannelMessage {
  return { ...msg(externalMessageId), text, sentAt };
}

describe('InMemoryMessagesRepository', () => {
  it('save tin moi -> duplicate=false + luu du lieu', async () => {
    const repo = new InMemoryMessagesRepository();

    const result = await repo.save(msg('m-1'));

    expect(result.duplicate).toBe(false);
    expect(result.id).toBeTruthy();
    expect(repo.list()).toHaveLength(1);
    expect(repo.list()[0]?.text).toBe('gui 10 ghe felix');
  });

  it('tin trung (cung platform + externalMessageId) -> duplicate=true, KHONG tao dong 2, giu id cu', async () => {
    const repo = new InMemoryMessagesRepository();

    const first = await repo.save(msg('m-1'));
    const second = await repo.save(msg('m-1'));

    expect(second.duplicate).toBe(true);
    expect(second.id).toBe(first.id);
    expect(repo.list()).toHaveLength(1);
  });

  it('khac externalMessageId -> 2 dong rieng biet', async () => {
    const repo = new InMemoryMessagesRepository();

    await repo.save(msg('m-1'));
    const other = await repo.save(msg('m-2'));

    expect(other.duplicate).toBe(false);
    expect(repo.list()).toHaveLength(2);
  });

  it('attachOrder o memory la no-op, khong throw', async () => {
    const repo = new InMemoryMessagesRepository();
    await expect(repo.attachOrder()).resolves.toBeUndefined();
  });

  // Dot A' Task 2 — MediaFetcher tai anh XONG moi quay lai ghi ket qua vao dong tin da luu.
  it('recordMedia ghi khoa object vao dong tin da luu', async () => {
    const repo = new InMemoryMessagesRepository();
    const { id } = await repo.save(msg('m-anh'));
    const fetchedAt = new Date('2026-08-11T03:00:05.000Z');

    await repo.recordMedia(id, { key: 'media/2026/08/ckabc.webp', bytes: 98_304, fetchedAt });

    expect(repo.list()[0]).toMatchObject({
      mediaKey: 'media/2026/08/ckabc.webp',
      mediaBytes: 98_304,
      mediaFetchedAt: fetchedAt,
    });
  });

  it('recordMedia nhanh loi chi ghi mediaError, KHONG dung toi noi dung tin', async () => {
    const repo = new InMemoryMessagesRepository();
    const { id } = await repo.save(msg('m-anh-hong'));

    await repo.recordMedia(id, { error: 'HTTP 404' });

    expect(repo.list()[0]?.mediaError).toBe('HTTP 404');
    expect(repo.list()[0]?.mediaKey).toBeUndefined();
    expect(repo.list()[0]?.text).toBe('gui 10 ghe felix');
  });

  // Tin co the da bi xoa/khong ton tai khi anh tai xong — khong duoc nem, vi loi o day
  // se noi len thanh unhandled rejection trong tien trinh nen.
  it('recordMedia voi id khong ton tai -> khong throw', async () => {
    const repo = new InMemoryMessagesRepository();
    await expect(repo.recordMedia('khong-co', { error: 'x' })).resolves.toBeUndefined();
  });
});

/*
 * THU TU CUA `findRecent` KHI `sentAt` BANG NHAU.
 *
 * Day KHONG phai mot goc kho tim. Main DO ngay 25/08/2026 vi dung dieu nay: ba tin cua mot mach
 * hoi thoai (`pipeline-messages.spec.ts`) duoc tao bang `new Date()` lien tiep, va tren runner
 * nhanh ca ba roi vao CUNG mot mili-giay. Bai do do vi mot ly do khong lien quan gi den thay doi
 * dang duoc kiem — dung dinh nghia cua mot bai mong manh, va no giau mot loi THAT ben duoi.
 *
 * Bai duoi day dat `sentAt` bang nhau MOT CACH CO CHU Y, nen no do TAT DINH truoc khi sua chu
 * khong do theo mua.
 */
describe('InMemoryMessagesRepository.findRecent — pha the khi `sentAt` bang nhau', () => {
  const SAME_MS = new Date('2026-07-11T00:00:00.000Z');

  it('tin den SAU dung TRUOC, du `sentAt` giong het nhau', async () => {
    const repo = new InMemoryMessagesRepository();
    await repo.save(turn('c1', 'bb grey bao nhieu tien', SAME_MS));
    await repo.save(turn('c2', 'the con elni thi sao', SAME_MS));

    const recent = await repo.findRecent('zalo', 'g-test', SAME_MS, 'c3', 10);

    // Hop dong la MOI NHAT TRUOC. Truoc khi sua, bo so sanh tra 0 -> `Array#sort` on dinh giu
    // thu tu CHEN -> ket qua ra ['bb grey', 'elni'], tuc NGUOC.
    expect(recent.map((row) => row.text)).toEqual([
      'the con elni thi sao',
      'bb grey bao nhieu tien',
    ]);
  });

  it('`limit` cat DUNG dau moi nhat, khong cat nham dau cu', async () => {
    // He qua truc tiep cua thu tu sai: cat 1 tin tu mot mang bi lat se giu lai tin CU NHAT va
    // vut di tin vua nhac — mat dung manh ngu canh ma LLM can de hieu "cai do".
    const repo = new InMemoryMessagesRepository();
    await repo.save(turn('c1', 'tin cu nhat', SAME_MS));
    await repo.save(turn('c2', 'tin giua', SAME_MS));
    await repo.save(turn('c3', 'tin moi nhat', SAME_MS));

    const recent = await repo.findRecent('zalo', 'g-test', SAME_MS, 'khong-loai-ai', 2);

    expect(recent.map((row) => row.text)).toEqual(['tin moi nhat', 'tin giua']);
  });

  it('`sentAt` khac nhau van thang the — thoi gian truoc, thu tu den chi la chieu phu', async () => {
    // CHONG XANH GIA: neu ai do doi bo so sanh thanh "chi theo thu tu den" thi bai nay DO.
    const repo = new InMemoryMessagesRepository();
    await repo.save(turn('den-truoc-nhung-moi-hon', 'moi hon', new Date('2026-07-11T00:00:05Z')));
    await repo.save(turn('den-sau-nhung-cu-hon', 'cu hon', new Date('2026-07-11T00:00:01Z')));

    const recent = await repo.findRecent(
      'zalo',
      'g-test',
      new Date('2026-07-11T00:00:09Z'),
      'x',
      10,
    );

    expect(recent.map((row) => row.text)).toEqual(['moi hon', 'cu hon']);
  });
});
