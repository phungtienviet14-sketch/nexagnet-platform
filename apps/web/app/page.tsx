import { loadTenantConfig } from '@netviet/tenant';
import { resolveExperience } from '../experiences/experience-registry';

/** Runtime composition root: tenant data selects reusable product code, never a customer fork. */
export default function HomePage() {
  const tenant = loadTenantConfig();
  const experience = resolveExperience(tenant.experience);
  const missing = experience.requiredCapabilities.filter(
    (capability) => !tenant.capabilities.includes(capability),
  );
  if (missing.length > 0) {
    throw new Error(`Experience ${experience.id} thieu capability: ${missing.join(', ')}`);
  }

  const Experience = experience.Component;
  return <Experience />;
}
