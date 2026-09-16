import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import type { RandomRequest } from '@/lib/types';
import type { RoutePath } from '@/lib/router';
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
        {Array.from({ length: 24 }).map((_, i) => (
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
 * `/admin` 的懒加载骨架。
 *
 * 不能复用 `GalleryFallback`：那是图库的瀑布流形状（多列、任意比例），
 * 而后台是「页头 + 密钥卡 + 三张统计卡 + 三列等比例网格」——
 * 骨架形状对不上，懒加载落地时会看到一次明显的重排。
 */
function AdminFallback() {
  return (
    <div className="relative z-10 mx-auto max-w-6xl px-4 pb-24 pt-[calc(var(--header-h)+32px)] sm:px-6 sm:pb-28">
      <div className="mb-7 flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-3 w-20 rounded-lg skeleton-shimmer" />
          <div className="h-8 w-32 rounded-lg skeleton-shimmer" />
          <div className="h-4 w-48 rounded-lg skeleton-shimmer" />
        </div>
        <div className="h-10 w-28 rounded-xl skeleton-shimmer" />
      </div>
      <div className="mb-5 h-24 rounded-2xl skeleton-shimmer" />
      <div className="mb-5 grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-[68px] rounded-2xl skeleton-shimmer" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="aspect-video rounded-2xl skeleton-shimmer" />
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
    <section className="pb-14 pt-[calc(var(--header-h)+16px)] sm:pb-20">
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

  const mainRef = useRef<HTMLElement>(null);
  // 记住上一次路由，只在「真的换页」时移动焦点——首次挂载不抢焦点，
  // 否则会打断浏览器对地址栏/首屏的默认处理。
  const prevRouteRef = useRef<RoutePath>(route);

  useEffect(() => {
    if (prevRouteRef.current === route) return;
    prevRouteRef.current = route;
    // 抽到下一帧：目标页可能是 lazy 的，等它挂载完再聚焦，落点才稳定。
    const id = requestAnimationFrame(() => {
      mainRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [route]);

  return (
    <div id="top" className="relative overflow-x-hidden page-bg">
      <AmbientBackground />
      <Header />

      {/* 跳到主内容：键盘/读屏用户不必每页从头 Tab 过整条顶栏。
          平时视觉隐藏，获得焦点时浮到左上角。 */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-xl focus:border-2 focus:border-ink focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:shadow-[3px_3px_0_0_var(--color-ink)] focus:outline-none focus:ring-2 focus:ring-brand-500"
      >
        跳到主内容
      </a>

      <main id="main" ref={mainRef} tabIndex={-1} className="focus:outline-none">
        {route === '/' && <HomePage />}
        {route === '/gallery' && (
          <Suspense fallback={<GalleryFallback />}>
            <GalleryBrowse />
          </Suspense>
        )}
        {route === '/admin' && (
          <Suspense fallback={<AdminFallback />}>
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
