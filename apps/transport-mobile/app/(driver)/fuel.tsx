import { AccountButton } from '../../src/ui/AccountButton';
import { Screen } from '../../src/ui/Screen';
import { EmptyBlock } from '../../src/ui/States';
import { SyncBanner } from '../../src/ui/SyncBanner';

export default function Placeholder() {
  return (
    <Screen title="Nhiên liệu" trailing={<AccountButton />} banner={<SyncBanner />}>
      <EmptyBlock icon="gas-station-outline" title="Đang dựng màn này" />
    </Screen>
  );
}
