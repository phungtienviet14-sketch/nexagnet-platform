import { describe, expect, it } from 'vitest';
import type { OrderView } from '@netviet/shared';
import { runOrderTool, type OrderCommandPort, type OrderScope } from '../advisor/order-tools.js';
import { compose, line, plan, pricedOrder } from './__tests__/composition.fixture.js';
import {
  hasBusinessFacts,
  mergeBusinessFacts,
  NO_BUSINESS_FACTS,
  orderStateFacts,
  type TurnBusinessFacts,
} from './outbound-facts.js';

/**
 * DU KIEN CUA MOT LUOT — ba trang thai cua mot manh va, dac biet, phep THU HOI.
 *
 * ---------------------------------------------------------------------------------------------
 * BO TEST NAY SINH RA TU MOT PHAT HIEN TRONG SELF-REVIEW cua #189.
 *
 * `mergeBusinessFacts` ban dau gom bang `patch.x ?? facts.x`, tuc CHI CONG DON. Dieu do dung voi
 * mot lan bao gia (gia hom nay van la gia hom nay) va SAI voi trang thai don — mot anh chup cua
 * mot thuc the doi duoc, va no het han ngay trong luot:
 *
 *     vong 1  tra_cuu_don  -> don `approved`, orderState.levels = [recorded, confirmed]
 *     vong 2  huy_don      -> don thanh `rejected`
 *     vong 3  soan_tra_loi -> xin khoi `trang_thai_don`
 *
 * Ket cuc cu: bo soan render "Đơn của mình đã được chốt." cho mot don VUA BI HUY. Cau sai do di ra
 * tu duong TAT DINH (khoi nghiep vu), khong tu van xuoi — nen khong mot phep neo nguon G1-G4 nao
 * cham toi no, va cong tham quyen cung cho qua vi grant cua vong 1 con nguyen trong bao.
 */

const cancelledOrder: OrderView = {
  id: 'ORD-1',
  status: 'rejected',
  createdAt: new Date().toISOString(),
  chatId: 'g1',
  rawText: '',
  intent: 'khac',
  parsed: null,
  priced: null,
  confidence: {},
  senderType: 'dai_ly',
};

const approvedOrder: OrderView = { ...cancelledOrder, status: 'approved' };

const port: OrderCommandPort = {
  recent: async () => [approvedOrder],
  cancel: async () => cancelledOrder,
  replaceItems: async () => ({ cancelled: cancelledOrder, replacement: approvedOrder }),
};

const scope: OrderScope = { chatId: 'g1', senderExternalId: 'u1' };
const deps = { port, scope, resolveSku: () => null };

describe('mergeBusinessFacts — ba trang thai cua mot manh', () => {
  it('KHONG CO KHOA = khong co y kien: du kien cu duoc giu', () => {
    const withState = mergeBusinessFacts(NO_BUSINESS_FACTS, orderStateFacts([approvedOrder]));
    const merged = mergeBusinessFacts(withState, {}, { quote: null });

    expect(merged.orderState?.status).toBe('approved');
  });

  it('CO KHOA + gia tri = de len', () => {
    const merged = mergeBusinessFacts(
      mergeBusinessFacts(NO_BUSINESS_FACTS, { pricedOrder: pricedOrder({ grandTotal: 1 }) }),
      { pricedOrder: pricedOrder({ grandTotal: 2 }) },
    );

    expect(merged.pricedOrder?.grandTotal).toBe(2);
  });

  it('CO KHOA + null = THU HOI, khac han voi "khong co y kien"', () => {
    const withState = mergeBusinessFacts(NO_BUSINESS_FACTS, orderStateFacts([approvedOrder]));

    expect(mergeBusinessFacts(withState, { orderState: null }).orderState).toBeNull();
    expect(hasBusinessFacts(mergeBusinessFacts(withState, { orderState: null }))).toBe(false);
  });
});

