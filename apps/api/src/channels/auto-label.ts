import { tenantMessagingPersona } from '@netviet/tenant';

/**
 * Nhan tin tu dong (dieu khoan Zalo Bot Platform — bao cao muc 6.3).
 * Gan vao MOI tin bot tu gui vao nhom de danh dau noi dung do AI tao.
 *
 * Ten bot lay tu goi khach (`persona.messaging.botName`) — chuoi nay DEN TAY dai ly cua
 * khach nen moi khach phai xung dung ten cua ho, khong duoc de ten khach khac trong nhan.
 *
 * Doc qua accessor cua `messaging`, KHONG qua shape gop: ham nay chay ca o khach khong doc tin
 * (broadcast, campaign CSKH mot chieu), va nhan tu dong la nghia vu theo dieu khoan Zalo o MOI
 * duong gui — no khong duoc phu thuoc vao viec khach co bat `turn-processing` hay khong.
 */
export function autoLabel(): string {
  return `\n— Tin tự động từ Bot ${tenantMessagingPersona().botName}`;
}
