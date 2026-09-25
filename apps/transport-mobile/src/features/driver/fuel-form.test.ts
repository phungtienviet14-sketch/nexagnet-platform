import { describe, expect, it } from 'vitest';
import {
  businessDateOf,
  digitsOnly,
  emptyFuelForm,
  fuelRunOptions,
  fuelSlipCommand,
  fuelSlipLabel,
  groupThousands,
  hasProblems,
  isValidCorrelationKey,
  normalizeLiters,
  parseLocalDateTime,
  soleOptionId,
  toFuelSlipBody,
  validateFuelForm,
  type FuelForm,
} from './fuel-form';

const NOW = new Date(2026, 8, 25, 10, 0, 0);

function filled(overrides: Partial<FuelForm> = {}): FuelForm {
  return {
    ...emptyFuelForm(NOW),
    runId: 'run-1',
    supplierId: 'sup-1',
    liters: '45,5',
    amountDigits: '1250000',
    odometerKm: '120345',
    ...overrides,
  };
}

describe('parseLocalDateTime', () => {
  it('doc dd/mm/yyyy + HH:mm theo gio may', () => {
    const value = parseLocalDateTime('25/09/2026', '07:05');
    expect(value?.getDate()).toBe(25);
    expect(value?.getHours()).toBe(7);
  });
  it('tu choi ngay/gio khong co that thay vi tran sang ngay khac', () => {
    expect(parseLocalDateTime('31/02/2026', '07:05')).toBeNull();
    expect(parseLocalDateTime('25/09/2026', '25:00')).toBeNull();
    expect(parseLocalDateTime('2026-09-25', '07:05')).toBeNull();
  });
});

