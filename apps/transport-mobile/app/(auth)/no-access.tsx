import { useRouter } from 'expo-router';
import { useSession } from '../../src/session/SessionProvider';
import { ROLE_LABEL } from '../../src/session/session-types';
import { Button } from '../../src/ui/Button';
import { Screen } from '../../src/ui/Screen';
import { EmptyBlock } from '../../src/ui/States';

/**
 * Tai khoan dang nhap duoc nhung KHONG co pham vi van tai (vai `MANAGER` hien khong co thao tac
 * van tai nao — `transport-actions.ts`). Noi thang, khong hien mot ung dung trong rong.
 */
export default function NoAccessScreen() {
  const { session, signOut } = useSession();
  const router = useRouter();
  const role = session ? ROLE_LABEL[session.user.role] : '';
  return (
    <Screen title="Chưa có quyền vận tải">
      <EmptyBlock
        icon="shield-lock-outline"
        title={`Tài khoản ${session?.user.username ?? ''} (${role}) chưa được giao việc vận tải.`}
        detail="Giám đốc cần cấp quyền cho tài khoản này trong phần Quản trị tài khoản. Sau khi được cấp, đăng nhập lại."
      />
      <Button
        kind="secondary"
        label="Đăng xuất"
        icon="logout"
        onPress={() => void signOut().then(() => router.replace('/'))}
      />
    </Screen>
  );
}
