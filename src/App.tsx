import { lazy, Suspense, useCallback, useRef, useState } from 'react';
import type { RandomRequest } from '@/lib/types';
import { useRoute } from '@/lib/router';
import { useRouteMeta } from '@/hooks/use-route-meta';
import { AmbientBackground } from '@/components/layout/AmbientBackground';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { BackToTop } from '@/components/ui/back-to-top';
import { HeroSection } from '@/components/sections/HeroSection';
import { OnlinePreview } from '@/components/sections/OnlinePreview';
import { GalleryPreview } from '@/components/sections/GalleryPreview';
import { DocsTeaser } from '@/components/sections/DocsTeaser';
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
const GalleryBrowse = lazy(() => import('@/features/gallery-browse'));
const AdminPage = lazy(() => import('@/features/admin-page'));

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

function GalleryFallback() {
  return (
    <div className="relative z-10 mx-auto max-w-6xl px-4 pb-24 pt-[calc(var(--header-h)+32px)] sm:px-6">
      <div className="mb-7 space-y-2">
        <div className="h-3 w-20 rounded-lg skeleton-shimmer" />
        <div className="h-8 w-40 rounded-xl skeleton-shimmer" />
        <div className="h-4 w-64 rounded-xl skeleton-shimmer" />
      </div>
      <div className="columns-2 gap-3 sm:columns-3 sm:gap-4 lg:columns-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="mb-3 break-inside-avoid rounded-2xl skeleton-shimmer sm:mb-4"
            style={{ aspectRatio: String(i % 3 === 0 ? 16 / 9 : i % 3 === 1 ? 3 / 2 : 16 / 10) }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * 首页。
 *
 * `randomRequest` 是首页内部唯一跨区块的信号：Hero 的搜索/随机按钮写它，
 * OnlinePreview 读它。原先靠 `document.getElementById('preview')` +
 * `window.dispatchEvent(new CustomEvent(...))` 广播，组件之间没有任何显式契约。
 */
function HomePage() {
  const previewRef = useRef<HTMLElement>(null);
  const [randomRequest, setRandomRequest] = useState<RandomRequest>({ token: 0 });

  const handleRequestRandom = useCallback((tag?: string) => {
    setRandomRequest((prev) => ({ tag, token: prev.token + 1 }));
    previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  return (
    <>
      <HeroSection onRequestRandom={handleRequestRandom} />
      <OnlinePreview ref={previewRef} request={randomRequest} />
      <GalleryPreview />
      <Suspense fallback={<SectionFallback />}>
        <RealtimeStats />
      </Suspense>
      <WhyChoose />
      <DocsTeaser />
      <ImageSubmission />
      <Changelog />
    </>
  );
}

function DocsPage() {
  return (
    <section className="pb-2 pt-[calc(var(--header-h)+16px)]">
      <Suspense fallback={<SectionFallback />}>
        <ApiDocsSection />
      </Suspense>
      <Suspense fallback={<SectionFallback />}>
        <SecurityFeatures />
      </Suspense>
    </section>
  );
}

export default function App() {
  const route = useRoute();
  useRouteMeta();

  return (
    <div id="top" className="relative min-h-screen overflow-x-hidden page-bg">
      <AmbientBackground />
      <Header />

      <main>
        {route === '/' && <HomePage />}
        {route === '/gallery' && (
          <Suspense fallback={<GalleryFallback />}>
            <GalleryBrowse />
          </Suspense>
        )}
        {route === '/admin' && (
          <Suspense fallback={<GalleryFallback />}>
            <AdminPage />
          </Suspense>
        )}
        {route === '/docs' && <DocsPage />}
      </main>

      <Footer />
      <BackToTop />
    </div>
  );
}