describe('businessDateOf — ngay nghiep vu theo mui gio DOANH NGHIEP', () => {
  it('23:30 UTC la ngay hom sau o Viet Nam', () => {
    const instant = new Date('2026-09-24T23:30:00.000Z');
    expect(businessDateOf(instant, 'Asia/Ho_Chi_Minh')).toBe('2026-09-25');
    expect(businessDateOf(instant, 'UTC')).toBe('2026-09-24');
  });
  it('mui gio hong roi ve mui gio may, khong nem', () => {
    expect(businessDateOf(new Date(), 'Khong/Co')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('so lit va so tien', () => {
  it('nhan dau phay, toi da 3 chu so thap phan, lon hon 0', () => {
    expect(normalizeLiters('45,5')).toBe('45.5');
    expect(normalizeLiters('45.125')).toBe('45.125');
    expect(normalizeLiters('45.1255')).toBeNull();
    expect(normalizeLiters('0')).toBeNull();
    expect(normalizeLiters('abc')).toBeNull();
  });
  it('dinh dang nghin kieu Viet trong luc go', () => {
    expect(groupThousands('1250000')).toBe('1.250.000');
    expect(groupThousands('1.250.000')).toBe('1.250.000');
    expect(digitsOnly('00120')).toBe('120');
  });
});

describe('validateFuelForm', () => {
  it('form du -> khong co loi', () => {
    expect(hasProblems(validateFuelForm(filled(), NOW))).toBe(false);
  });
  it('khong co viec duoc dieu -> noi dung cau cua web', () => {
    expect(validateFuelForm(filled({ runId: null }), NOW).context).toBe(
      'Chưa có việc được điều nào để ghi phiếu — báo điều hành.',
    );
  });
  it('thoi diem o tuong lai qua 5 phut bi chan; lech 4 phut thi cho qua', () => {
    expect(validateFuelForm(filled({ timeText: '10:10' }), NOW).occurredAt).toBe(
      'Thời điểm đổ không được ở tương lai.',
    );
    expect(validateFuelForm(filled({ timeText: '10:04' }), NOW).occurredAt).toBeUndefined();
  });
  it('thieu cay xang / so tien / odo', () => {
    const problems = validateFuelForm(
      filled({ supplierId: '', amountDigits: '', odometerKm: '12,5' }),
      NOW,
    );
    expect(problems.supplier).toBe('Chọn cây xăng.');
    expect(problems.amount).toBeDefined();
    expect(problems.odometer).toBeDefined();
  });
});

describe('toFuelSlipBody — than lenh DONG BANG', () => {
  it('ngu canh vong chay, KHONG vehicleId, null tuong minh, ngay nghiep vu tuong minh', () => {
    const body = toFuelSlipBody({
      form: filled({ dateText: '24/09/2026', timeText: '23:30' }),
      correlationKey: 'b7d1c1a2-1111-4222-8333-944455556666',
      timeZone: 'Asia/Ho_Chi_Minh',
      now: NOW,
    });
    expect(body).not.toHaveProperty('vehicleId');
    expect(body).not.toHaveProperty('tripId');
    expect(body.legId).toBeNull();
    expect(body.stationId).toBeNull();
    expect(body.invoiceNo).toBeNull();
    expect(body.liters).toBe('45.5');
    expect(body.amount).toBe(1_250_000);
    expect(body.odometerKm).toBe(120_345);
    expect(body.paymentMethod).toBe('SUPPLIER_ACCOUNT');
    expect(body.businessDate).toMatch(/^2026-09-2[45]$/);
    expect(body.correlationKey).toBe('b7d1c1a2-1111-4222-8333-944455556666');
  });

  it('cung form + cung khoa -> cung than (dieu kien de gui lai an toan)', () => {
    const input = {
      form: filled(),
      correlationKey: 'khoa-chong-trung-01',
      timeZone: 'Asia/Ho_Chi_Minh',
      now: NOW,
    };
    expect(toFuelSlipBody(input)).toEqual(toFuelSlipBody({ ...input, now: new Date(NOW) }));
  });

  it('form thieu hoac khoa hong -> khong tao than', () => {
    expect(() =>
      toFuelSlipBody({
        form: filled({ supplierId: '' }),
        correlationKey: 'khoa-12345678',
        timeZone: 'UTC',
        now: NOW,
      }),
    ).toThrow();
    expect(() =>
      toFuelSlipBody({ form: filled(), correlationKey: 'ngan', timeZone: 'UTC', now: NOW }),
    ).toThrow();
  });

  it('nhan hang doi doc duoc', () => {
    const body = toFuelSlipBody({
      form: filled(),
      correlationKey: 'khoa-12345678',
      timeZone: 'UTC',
      now: NOW,
    });
    expect(fuelSlipLabel(body)).toBe('Phiếu đổ dầu 45,5 lít · 1.250.000 ₫');
  });
});

describe('isValidCorrelationKey', () => {
  it('8-120 ky tu', () => {
    expect(isValidCorrelationKey('1234567')).toBe(false);
    expect(isValidCorrelationKey('12345678')).toBe(true);
    expect(isValidCorrelationKey('x'.repeat(121))).toBe(false);
  });
});

describe('fuelRunOptions', () => {
  it('vong DANG CHAY truoc, chang da huy bi loai', () => {
    const options = fuelRunOptions([
      {
        runId: 'b',
        runCode: 'B',
        runStatus: 'PLANNED',
        vehicleId: 'v',
        vehiclePlate: null,
        legs: [],
      },
      {
        runId: 'a',
        runCode: 'Z',
        runStatus: 'ACTIVE',
        vehicleId: 'v',
        vehiclePlate: '29C-123.45',
        legs: [
          {
            legId: 'l1',
            sequence: 1,
            kind: 'LOADED',
            status: 'IN_TRANSIT',
            originLabel: 'A',
            destinationLabel: 'B',
          },
          {
            legId: 'l2',
            sequence: 2,
            kind: 'LOADED',
            status: 'CANCELLED',
            originLabel: 'B',
            destinationLabel: 'C',
          },
        ],
      },
    ]);
    expect(options.map((option) => option.runId)).toEqual(['a', 'b']);
    expect(options[0]?.legs).toEqual([{ legId: 'l1', label: 'Chặng 1: A → B' }]);
    expect(options[1]?.vehicleLabel).toBe('Xe của vòng xe');
  });
});

describe('fuelSlipCommand — lenh hang doi cho MOT phieu', () => {
  it('mang than DONG BANG y het va nhan doc duoc trong "Việc trên máy"', () => {
    const body = toFuelSlipBody({
      form: filled(),
      correlationKey: 'fuel-key-0001',
      timeZone: 'Asia/Ho_Chi_Minh',
      now: NOW,
    });
    const command = fuelSlipCommand(body);
    expect(command.type).toBe('FUEL_SLIP');
    expect(command.label).toBe(fuelSlipLabel(body));
    expect(command.body).toEqual(body);
    expect(command.body).not.toBe(body);
  });
});

describe('soleOptionId — chi chon san khi KHONG con lua chon nao khac', () => {
  const id = (option: { readonly id: string }) => option.id;

  it('mot lua chon -> chon san', () => {
    expect(soleOptionId([{ id: 'r1' }], id)).toBe('r1');
  });

  it('khong co hoac nhieu lua chon -> de lai xe tu chon', () => {
    expect(soleOptionId([], id)).toBeNull();
    expect(soleOptionId([{ id: 'r1' }, { id: 'r2' }], id)).toBeNull();
  });
});
