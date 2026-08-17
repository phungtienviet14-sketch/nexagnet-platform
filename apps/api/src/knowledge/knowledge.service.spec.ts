import { describe, expect, it } from 'vitest';
import { KnowledgeService } from './knowledge.service.js';

/**
 * Phan giai nhom -> dai ly la loi dinh tuyen da nhom. Test doc chatId tu groups()
 * nen KHONG phu thuoc gia tri chatId cu the (song sot khi thay chatId that vao seed).
 */
describe('KnowledgeService.resolveByChatId (dinh tuyen da nhom)', () => {
  const knowledge = new KnowledgeService();

  it('khong dung lai bang gia seed thang cu khi runtime da sang thang moi', () => {
    const futureMonthKnowledge = new KnowledgeService(
      undefined,
      new Date('2026-09-12T00:00:00.000Z'),
    );

    expect(futureMonthKnowledge.prices()).toEqual([]);
  });

  it('dung dung group ID zca da duoc operator chon cho Meta HN va Thai Nguyen', () => {
    expect(knowledge.groups()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ chatId: '2508572440887686813', dealerId: 'meta-hn' }),
        expect.objectContaining({ chatId: '3787434804745256898', dealerId: 'dl-thai-nguyen' }),
      ]),
    );
  });

  it('nhom Meta HN -> dai ly + chi nhanh + ten nhom', () => {
    const meta = knowledge.groups().find((g) => g.dealerId === 'meta-hn');
    expect(meta).toBeDefined();
    const r = knowledge.resolveByChatId(meta!.chatId);
    expect(r.dealer?.id).toBe('meta-hn');
    expect(r.branch).toBe('HN');
    expect(r.groupName).toBe('Nhóm đại lý Meta HN');
  });

  it('co it nhat 2 nhom, moi nhom map ve dung dai ly + ten nhom rieng', () => {
    const groups = knowledge.groups();
    expect(groups.length).toBeGreaterThanOrEqual(2);
    for (const g of groups) {
      const r = knowledge.resolveByChatId(g.chatId);
      expect(r.dealer?.id).toBe(g.dealerId);
      expect(r.branch).toBe(g.branch);
      expect(r.groupName).toBe(g.name);
    }
  });

  it('nhom la (chua map) -> khong co dai ly, khong crash', () => {
    const r = knowledge.resolveByChatId('zgr-khong-ton-tai');
    expect(r.dealer).toBeNull();
    expect(r.branch).toBeNull();
    expect(r.groupName).toBeNull();
  });

  it('moi nhom deu co ten hien thi (khong rong) va tro toi dai ly co that', () => {
    for (const g of knowledge.groups()) {
      expect(g.name.length).toBeGreaterThan(0);
      expect(knowledge.findDealerById(g.dealerId)).not.toBeNull();
    }
  });
});
