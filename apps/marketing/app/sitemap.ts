import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://nexagnet247.com';
  const now = new Date();

  const routes = [
    { path: '', priority: 1.0, changeFrequency: 'weekly' as const },
    // Sản phẩm
    { path: '/products/order-automation', priority: 0.9, changeFrequency: 'weekly' as const },
    // Giải pháp
    { path: '/solutions/sales', priority: 0.8, changeFrequency: 'monthly' as const },
    { path: '/solutions/customer-service', priority: 0.8, changeFrequency: 'monthly' as const },
    { path: '/solutions/operations', priority: 0.8, changeFrequency: 'monthly' as const },
    { path: '/solutions/internal-knowledge', priority: 0.7, changeFrequency: 'monthly' as const },
    // Ngành
    { path: '/industries/retail-distribution', priority: 0.8, changeFrequency: 'monthly' as const },
    { path: '/industries/spa-beauty', priority: 0.8, changeFrequency: 'monthly' as const },
    { path: '/industries/real-estate', priority: 0.8, changeFrequency: 'monthly' as const },
    { path: '/industries/education', priority: 0.7, changeFrequency: 'monthly' as const },
    { path: '/industries/hospitality', priority: 0.7, changeFrequency: 'monthly' as const },
    // Nền tảng
    { path: '/platform', priority: 0.9, changeFrequency: 'monthly' as const },
    { path: '/platform/control', priority: 0.9, changeFrequency: 'monthly' as const },
    { path: '/platform/integrations', priority: 0.8, changeFrequency: 'monthly' as const },
    // Tài nguyên & Pháp lý
    { path: '/resources/faq', priority: 0.8, changeFrequency: 'monthly' as const },
    { path: '/resources/roadmap', priority: 0.8, changeFrequency: 'monthly' as const },
    { path: '/privacy', priority: 0.5, changeFrequency: 'yearly' as const },
  ];

  return routes.map((r) => ({
    url: `${baseUrl}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));
}
