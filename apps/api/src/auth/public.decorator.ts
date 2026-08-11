import { SetMetadata, type CustomDecorator } from '@nestjs/common';

/** Khoa metadata danh dau route cong khai (khong can x-api-key). */
export const IS_PUBLIC_KEY = 'netviet:isPublic';

/**
 * Danh dau 1 route (hoac ca controller) la CONG KHAI — bo qua ApiKeyGuard.
 * Dung TIET KIEM: mac dinh moi route deu phai co key. Hien chi /health duoc mo
 * (de load balancer / uptime check do duoc ma khong phai giu secret).
 */
export const Public = (): CustomDecorator<string> => SetMetadata(IS_PUBLIC_KEY, true);