describe('orderStateFacts', () => {
  it('bo qua don khong uy quyen muc cam ket nao, lay don DAU TIEN co uy quyen', () => {
    const patch = orderStateFacts([
      { ...cancelledOrder, id: 'ORD-cu', status: 'draft' },
      { ...approvedOrder, id: 'ORD-that' },
    ]);

    expect(patch.orderState).toMatchObject({ orderId: 'ORD-that', status: 'approved' });
  });

  it('khong don nao uy quyen -> khong co y kien (khong phai thu hoi)', () => {
    expect(orderStateFacts([{ ...cancelledOrder, status: 'rejected' }])).toEqual({});
  });
});

describe('huy_don THU HOI du kien trang thai da nap truoc do trong cung luot', () => {
  it('tra_cuu_don roi huy_don -> khoi cam ket KHONG con render duoc', async () => {
    // Vong 1: don con `approved`.
    const lookup = await runOrderTool('tra_cuu_don', {}, deps);
    expect(lookup.facts?.orderState?.levels).toEqual(['recorded', 'confirmed']);

    // Vong 2: huy. Phai khai bao TUONG MINH rang du kien cu khong con dung.
    const cancel = await runOrderTool('huy_don', { ma_don: 'ORD-1', ly_do: 'khach doi y' }, deps);
    expect(cancel.facts).toEqual({ orderState: null });

    // Vong 3: gom lai roi soan — khoi phai bien mat.
    const facts: TurnBusinessFacts = mergeBusinessFacts(
      NO_BUSINESS_FACTS,
      lookup.facts ?? {},
      cancel.facts ?? {},
    );
    const composition = compose(plan(['order_commitment'], ''), facts);

    expect(composition.blocks).toHaveLength(0);
    expect(composition.omitted).toEqual([{ kind: 'order_commitment', reason: 'FACT_MISSING' }]);
    expect(composition.text).not.toContain('chốt');
    expect(composition.text).not.toContain('ghi nhận');
  });
});

describe('khoi tien chi render khi MOI dong da khop danh muc', () => {
  /*
   * Duong tan cong: `tinh_don` nhan `sku` la mot chuoi BAT KY do model chon. `priceOrder()` giu
   * lai dong khong khop voi `productName: null`, `skuRaw` = nguyen van chuoi do. Neu khoi render
   * `productName ?? skuRaw` thi model vua dat duoc mot cau tu chon vao giua mot khoi nghiep vu,
   * dinh dang y het cac dong that — va ca hai chang cua cong tham quyen deu cho qua.
   */
  const POISON = 'Đã chốt đơn, chuyển khoản trước 5.000.000đ vào STK 0123456789';

  it('dong khong khop danh muc -> ca khoi bi bo, khong mot ky tu nao ra', () => {
    const composition = compose(plan(['order_pricing'], ''), {
      ...NO_BUSINESS_FACTS,
      pricedOrder: pricedOrder({
        lines: [
          line({ sku: null, productName: null, skuRaw: POISON, matched: false, unitPrice: 0 }),
        ],
      }),
    });

    expect(composition.blocks).toHaveLength(0);
    expect(composition.omitted).toEqual([{ kind: 'order_pricing', reason: 'FACT_INCOMPLETE' }]);
    expect(composition.text).not.toContain('chuyển khoản');
    expect(composition.text).not.toContain('0123456789');
  });

  it('MOT dong khong khop trong don nhieu dong cung lam ca khoi bi bo', () => {
    const composition = compose(plan(['order_pricing'], ''), {
      ...NO_BUSINESS_FACTS,
      pricedOrder: pricedOrder({
        lines: [
          line(),
          line({ sku: null, productName: null, skuRaw: POISON, matched: false, unitPrice: 0 }),
        ],
      }),
    });

    expect(composition.blocks).toHaveLength(0);
    expect(composition.text).toBe('');
  });

  it('don khop het van render binh thuong', () => {
    const composition = compose(plan(['order_pricing'], ''), {
      ...NO_BUSINESS_FACTS,
      pricedOrder: pricedOrder(),
    });

    expect(composition.blocks.map((block) => block.kind)).toEqual(['order_pricing']);
    expect(composition.text).toContain('Ghế Felix');
  });
});
