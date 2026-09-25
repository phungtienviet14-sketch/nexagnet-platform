import { AccountButton } from '../../src/ui/AccountButton';
import { Screen } from '../../src/ui/Screen';
import { EmptyBlock } from '../../src/ui/States';
import { SyncBanner } from '../../src/ui/SyncBanner';

export default function Placeholder() {
  return (
    <Screen title="Đơn hàng" trailing={<AccountButton />} banner={<SyncBanner />}>
      <EmptyBlock icon="package-variant-closed" title="Đang dựng màn này" />
    </Screen>
  );
}
