import type { Metadata } from 'next';
import { Navbar } from '../../../components/Navbar';
import { Footer } from '../../../components/Footer';
import { OrderAutomationHero } from '../../../components/products/OrderAutomationHero';
import { OrderAutomationProblem } from '../../../components/products/OrderAutomationProblem';
import { OrderAutomationFlow } from '../../../components/products/OrderAutomationFlow';
import { OrderAutomationCapabilities } from '../../../components/products/OrderAutomationCapabilities';
import { OrderAutomationProcess } from '../../../components/products/OrderAutomationProcess';
import { OrderAutomationAudit } from '../../../components/products/OrderAutomationAudit';
import { OrderAutomationComparison } from '../../../components/products/OrderAutomationComparison';
import { OrderAutomationFAQ } from '../../../components/products/OrderAutomationFAQ';
import { HomeCTA } from '../../../components/home/HomeCTA';

export const metadata: Metadata = {
  title: 'Order Automation — Tự động hóa xử lý đơn hàng B2B qua Zalo & Đa kênh | nexagnet',
  description:
    'Sản phẩm tiêu biểu của nexagnet: Tự động hóa xử lý đơn hàng từ hội thoại Zalo, đối soát SKU, kiểm tra hạn mức công nợ và đồng bộ đơn hàng về ERP với độ chính xác 100%.',
  keywords: [
    'Order Automation nexagnet',
    'Tự động hóa đơn hàng Zalo B2B',
    'AI xử lý đơn hàng hội thoại',
    'Rules engine công nợ đại lý',
    'AI Agent cho doanh nghiệp phân phối',
  ],
  alternates: {
    canonical: 'https://nexagnet247.com/products/order-automation',
  },
};

export default function OrderAutomationProductPage() {
  return (
    <div className="marketing-page-root">
      <Navbar />
      <main className="product-page-main">
        <OrderAutomationHero />
        <OrderAutomationProblem />
        <OrderAutomationFlow />
        <OrderAutomationCapabilities />
        <OrderAutomationProcess />
        <OrderAutomationAudit />
        <OrderAutomationComparison />
        <OrderAutomationFAQ />
        <HomeCTA />
      </main>
      <Footer />
    </div>
  );
}
