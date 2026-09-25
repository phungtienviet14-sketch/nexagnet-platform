import { Redirect } from 'expo-router';
import { useSession } from '../src/session/SessionProvider';
import { experienceForRole } from '../src/session/session-types';

/**
 * CUA VAO — chon trai nghiem theo VAI TRO MAY CHU tra. Khong co man chon vai: mot tai khoan la
 * mot vai, va doi vai la viec cua van phong (#395), khong phai cua nguoi cam may.
 */
export default function Entry() {
  const { status, session } = useSession();
  if (status === 'booting') return null;
  if (status === 'needsServer') return <Redirect href="/(auth)/server" />;
  if (status === 'signedOut' || !session) return <Redirect href="/(auth)/login" />;
  switch (experienceForRole(session.user.role)) {
    case 'driver':
      return <Redirect href="/(driver)" />;
    case 'director':
      return <Redirect href="/(director)" />;
    case 'accounting':
      return <Redirect href="/(accounting)" />;
    case 'none':
      return <Redirect href="/(auth)/no-access" />;
  }
}
