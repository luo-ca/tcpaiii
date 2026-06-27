import { lazy, Suspense, useState } from 'react';
import type { AppTab } from '@/lib/types';
import { AmbientBackground } from '@/components/layout/AmbientBackground';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { HeroSection } from '@/components/sections/HeroSection';
import { OnlinePreview } from '@/components/sections/OnlinePreview';
import { WhyChoose } from '@/components/sections/WhyChoose';
import { ImageSubmission } from '@/components/sections/ImageSubmission';
import { Changelog } from '@/components/sections/Changelog';

// Lazy-load heavy sections to reduce initial bundle size
const RealtimeStats = lazy(() =>
  import('@/components/sections/RealtimeStats').then((m) => ({ default: m.RealtimeStats })),
);
const ApiDocsSection = lazy(() =>
  import('@/components/sections/ApiDocsSection').then((m) => ({ default: m.ApiDocsSection })),
);
const SecurityFeatures = lazy(() =>
  import('@/components/sections/SecurityFeatures').then((m) => ({ default: m.SecurityFeatures })),
);
const GalleryPage = lazy(() => import('@/features/gallery-page'));

function SectionFallback() {
  return (
    <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 py-16">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-32 rounded-2xl skeleton-shimmer" />
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('random');
  const [shuffleTrigger, setShuffleTrigger] = useState(0);

  const handleTabChange = (tab: AppTab) => {
    setActiveTab(tab);
    if (tab === 'random') setShuffleTrigger(0);
  };

  return (
    <div id="top" className="relative min-h-screen overflow-x-hidden page-bg">
      <AmbientBackground />
      <Header activeTab={activeTab} onTabChange={handleTabChange} />

      <main>
        {activeTab === 'random' && (
          <>
            <HeroSection onShuffle={() => setShuffleTrigger((t) => t + 1)} />
            <OnlinePreview shuffleTrigger={shuffleTrigger} />
            <Suspense fallback={<SectionFallback />}>
              <RealtimeStats />
            </Suspense>
            <WhyChoose />
            <Suspense fallback={<SectionFallback />}>
              <ApiDocsSection />
            </Suspense>
            <ImageSubmission />
            <Changelog />
          </>
        )}

        {activeTab === 'gallery' && (
          <Suspense
            fallback={
              <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-24 sm:py-28">
                <div className="mb-8 flex items-start justify-between gap-4">
                  <div className="space-y-2">
                    <div className="h-8 w-36 rounded-xl skeleton-shimmer" />
                    <div className="h-4 w-52 rounded-xl skeleton-shimmer" />
                  </div>
                  <div className="h-10 w-28 rounded-xl skeleton-shimmer" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div
                      key={i}
                      className="aspect-video rounded-2xl skeleton-shimmer"
                      style={{ animationDelay: `${i * 0.1}s` }}
                    />
                  ))}
                </div>
              </div>
            }
          >
            <GalleryPage />
          </Suspense>
        )}

        {activeTab === 'docs' && (
          <section className="py-2">
            <Suspense fallback={<SectionFallback />}>
              <ApiDocsSection />
            </Suspense>
            <Suspense fallback={<SectionFallback />}>
              <SecurityFeatures />
            </Suspense>
          </section>
        )}
      </main>

      <Footer />
    </div>
  );
}
