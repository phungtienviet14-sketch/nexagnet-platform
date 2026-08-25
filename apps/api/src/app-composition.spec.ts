import { describe, expect, it } from 'vitest';
import type { CapabilityId } from '@netviet/tenant';
import { buildAppComposition } from './app-composition.js';

const OPERATIONS_CAPABILITIES = [
  'knowledge',
  'messaging',
  'turn-processing',
  'sales-order',
  'campaign',
  'operations',
  'notifications',
] as const satisfies readonly CapabilityId[];

describe('buildAppComposition', () => {
  it('giu day du route graph cua operations tenant hien tai', () => {
    const composition = buildAppComposition(OPERATIONS_CAPABILITIES);

    expect(composition.controllers.map((controller) => controller.name)).toEqual([
      'HealthController',
      'OrdersController',
      // Duong quay lai cua worker `sales-handoff-followup` — thuoc `sales-order`.
      'SalesHandoffController',
      'MessagesController',
      'DemoController',
      'ErpController',
      'KnowledgeController',
      'BroadcastController',
      'StreamController',
      'ZaloController',
      'SettingsController',
      'CampaignController',
      'MediaHealthController',
      'CatalogMediaController',
      'MasterDataController',
      'ReadinessController',
      'NotificationsController',
      'SettingsNotificationsController',
    ]);
  });

  it('knowledge-only chi nap foundation + knowledge/content, khong nap order/Zalo/parser/campaign', () => {
    const composition = buildAppComposition(['knowledge']);
    const controllerNames = composition.controllers.map((controller) => controller.name);
    const providerNames = composition.providers.map(providerName);

    expect(controllerNames).toEqual([
      'HealthController',
      'KnowledgeController',
      'CatalogMediaController',
    ]);
    expect(providerNames).not.toContain('OrdersService');
    expect(providerNames).not.toContain('ZaloUserClient');
    expect(providerNames).not.toContain('PipelineService');
    expect(providerNames).not.toContain('CampaignService');
    expect(providerNames).not.toContain('ORDER_PARSER');
  });

  /**
   * AI PHAT MOT URL THI PHAI PHUC VU DUOC URL DO.
   *
   * `ContentService` thuoc `knowledge`. Khi soan mot cau tu van no doi locator tuong doi cua goi
   * khach (`/media/catalog/...`) thanh URL tuyet doi roi dua vao `images`/`links` — tuc URL do di
   * THANG toi khach qua Zalo. Nhung route phuc vu chinh nhung byte do lai thuoc `sales-order`.
   *
   * Hau qua: mot khach co tri thuc + hoi thoai ma KHONG ban hang gui cho khach cua ho mot duong
   * dan anh san pham ma chinh API cua no tra 404. Khong co ngoai le nao nem ra, khong co canh bao
   * nao — chi la mot tin nhan den noi thieu anh.
   */
  it('khach nao PHAT duoc locator catalog thi phai PHUC VU duoc route catalog', () => {
    for (const capabilities of [
      ['knowledge'],
      ['knowledge', 'messaging', 'turn-processing'],
    ] satisfies readonly CapabilityId[][]) {
      const composition = buildAppComposition(capabilities);
      const controllerNames = composition.controllers.map((controller) => controller.name);
      const providerNames = composition.providers.map(providerName);

      expect(
        controllerNames,
        `[${capabilities.join(', ')}] phat /media/catalog nhung khong phuc vu no`,
      ).toContain('CatalogMediaController');
      expect(providerNames).toContain('Symbol(CATALOG_STORE)');
    }
  });

  /**
   * CONG DEMO la bo mo phong cua DUONG XU LY LUOT, khong phai mot man hinh ban hang.
   *
   * `/demo/simulate` la cong DUY NHAT chay tron pipeline that ma khong can Zalo — smoke test khi
   * deploy, bo do tre cua observability va bo eval parser deu di qua no. Trong ca controller
   * khong co mot dong nao ve don, gia, dai ly hay ERP: no bom mot tin gia vao pipeline roi tra
   * ve ban ghi luot.
   *
   * De no duoi `sales-order` nghia la mot khach trung tinh khong co cach nao chay thu mot luot
   * sau khi len — dung luc can nhat.
   */
  it('khach TRUNG TINH chay thu duoc mot luot ma khong can bat ban hang', () => {
    const neutral = buildAppComposition(['knowledge', 'messaging', 'turn-processing']);

    expect(neutral.controllers.map((controller) => controller.name)).toContain('DemoController');
    // …va van KHONG co gi cua ban hang di kem.
    expect(neutral.providers.map(providerName)).not.toContain('OrdersService');
    expect(neutral.controllers.map((controller) => controller.name)).not.toContain(
      'OrdersController',
    );
  });
});

function providerName(provider: unknown): string {
  if (typeof provider === 'function') return provider.name;
  if (provider && typeof provider === 'object' && 'provide' in provider) {
    const token = (provider as { provide: unknown }).provide;
    return typeof token === 'function' ? token.name : String(token);
  }
  return String(provider);
}
