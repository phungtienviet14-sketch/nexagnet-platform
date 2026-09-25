import { AccountButton } from '../../src/ui/AccountButton';
import { Screen } from '../../src/ui/Screen';
import { EmptyBlock } from '../../src/ui/States';
import { SyncBanner } from '../../src/ui/SyncBanner';

export default function Placeholder() {
  return (
    <Screen title="Cần xử lý" trailing={<AccountButton />} banner={<SyncBanner />}>
      <EmptyBlock icon="bell-alert-outline" title="Đang dựng màn này" />
    </Screen>
  );
}
