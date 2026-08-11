import { loadTenantConfig } from '../tenant/tenant.config.js';

/**
 * Nhan tin tu dong (dieu khoan Zalo Bot Platform — bao cao muc 6.3).
 * Gan vao MOI tin bot tu gui vao nhom de danh dau noi dung do AI tao.
 *
 * Ten bot lay tu goi khach (`persona.botName`) — chuoi nay DEN TAY dai ly cua khach nen
 * moi khach phai xung dung ten cua ho, khong duoc de ten khach khac trong nhan.
 */
export const AUTO_LABEL = `\n— Tin tự động từ Bot ${loadTenantConfig().persona.botName}`;
