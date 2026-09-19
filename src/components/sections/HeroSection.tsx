import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NavLink } from '@/components/ui/nav-link';
import {
  Search,
  Shuffle,
  Sparkles,
  Image as ImageIcon,
  Tag,
  TrendingUp,
  Globe,
  Check,
  Copy as CopyIcon,
  ArrowRight,
} from 'lucide-react';
import type { Stats } from '@/lib/types';
import { fetchImagesPage, statsQueryOptions } from '@/lib/api';
import { formatNumber } from '@/lib/helpers';
import { buildAppUrl } from '@/lib/url';
import { useCopyFeedback } from '@/hooks/use-copy-feedback';

export function HeroSection({ onRequestRandom }: { onRequestRandom: (tag?: string) => void }) {
  const [tagInput, setTagInput] = useState('');
  const { copied: copiedApi, copy: copyApi } = useCopyFeedback();
  const { data: stats } = useQuery<Stats>(statsQueryOptions());
  // 首屏主视觉取自图库第一张图。
  // 走的是 /api/list（公开读接口），它不写入调用统计：
  // 既不消耗随机额度，也不会把本站自己的访问算进 /api/stats 的调用数与站点数。
  // 取不到图时交给品牌渐变兜底 —— 绝不回退到会出现占位图的第三方接口。
  const { data: heroImageUrl = '' } = useQuery<string>({
    queryKey: ['hero-image'],
    queryFn: async () => {
      try {
        const page = await fetchImagesPage({ page: 1, pageSize: 1 });
        return page.items[0]?.url ?? '';
      } catch {
        return '';
      }
    },
    staleTime: 5 * 60_000,
    retry: 0,
  });
  const [heroImageFailed, setHeroImageFailed] = useState(false);

  const apiUrl = buildAppUrl('/api/random');

  const statBadges = [
    { label: '图库图片', value: `${formatNumber(stats?.totalImages ?? 0)}`, unit: '张', icon: ImageIcon },
    { label: '标签分类', value: `${formatNumber(stats?.tags?.length ?? 0)}`, unit: '个', icon: Tag },
    { label: '今日调用', value: `${formatNumber(stats?.todayRequests ?? 0)}`, unit: '次', icon: TrendingUp },
    { label: '累计调用', value: `${formatNumber(stats?.totalRequests ?? 0)}`, unit: '次', icon: Globe },
  ];

  // 没有任何数据时不摆一排「0 张 / 0 次」出来 —— 那看起来像坏了，而不是空
  const showStatBadges =
    Boolean(stats) && ((stats?.totalImages ?? 0) > 0 || (stats?.totalRequests ?? 0) > 0);

  const handleHeroImageError = () => {
    // 主视觉加载失败时收起图片，仅保留品牌渐变，避免出现裂图。
    setHeroImageFailed(true);
  };

  const showHeroImage = Boolean(heroImageUrl) && !heroImageFailed;

  const handleSubmit = () => {
    onRequestRandom(tagInput.trim() || undefined);
  };

  const handleCopyApi = () => {
    void copyApi(apiUrl, 'API 地址已复制');
  };

  return (
    <section className="relative isolate overflow-hidden pb-16 pt-[calc(var(--header-h)+36px)] sm:pb-20 lg:pb-24">
      {/* 背景层：只保留一层极淡的点阵纸面。
          原先另有两个大尺寸线稿几何（旋转方框 + 虚线圆）与一枚 176px 的
          片假名水印 —— 降噪后全部移除：它们几乎不可见，却在每个区块之间
          留下零散的「碎线」，是首屏显脏的主因之一。 */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 hero-grid" />

      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-[1.02fr_0.98fr] lg:gap-10">
        {/* ── 左栏：文案 + 动作 ───────────────────────────────────────── */}
        <div className="text-center lg:text-left">
          <div className="hero-enter inline-flex items-center gap-1.5 rounded-full border border-brand-500/20 bg-brand-50 px-3 py-1.5 text-xs font-bold text-brand-600">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            <span>二次元图片 · EdgeOne 加速 · JSON / 302 双模式</span>
          </div>

          <p className="hero-enter kana-label mt-6" style={{ animationDelay: '40ms' }}>
            ランダム画像 API
          </p>
          <h1
            className="hero-enter mt-2 text-4xl font-bold leading-[1.1] tracking-tight text-foreground sm:text-5xl lg:text-6xl"
            style={{ animationDelay: '60ms' }}
          >
            <span className="block">二次元图片</span>
            <span className="marker-highlight inline-block">人人可用</span>
          </h1>

          <p
            className="hero-enter mx-auto mt-5 max-w-xl text-base leading-7 text-muted-foreground lg:mx-0"
            style={{ animationDelay: '120ms' }}
          >
            免费、稳定、快速的二次元随机图片 API。适合博客头图、论坛签名、Markdown 文档、应用占位图和 ACG 主题站点快速接入。
          </p>

          {/* Search Box */}
          <div className="hero-enter mt-8 w-full max-w-xl lg:max-w-none" style={{ animationDelay: '180ms' }}>
            {/* 焦点环用实心 brand-500，不降透明度：
                40% 叠在白底上合成 #99CAFF，对白底只有 1.72:1，低于 WCAG 1.4.11 要求的 3:1；
                实心 #007aff 是 4.02:1，也与全站全局焦点指示器同色同强度。 */}
            <div className="relative flex items-center overflow-hidden rounded-2xl border-2 border-ink bg-white shadow-[4px_4px_0_0_var(--color-ink)] transition-shadow focus-within:ring-2 focus-within:ring-brand-500">
              <div className="flex flex-1 items-center gap-2 px-4">
                <Search className="h-4 w-4 shrink-0 text-muted-foreground/70" aria-hidden="true" />
                <Input
                  value={tagInput}
                  onChange={(event) => setTagInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') handleSubmit();
                  }}
                  placeholder="搜索标签：acg、壁纸、头像..."
                  aria-label="搜索标签"
                  className="h-12 border-0 bg-transparent p-0 text-base shadow-none focus-visible:outline-none placeholder:text-muted-foreground/70"
                />
              </div>
              <div className="p-1.5 pr-2">
                <Button
                  className="gradient-button h-9 rounded-xl px-5 text-sm font-medium text-white"
                  onClick={handleSubmit}
                >
                  随机获取
                  <Shuffle className="ml-1.5 h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </div>
            </div>

            {/* API 地址 —— 本站最核心的动作（把地址拿走）就在首屏，不需要滚动 */}
            <button
              type="button"
              onClick={handleCopyApi}
              title="点击复制 API 地址"
              className="group mt-3 flex w-full items-center gap-2.5 rounded-xl border-2 border-ink bg-white px-3.5 py-2.5 text-left transition-colors hover:bg-brand-50"
            >
              <span className="shrink-0 rounded-md bg-success-soft px-1.5 py-0.5 font-mono text-[11px] font-bold tracking-wider text-success-ink">
                GET
              </span>
              <code className="min-w-0 flex-1 truncate font-mono text-xs text-foreground/80 sm:text-[13px]">
                {apiUrl}
              </code>
              <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground transition-colors group-hover:text-brand-600">
                {copiedApi ? (
                  <Check className="h-3.5 w-3.5 text-success-ink" aria-hidden="true" />
                ) : (
                  <CopyIcon className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {copiedApi ? '已复制' : '复制'}
              </span>
            </button>
          </div>

          {/* Stats Row */}
          {showStatBadges && (
            <div
              className="hero-enter mt-7 flex flex-wrap items-center justify-center gap-2.5 lg:justify-start"
              style={{ animationDelay: '240ms' }}
            >
              {statBadges.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center gap-2 rounded-xl border border-border bg-white px-3.5 py-2 text-xs sm:text-sm"
                >
                  <item.icon className="h-3.5 w-3.5 shrink-0 text-brand-500" aria-hidden="true" />
                  <span className="text-muted-foreground">{item.label}</span>
                  <span className="font-bold tabular-nums text-foreground">
                    {item.value}
                    <span className="ml-0.5 text-[0.85em] font-medium text-muted-foreground">
                      {item.unit}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── 右栏：图库主视觉卡（可点击进入图库 + 浮动状态卡） ───────────── */}
        <div className="hero-enter relative mx-auto w-full max-w-md lg:mx-0 lg:max-w-none" style={{ animationDelay: '120ms' }}>
          {/* 降噪：移除卡后虚线框 —— 主卡自带 2px 墨线 + 硬投影，
              虚线框叠在外面形成一圈「双线」，视觉上显脏。 */}

          {/* 整张主视觉即通往图库的入口：悬停时图片轻微放大、
              「浏览图库」箭头右移并加深底色，给出可点击的反馈。 */}
          <NavLink
            to="/gallery"
            className="hero-zoom group relative block overflow-hidden rounded-3xl border-2 border-ink bg-white p-1.5 shadow-[6px_6px_0_0_var(--color-ink)] transition-shadow duration-300 hover:shadow-[9px_9px_0_0_var(--color-ink)]"
          >
            <div className="halftone-dots relative h-[400px] overflow-hidden rounded-[18px] bg-brand-500 sm:h-[440px]">
              {showHeroImage ? (
                <img
                  src={heroImageUrl}
                  alt="派次元图库精选图片"
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 motion-safe:group-hover:scale-[1.04]"
                  loading="eager"
                  {...{ fetchpriority: 'high' }}
                  onError={handleHeroImageError}
                />
              ) : (
                // 无图 / 加载失败：品牌渐变兜底，配 Logo 与文案
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/95">
                  <ImageIcon className="h-10 w-10 opacity-80" aria-hidden="true" />
                  <p className="text-sm font-medium">派次元图库</p>
                </div>
              )}

              {/* 底部信息渐隐 + 进入图库提示 */}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/55 to-transparent" />
              <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-white/90">精选图库 · 持续更新</span>
                <span className="sticker-chip inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold">
                  浏览图库
                  <ArrowRight
                    className="h-3 w-3 transition-transform duration-300 motion-safe:group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </span>
              </div>
            </div>
          </NavLink>

          {/* 右下角浮动状态卡：浮在主卡之外，制造层次。
              刻意不放具体数字，避免与左栏统计条重复；
              pointer-events-none 保证它不会遮住下方图库入口的点击。 */}
          <div className="hero-float-slow pointer-events-none absolute -bottom-5 -right-3 hidden items-center gap-2.5 rounded-2xl border-2 border-ink bg-white px-4 py-3 shadow-[4px_4px_0_0_var(--color-ink)] sm:flex">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success" />
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-sm font-semibold text-foreground">实时可用</span>
              <span className="text-[11px] text-muted-foreground">无需申请 Key</span>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
