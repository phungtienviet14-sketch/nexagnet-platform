import { ThreadType, type Message } from 'zca-js';

export type ZcaMessageOwnership =
  | 'process_with_zca'
  | 'yield_to_bot'
  | 'ignore_official_bot'
  | 'identity_unavailable';

interface ZcaOwnershipData {
  uidFrom?: string;
  mentions?: Array<{ uid?: string }>;
}

/**
 * Chon duy nhat mot owner cho tin ma tai khoan zca nhin thay trong hybrid mode.
 * Chi metadata native `mentions[].uid` duoc coi la tag; khong suy doan tu chuoi hien thi.
 */
export function decideZcaMessageOwnership(
  message: Message,
  officialBotId: string | null,
): ZcaMessageOwnership {
  const data = message.data as ZcaOwnershipData;
  // Mat identity Bot -> FAIL CLOSED tuyet doi (ke hoach §2.1.6). Khong co UID Bot thi ta khong
  // phan biet duoc tin do chinh Bot gui, cung khong chac Bot co nhan tin nay hay khong -> im lang
  // con hon rui ro hai bot cung tra loi mot tin.
  if (!officialBotId) return 'identity_unavailable';

  if (data.uidFrom === officialBotId) return 'ignore_official_bot';

  if (
    message.type === ThreadType.Group &&
    data.mentions?.some((mention) => mention.uid === officialBotId)
  ) {
    return 'yield_to_bot';
  }
  return 'process_with_zca';
}
