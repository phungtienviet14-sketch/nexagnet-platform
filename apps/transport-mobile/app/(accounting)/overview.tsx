import { useFinanceSummary, useOfficeAccess } from '../../src/features/office/queries';
import { Bullet } from '../../src/features/office/ui/Blocks';
import { MoneySection } from '../../src/features/office/ui/MoneySection';
import { AccountButton } from '../../src/ui/AccountButton';
import { Screen } from '../../src/ui/Screen';
import { Card, Section } from '../../src/ui/Surface';
import { SyncBanner } from '../../src/ui/SyncBanner';

/**
 * "TỔNG QUAN" — sau o tien cua may chu (khong tong), bien truc tiep kem cau cong bo, cong no qua han;
 * va danh sach viec CHI LAM TREN MAY TINH, noi thang thay vi gia vo co tren dien thoai.
 */
const DESKTOP_JOBS: readonly string[] = [
  'Nhập bảng kê cây xăng và đối soát kỳ nhiên liệu',
  'Chốt số với khách, tạo lô đối soát, gắn tiền vào chứng từ',
  'Chạy lương, duyệt và trả phiếu lương',
  'Chi trả lương / hoàn ứng cho lái xe, điều chỉnh và đảo bút toán quỹ',
  'Xuất file báo cáo (CSV cho Excel)',
];

export default function AccountingOverview() {
  const { can, has } = useOfficeAccess();
  const enabled = has('transport-settlement') && can('transport.settlement.report.read');
  const finance = useFinanceSummary(enabled);
  return (
    <Screen
      title="Tổng quan"
      eyebrow="Số của máy chủ — không cộng gộp"
      trailing={<AccountButton />}
      banner={<SyncBanner />}
      onRefresh={() => void finance.refetch()}
      refreshing={finance.isRefetching}
      testID="accounting-overview"
    >
      <MoneySection query={finance} enabled={enabled} />
      <Section title="Làm trên máy tính">
        <Card rail="neutral">
          {DESKTOP_JOBS.map((job) => (
            <Bullet key={job} tone="ink">
              {job}
            </Bullet>
          ))}
        </Card>
      </Section>
    </Screen>
  );
}
