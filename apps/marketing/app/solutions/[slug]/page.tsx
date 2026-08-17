import { redirect } from 'next/navigation';
import { INDUSTRIES_DATA } from '../../../data/industries';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return INDUSTRIES_DATA.map((ind) => ({
    slug: ind.slug,
  }));
}

export default async function SolutionSlugPage({ params }: PageProps) {
  const { slug } = await params;
  redirect(`/industries/${slug}`);
}
