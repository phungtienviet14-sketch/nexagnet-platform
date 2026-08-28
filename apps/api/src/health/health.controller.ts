import { Controller, Get, Optional } from '@nestjs/common';
import { Public } from '../auth/public.decorator.js';
import { ChannelHealthService, type ChannelHealth } from '../channels/channel-health.js';

export interface HealthStatus {
  status: 'ok';
  uptimeSeconds: number;
  /** Vang mat = ban trien khai khong dang ky theo doi kenh (script, test). Khong phai loi. */
  channels?: ChannelHealth;
}

/**
 * CONG KHAI co chu y: uptime check / load balancer phai do duoc ma khong can giu secret.
 *
 * ==============================================================================================
 * VI SAO `status` VAN LA `'ok'` KHI KENH DOC DA CHET:
 *
 * Cau hoi cua endpoint nay la "tien trinh nay con phuc vu duoc khong", va cau tra loi van la co:
 * console van mo, don van duyet duoc, worker van goi nguoc ve duoc. Neu bien mot kenh dut thanh
 * `status: 'error'` thi Docker se giet va tao lai container theo vong lap — mot su co KENH tro
 * thanh mot su co TOAN STACK, va no keo do ca duong dan tay dang chay tot.
 *
 * Nen o day khong danh gia, chi PHOI BAY. Cai gi la that bai la quyet dinh cua tang deploy
 * (`deploy-signals.mjs`), noi co du ngu canh de biet mot kenh im la binh thuong hay la su co.
 *
 * ==============================================================================================
 * VI SAO KHOI `channels` DUOC PHEP NAM SAU `@Public()`:
 *
 * No khong mang noi dung nghiep vu: khong ma nhom, khong ten hien thi, khong tin nhan, khong
 * chuoi loi. Chi co pha cua socket, may moc thoi gian, va so dem. Do la muc chi tiet ma mot cong
 * suc khoe PHAI co de dung duoc — mot cong suc khoe chi noi `ok` la mot cong suc khoe da noi doi
 * suot 44 gio (reference-platform-stack.md §7.1).
 */
@Public()
@Controller('health')
export class HealthController {
  constructor(@Optional() private readonly channels?: ChannelHealthService) {}

  @Get()
  check(): HealthStatus {
    const channels = this.channels?.snapshot();
    return {
      status: 'ok',
      uptimeSeconds: Math.floor(process.uptime()),
      ...(channels ? { channels } : {}),
    };
  }
}
