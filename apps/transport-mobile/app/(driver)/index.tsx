import { AccountButton } from '../../src/ui/AccountButton';
import { Screen } from '../../src/ui/Screen';
import { EmptyBlock } from '../../src/ui/States';
import { SyncBanner } from '../../src/ui/SyncBanner';

export default function Placeholder() {
  return (
    <Screen title="Việc" trailing={<AccountButton />} banner={<SyncBanner />}>
      <EmptyBlock icon="truck-fast-outline" title="Đang dựng màn này" />
    </Screen>
  );
}
