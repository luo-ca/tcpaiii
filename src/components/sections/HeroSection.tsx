import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Search,
  Shuffle,
  Sparkles,
  Image,
  Tag,
  TrendingUp,
  Globe,
  Check,
  Copy as CopyIcon,
} from 'lucide-react';
import type { Stats } from '@/lib/types';
import { fetchImagesPage, fetchStats } from '@/lib/api';
import { formatNumber } from '@/lib/helpers';
import { buildAppUrl } from '@/lib/url';
import { useCopyFeedback } from '@/hooks/use-copy-feedback';

export function HeroSection({ onRequestRandom }: { onRequestRandom: (tag?: string) => void }) {
  const [tagInput, setTagInput] = useState('');
  const { copied: copiedApi, copy: copyApi } = useCopyFeedback();
  const { data: stats } = useQuery<Stats>({
    queryKey: ['stats'],
    queryFn: fetchStats,
    refetchInterval: 15_000,
    staleTime: 15_000,
  });
  // 首屏主视觉取自图库第一张图。
  // 走的是 /api/list（公开读接口），它不写入调用统计：
  // 既不消耗随机额度，也不会把本站自己的访问算进 /api/stats 的调用数与站点数。
  // 取不到图时保持空串，由品牌渐变兜底 —— 绝不回退到会出现占位图的第三方接口。
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
    { label: '图库图片', value: `${formatNumber(stats?.totalImages ?? 0)} 张`, icon: Image },
    { label: '标签分类', value: `${formatNumber(stats?.tags?.length ?? 0)} 个`, icon: Tag },
    { label: '今日调用', value: `${formatNumber(stats?.todayRequests ?? 0)} 次`, icon: TrendingUp },
    { label: '累计调用', value: `${formatNumber(stats?.totalRequests ?? 0)} 次`, icon: Globe },
  ];

  // 没有任何数据时不摆一排「0 张 / 0 次」出来 —— 那看起来像坏了，而不是空
  const showStatBadges =
    Boolean(stats) && ((stats?.totalImages ?? 0) > 0 || (stats?.totalRequests ?? 0) > 0);

  const handleHeroImageError = () => {
    // 图片加载失败时收起图片，仅保留品牌渐变与文案，避免出现裂图。
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
    <section className="relative isolate min-h-[640px] overflow-hidden pt-[calc(var(--header-h)+24px)]">
      {/* Hero Background
          注意：React 18 不识别驼峰写的 fetchPriority（那是 React 19 的 API），
          大写写法会被丢弃并触发控制台告警，只有小写属性名才会真的落到 DOM 上。 */}
      {showHeroImage ? (
        <img
          src={heroImageUrl}
          alt="派次元图库精选图片"
          className="absolute inset-0 -z-20 h-full w-full object-cover"
          loading="eager"
          {...{ fetchpriority: 'high' }}
          onError={handleHeroImageError}
        />
      ) : null}
      {/* Gradient Overlay — 使用中性深色 token，避免与浅色内容区产生色相断裂
          主视觉取的是「随机」图库图，亮度不可控：遇到接近纯白的图时，
          纯白正文会直接糊掉。所以这里叠三层保证可读性：
          1) 垂直压暗（底部更重，衔接浅色内容区）
          2) 文本区中心径向暗场（只压文字所在区域，边缘的二次元画面仍保留）
          3) 品牌色氛围光 */}
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(11,18,32,0.40)_0%,rgba(11,18,32,0.54)_45%,rgba(11,18,32,0.82)_100%)]" />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_72%_58%_at_50%_46%,rgba(11,18,32,0.46),rgba(11,18,32,0.06)_72%)]" />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_60%_50%_at_50%_30%,rgba(0,122,255,0.20),transparent)]" />
      <div className="absolute inset-x-0 bottom-0 -z-10 h-48 bg-gradient-to-t from-background via-background/60 to-transparent" />

      {/* Floating particles (decorative) */}
      <div
        aria-hidden="true"
        className="animate-float absolute left-1/4 top-1/4 -z-10 h-1.5 w-1.5 rounded-full bg-brand-300/60"
        style={{ animationDuration: '5s' }}
      />
      <div
        aria-hidden="true"
        className="animate-float absolute right-1/3 top-1/3 -z-10 h-1 w-1 rounded-full bg-iris-300/60"
        style={{ animationDuration: '7s', animationDelay: '1s' }}
      />
      <div
        aria-hidden="true"
        className="animate-float absolute right-1/4 top-2/3 -z-10 h-2 w-2 rounded-full bg-brand-300/50"
        style={{ animationDuration: '6s', animationDelay: '2s' }}
      />

      <div className="mx-auto flex min-h-[580px] max-w-6xl flex-col items-center justify-center px-4 py-16 text-center sm:px-6">
        {/* Eyebrow Badge */}
        <div className="hero-enter highlight-badge mb-6">
          <Sparkles className="h-3.5 w-3.5 text-brand-200" aria-hidden="true" />
          <span>二次元图片 · EdgeOne 加速 · JSON / 302 双模式</span>
        </div>

        {/* Main Title */}
        <h1
          className="hero-enter max-w-4xl text-5xl font-bold tracking-tight text-white [text-shadow:0_2px_28px_rgba(11,18,32,0.55)] sm:text-6xl md:text-7xl leading-[1.08]"
          style={{ animationDelay: '60ms' }}
        >
          <span className="block">二次元图片</span>
          <span className="block text-transparent bg-clip-text bg-gradient-to-r from-brand-300 to-iris-300 drop-shadow-[0_2px_18px_rgba(11,18,32,0.45)]">
            人人可用
          </span>
        </h1>

        <p
          className="hero-enter mt-5 max-w-xl text-base leading-7 text-white/90 [text-shadow:0_1px_14px_rgba(11,18,32,0.65)] sm:text-[17px]"
          style={{ animationDelay: '120ms' }}
        >
          免费、稳定、快速的二次元随机图片 API。适合博客头图、论坛签名、Markdown 文档、应用占位图和 ACG 主题站点快速接入。
        </p>

        {/* Search Box */}
        <div className="hero-enter mt-8 w-full max-w-xl" style={{ animationDelay: '180ms' }}>
          {/* 焦点环用实心 brand-500，不降透明度：
              40% 叠在白底上合成 #99CAFF，对白底只有 1.72:1，低于 WCAG 1.4.11 要求的 3:1；
              实心 #007aff 是 4.02:1，也与全站全局焦点指示器同色同强度。 */}
          <div className="relative flex items-center rounded-2xl bg-white/95 shadow-lg border border-white/20 overflow-hidden backdrop-blur-xl transition-shadow focus-within:ring-2 focus-within:ring-brand-500">
            <div className="flex flex-1 items-center gap-2 px-4">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground/70" aria-hidden="true" />
              <Input
                value={tagInput}
                onChange={(event) => setTagInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleSubmit();
                }}
                placeholder="搜索标签：acg、壁纸、头像..."
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
        </div>

        {/* API 地址 —— 本站最核心的动作（把地址拿走）就在首屏，不需要滚动 */}
        <div className="hero-enter mt-3 w-full max-w-xl" style={{ animationDelay: '240ms' }}>
          <button
            type="button"
            onClick={handleCopyApi}
            title="点击复制 API 地址"
            className="group flex w-full items-center gap-2.5 rounded-xl border border-white/15 bg-black/35 px-3.5 py-2.5 text-left backdrop-blur-lg transition-colors hover:bg-black/45"
          >
            <span className="shrink-0 rounded-md bg-white/15 px-1.5 py-0.5 font-mono text-[11px] font-bold tracking-wider text-emerald-300">
              GET
            </span>
            <code className="min-w-0 flex-1 truncate font-mono text-xs text-white/90 sm:text-[13px]">
              {apiUrl}
            </code>
            <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-white/70 transition-colors group-hover:text-white">
              {copiedApi ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
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
            className="hero-enter mt-7 flex max-w-3xl flex-wrap items-center justify-center gap-2.5"
            style={{ animationDelay: '300ms' }}
          >
            {statBadges.map((item) => (
              <div
                key={item.label}
                className="flex items-center gap-2 rounded-xl border border-white/15 bg-black/35 px-3.5 py-2 text-xs text-white backdrop-blur-lg sm:text-sm"
              >
                <item.icon className="h-3.5 w-3.5 shrink-0 text-white/65" aria-hidden="true" />
                <span className="text-white/65">{item.label}</span>
                <span className="font-bold text-white tabular-nums">{item.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
