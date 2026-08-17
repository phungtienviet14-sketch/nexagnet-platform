import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://nexagnet247.com';
  const now = new Date();

  const routes = [
    { path: '', priority: 1.0, changeFrequency: 'weekly' as const },
    // Nền tảng
    { path: '/platform', priority: 0.9, changeFrequency: 'monthly' as const },
    { path: '/platform/control', priority: 0.9, changeFrequency: 'monthly' as const },
    { path: '/platform/integrations', priority: 0.8, changeFrequency: 'monthly' as const },
    // Phòng ban
    { path: '/departments', priority: 0.9, changeFrequency: 'weekly' as const },
    { path: '/departments/executive', priority: 0.9, changeFrequency: 'weekly' as const },
    { path: '/departments/sales', priority: 0.85, changeFrequency: 'weekly' as const },
    { path: '/departments/marketing', priority: 0.8, changeFrequency: 'monthly' as const },
    { path: '/departments/customer-service', priority: 0.85, changeFrequency: 'weekly' as const },
    { path: '/departments/operations', priority: 0.85, changeFrequency: 'weekly' as const },
    { path: '/departments/finance', priority: 0.8, changeFrequency: 'monthly' as const },
    { path: '/departments/hr', priority: 0.8, changeFrequency: 'monthly' as const },
    // Sản phẩm
    { path: '/products/order-automation', priority: 0.9, changeFrequency: 'weekly' as const },
    { path: '/products/knowledge', priority: 0.85, changeFrequency: 'monthly' as const },
    { path: '/products/campaigns', priority: 0.85, changeFrequency: 'monthly' as const },
    // Ngành trọng điểm (12 ngành)
    { path: '/industries/retail-distribution', priority: 0.85, changeFrequency: 'monthly' as const },
    { path: '/industries/manufacturing', priority: 0.85, changeFrequency: 'monthly' as const },
    { path: '/industries/logistics', priority: 0.85, changeFrequency: 'monthly' as const },
    { path: '/industries/healthcare-clinic', priority: 0.85, changeFrequency: 'monthly' as const },
    { path: '/industries/spa-beauty', priority: 0.85, changeFrequency: 'monthly' as const },
    { path: '/industries/fnb-chains', priority: 0.85, changeFrequency: 'monthly' as const },
    { path: '/industries/financial-services', priority: 0.85, changeFrequency: 'monthly' as const },
    { path: '/industries/construction-interior', priority: 0.85, changeFrequency: 'monthly' as const },
    { path: '/industries/real-estate', priority: 0.85, changeFrequency: 'monthly' as const },
    { path: '/industries/professional-services', priority: 0.85, changeFrequency: 'monthly' as const },
    { path: '/industries/education', priority: 0.85, changeFrequency: 'monthly' as const },
    { path: '/industries/hospitality', priority: 0.85, changeFrequency: 'monthly' as const },
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
