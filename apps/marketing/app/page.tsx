import { Navbar } from '../components/Navbar';
import { Hero } from '../components/Hero';
import { PlatformArchitecture } from '../components/PlatformArchitecture';
import { ModulesDeepDive } from '../components/ModulesDeepDive';
import { SecurityGovernance } from '../components/SecurityGovernance';
import { DemoCTA } from '../components/DemoCTA';
import { Footer } from '../components/Footer';

export default function HomePage() {
  return (
    <div className="marketing-page-root">
      <Navbar />
      <main>
        <Hero />
        <PlatformArchitecture />
        <ModulesDeepDive />
        <SecurityGovernance />
        <DemoCTA />
      </main>
      <Footer />
    </div>
  );
}
