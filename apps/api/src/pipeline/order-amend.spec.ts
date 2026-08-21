import { describe, expect, it } from 'vitest';
import { detectAmend } from './amend-detect.js';

/**
 * Bo nhan dien SUA/HUY DON.
 *
 * Neo vao dung cau khach da go trong buoi test 21/08/2026. Cau "huy don cu 20 lay 5 cai thoi"
 * la truong hop kho nhat: no vua co tu "huy" vua co y DOI — hieu thanh huy trang se lam khach
 * mat luon don, hieu thanh don moi se de don cu song va Sale go hai don vao KiotViet.
 */
describe('nhan dien yeu cau sua/huy don', () => {
  it('"huy don cu 20 lay 5 cai thoi" la DOI don, khong phai huy trang', () => {
    const signal = detectAmend('hủy đơn cũ 20 lấy 5 cái thôi');
    expect(signal.isAmend).toBe(true);
    expect(signal.isCancelOnly).toBe(false);
  });

  it('"huy don" don thuan la huy trang', () => {
    expect(detectAmend('huy don giup a')).toEqual({ isAmend: true, isCancelOnly: true });
  });

  it('"khong lay nua" la huy trang', () => {
    expect(detectAmend('thoi khong lay nua nhe')).toEqual({ isAmend: true, isCancelOnly: true });
  });

  it('nhan dien cac cach noi doi don khac', () => {
    for (const text of [
      'đổi thành 5 cái',
      'sửa đơn lại giúp anh',
      'thay vì 20 thì lấy 10',
      'cho a lấy 5 cái thôi',
      'chỉ lấy 5 cái',
      'đơn cũ bỏ đi nhé',
    ]) {
      expect(detectAmend(text).isAmend, text).toBe(true);
    }
  });

  it('KHONG coi mot don moi binh thuong la sua don', () => {
    for (const text of [
      'gui ghe felix ve TN cho c',
      '20',
      'cho a dat 10 cai ghe felix',
      'ELNI gia bao nhieu',
      'khi nao hang toi',
    ]) {
      expect(detectAmend(text).isAmend, text).toBe(false);
    }
  });
});
