import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import type { RandomRequest } from '@/lib/types';
import type { RoutePath } from '@/lib/router';
import { useRoute } from '@/lib/router';
import { useRouteMeta } from '@/hooks/use-route-meta';
import { prefersReducedMotion } from '@/lib/helpers';
import { AmbientBackground } from '@/components/layout/AmbientBackground';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { RouteErrorBoundary } from '@/components/layout/RouteErrorBoundary';
import { BackToTop } from '@/components/ui/back-to-top';
import { HeroSection } from '@/components/sections/HeroSection';
import { SKELETON_RATIOS } from '@/components/ui/masonry-tile';
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
const StatusPage = lazy(() => import('@/features/status-page'));

/**
 * 首页「实时统计」的懒加载骨架。
 *
 * 这是首页最后一块懒加载内容。原先它挂 SectionFallback（约 256px），
 * 而真实区块是「页头 + 统计卡网格 + 趋势图」：实测桌面 907px、手机 977px，
 * 落地时页脚从 5112px 跳到 5936px（下移 824px），把用户正在看的内容整段推走。
 * 按真实结构铺骨架后，落地前后高度接近。
 */
function RealtimeStatsFallback() {
  return (
    <section className="relative z-10 px-4 py-16 sm:px-6 sm:py-20 lg:py-24">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 space-y-2">
          <div className="h-3 w-20 rounded-lg skeleton-shimmer" />
          <div className="h-8 w-40 rounded-lg skeleton-shimmer" />
          <div className="h-4 w-64 rounded-lg skeleton-shimmer" />
        </div>
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[132px] rounded-2xl skeleton-shimmer" />
          ))}
        </div>
        <div className="h-[322px] rounded-2xl skeleton-shimmer" />
      </div>
    </section>
  );
}

/**
 * /status 的懒加载骨架。
 *
 * 原先 /status 与 /docs 共用 SectionFallback（4 张卡的等比例网格）。
 * 但状态页的真实形状是「页头 + 状态横幅 + 3 张卡（sm 起 2 列、最后一张跨列）」，
 * 骨架只有 256px 高，真实内容 778px —— 实测懒加载落地时页脚从 272px 跳到 794px，
 * 首屏 CLS 0.1657，已经越过 Core Web Vitals 的 0.10 阈值。
 * 换成与真实结构同形的骨架后，落地前后高度基本一致。
 */
function StatusFallback() {
  return (
    <div className="relative z-10 mx-auto max-w-4xl px-4 pb-24 pt-[calc(var(--header-h)+32px)] sm:px-6 sm:pb-28">
      <div className="mb-7 space-y-2">
        <div className="h-3 w-20 rounded-lg skeleton-shimmer" />
        <div className="h-8 w-32 rounded-lg skeleton-shimmer" />
        <div className="h-4 w-72 rounded-lg skeleton-shimmer" />
      </div>
      <div className="mb-5 h-[76px] rounded-2xl skeleton-shimmer" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="h-[168px] rounded-2xl skeleton-shimmer" />
        <div className="h-[168px] rounded-2xl skeleton-shimmer" />
        <div className="h-[124px] rounded-2xl skeleton-shimmer sm:col-span-2" />
      </div>
      <div className="mt-4 h-4 w-64 mx-auto rounded-lg skeleton-shimmer" />
    </div>
  );
}

/**
 * /docs 的懒加载骨架。
 *
 * 真实形状是「页头 + 分段长内容」，而不是一排等高卡片。
 * 原先共用 SectionFallback（约 256px）会让页脚在落地时下移 500px 以上 ——
 * 实测 /docs 首屏 CLS 0.0801。这里用「页头 + 三个分段块」近似，
 * 让落地时的位移收敛到很小。
 */
function DocsFallback() {
  return (
    <div className="relative z-10 mx-auto max-w-6xl px-4 pb-24 pt-[calc(var(--header-h)+32px)] sm:px-6">
      <div className="mb-8 space-y-2">
        <div className="h-3 w-20 rounded-lg skeleton-shimmer" />
        <div className="h-8 w-40 rounded-lg skeleton-shimmer" />
        <div className="h-4 w-80 rounded-lg skeleton-shimmer" />
      </div>
      <div className="space-y-6">
        <div className="h-[420px] rounded-2xl skeleton-shimmer" />
        <div className="h-[280px] rounded-2xl skeleton-shimmer" />
        <div className="h-[200px] rounded-2xl skeleton-shimmer" />
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
            style={{ aspectRatio: String(SKELETON_RATIOS[i % SKELETON_RATIOS.length]) }}
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
      {/* 与 admin-page 的真实统计网格同构（同断点、同轨道宽度）：
          骨架若不一致，窄屏懒加载落地时会看到一次明显的列数重排。 */}
      <div className="mb-5 grid grid-cols-[repeat(auto-fit,minmax(144px,1fr))] gap-3">
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
    previewRef.current?.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'start',
    });
  }, []);

  return (
    <>
      <HeroSection onRequestRandom={handleRequestRandom} />
      <OnlinePreview ref={previewRef} request={randomRequest} />
      <GalleryPreview />
      <Suspense fallback={<RealtimeStatsFallback />}>
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
      <Suspense fallback={<DocsFallback />}>
        <ApiDocsSection />
      </Suspense>
      <Suspense fallback={<DocsFallback />}>
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
        {/* 路由级边界：lazy chunk 404（部署换代）只炸这一块，页头/页脚保留；
            chunk 错误还会自动刷新一次自愈。resetKey=route 让换页即清错误态。 */}
        <RouteErrorBoundary resetKey={route}>
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
          {route === '/status' && (
            <Suspense fallback={<StatusFallback />}>
              <StatusPage />
            </Suspense>
          )}
        </RouteErrorBoundary>
      </main>

      <Footer />
      <BackToTop />
    </div>
  );
}
