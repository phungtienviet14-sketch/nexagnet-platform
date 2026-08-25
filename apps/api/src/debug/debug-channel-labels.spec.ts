import { describe, expect, it } from 'vitest';
import { MESSAGE_SOURCES } from '@netviet/shared';
import { CHANNEL_LABELS } from './order-debug.builder.js';

/**
 * DO PHU cua bang nhan kenh.
 *
 * ---------------------------------------------------------------------------
 * BAI KIEM NAY RA DOI TU MOT LOI THAT, do duoc bang mot lan chay that (25/08/2026):
 *
 * Bang nhan ban dau duoc chep theo chu thich cua `TraceAnchors.channel`, von liet ke
 * `zca | bot | mock | http`. Nhung cai THUC SU duoc ghi vao neo la `message.source`
 * (`pipeline.service.ts`), tuc mot gia tri cua `MESSAGE_SOURCES`. Ket qua: mot don that hien ra
 * tren man hinh voi nhan `copilot_paste` — dung cai chuoi may ma ca phien nay sinh ra de tranh.
 *
 * Loi do khong do o dau ca: khong test nao hong, khong log nao do. No chi lo ra khi co nguoi mo
 * man hinh len va nhin. Nen no phai duoc giu bang mot bai kiem, khong phai bang tri nho.
 *
 * ---------------------------------------------------------------------------
 * KIEM THEO NGUON SU THAT, khong kiem theo mot danh sach chep tay: `MESSAGE_SOURCES` la enum
 * cua goi dung chung, nen them mot nguon tin moi vao do se lam DO bai duoi day ngay lap tuc.
 */

/**
 * Hai kenh KHONG den tu `MESSAGE_SOURCES` — chung duoc dat truc tiep o noi mo luot.
 *
 * Chep gia tri thay vi import: ca hai la `const` cap module, khong xuat ra. Xuat chung chi de
 * mot bai kiem doc duoc se lam ro ri mot chi tiet noi bo ra API cua module; con hai chuoi nay
 * la HOP DONG QUAN SAT, doi chung la mot thay doi phai duoc nhin thay trong diff — va bai kiem
 * nay chinh la cho no bi nhin thay.
 */
const NON_MESSAGE_CHANNELS = ['operator_console', 'workflow_worker'] as const;

describe('nhan kenh — phu het nguon tin that', () => {
  it('moi gia tri cua MESSAGE_SOURCES deu co nhan tieng Viet', () => {
    for (const source of MESSAGE_SOURCES) {
      expect(CHANNEL_LABELS[source], `kenh '${source}' chua co nhan`).toBeTruthy();
    }
  });

  it('kenh do NGUOI va do WORKER mo cung co nhan', () => {
    for (const channel of NON_MESSAGE_CHANNELS) {
      expect(CHANNEL_LABELS[channel], `kenh '${channel}' chua co nhan`).toBeTruthy();
    }
  });

  it('bang nhan KHONG chua ma kenh khong ai ghi', () => {
    const known = new Set<string>([...MESSAGE_SOURCES, ...NON_MESSAGE_CHANNELS]);
    for (const key of Object.keys(CHANNEL_LABELS)) {
      expect(known.has(key), `bang nhan khai kenh '${key}' ma khong noi nao ghi ra`).toBe(true);
    }
  });

  it('nhan khong duoc trung voi chinh ma — nhan phai la tieng Viet, khong phai ban sao', () => {
    for (const [key, label] of Object.entries(CHANNEL_LABELS)) {
      expect(label, `kenh '${key}' lay chinh ma lam nhan`).not.toBe(key);
    }
  });
});
