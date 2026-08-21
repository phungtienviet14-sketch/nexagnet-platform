import { describe, expect, it } from 'vitest';
import { unverifiedAmounts } from './money-guard.js';

const TOOL_OUTPUT = [{ bao_gia: [{ sku: 'FELIX', don_gia: 1_150_000, don_gia_chu: '1.150.000đ' }] }];

describe('unverifiedAmounts', () => {
  it('cho qua con so DUNG bang cong cu tra ve', () => {
    expect(unverifiedAmounts('Dạ ghế Felix bên em 1.150.000đ ạ.', TOOL_OUTPUT)).toEqual([]);
  });

  it('cho qua cach viet rut gon cua CHINH con so do', () => {
    expect(unverifiedAmounts('Dạ 1.150k ạ.', TOOL_OUTPUT)).toEqual([]);
  });

  it('bat con so BIA ra', () => {
    expect(unverifiedAmounts('Dạ ghế Felix 990.000đ ạ.', TOOL_OUTPUT)).toEqual(['990.000đ']);
  });

  it('bat gia bia kieu "2tr5"', () => {
    expect(unverifiedAmounts('Combo này 2tr5 nhé anh.', TOOL_OUTPUT)).toHaveLength(1);
  });

  it('khong nham dien tich/kich thuoc thanh gia', () => {
    expect(unverifiedAmounts('Máy dùng tốt cho phòng 20m2 ạ.', TOOL_OUTPUT)).toEqual([]);
  });

  it('khong con so nao thi sach', () => {
    expect(unverifiedAmounts('Dạ máy hút được sàn gỗ ạ.', [])).toEqual([]);
  });

  it('khong cong cu nao chay ma van noi gia -> chan', () => {
    expect(unverifiedAmounts('Dạ 1.150.000đ ạ.', [])).toEqual(['1.150.000đ']);
  });
});
