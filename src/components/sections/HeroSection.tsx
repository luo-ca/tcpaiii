import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Shuffle, Sparkles, Image, Tag, TrendingUp, Globe } from 'lucide-react';
import type { Stats } from '@/lib/types';
import { HERO_FALLBACK_IMAGE_URL } from '@/lib/constants';
import { fetchRandomImageWithFallback, fetchStats } from '@/lib/api';
import { formatNumber } from '@/lib/helpers';

export function HeroSection({ onShuffle }: { onShuffle: () => void }) {
  const [tagInput, setTagInput] = useState('');
  const { data: stats } = useQuery<Stats>({
    queryKey: ['stats'],
    queryFn: fetchStats,
    refetchInterval: 15_000,
    staleTime: 15_000,
  });
  const [heroImageUrl, setHeroImageUrl] = useState(HERO_FALLBACK_IMAGE_URL);

  const statBadges = [
    { label: '图库图片', value: `${formatNumber(stats?.totalImages ?? 0)} 张`, icon: Image },
    { label: '标签分类', value: `${formatNumber(stats?.tags?.length ?? 0)} 个`, icon: Tag },
    { label: '今日调用', value: `${formatNumber(stats?.todayRequests ?? 0)} 次`, icon: TrendingUp },
    { label: '累计调用', value: `${formatNumber(stats?.totalRequests ?? 0)} 次`, icon: Globe },
  ];

  useEffect(() => {
    let cancelled = false;

    fetchRandomImageWithFallback()
      .then((image) => {
        if (!cancelled && image.url) {
          setHeroImageUrl(image.url);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHeroImageUrl(HERO_FALLBACK_IMAGE_URL);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleHeroImageError = () => {
    // If even the fallback image fails (blocked CDN/AI endpoint), keep the
    // gradient overlay + copy visible instead of a broken-image icon.
    setHeroImageUrl((current) =>
      current === HERO_FALLBACK_IMAGE_URL ? '' : HERO_FALLBACK_IMAGE_URL,
    );
  };

  const handleSubmit = () => {
    const keyword = tagInput.trim();
    const preview = document.getElementById('preview');
    preview?.scrollIntoView({ behavior: 'smooth' });
    if (keyword) {
      window.dispatchEvent(new CustomEvent('paiii:select-tag', { detail: keyword }));
    }
    onShuffle();
  };

  return (
    <section className="relative isolate min-h-[640px] overflow-hidden pt-20 sm:pt-24">
      {/* Hero Background */}
      {heroImageUrl ? (
        <img
          src={heroImageUrl}
          alt="派次元随机图片背景"
          className="absolute inset-0 -z-20 h-full w-full object-cover"
          loading="eager"
          fetchPriority="high"
          onError={handleHeroImageError}
        />
      ) : null}
      {/* Gradient Overlay */}
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(4,8,20,0.40)_0%,rgba(4,8,20,0.68)_60%,rgba(4,8,20,0.85)_100%)]" />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_60%_50%_at_50%_30%,rgba(59,100,246,0.20),transparent)]" />
      <div className="absolute inset-x-0 bottom-0 -z-10 h-48 bg-gradient-to-t from-background via-background/60 to-transparent" />

      {/* Floating particles (decorative) */}
      <div className="absolute top-1/4 left-1/4 -z-10 w-1.5 h-1.5 rounded-full bg-blue-400/40 blur-[0px] animate-[float_5s_ease-in-out_infinite]" />
      <div className="absolute top-1/3 right-1/3 -z-10 w-1 h-1 rounded-full bg-purple-400/40 animate-[float_7s_ease-in-out_infinite_1s]" />
      <div className="absolute top-2/3 right-1/4 -z-10 w-2 h-2 rounded-full bg-cyan-400/30 animate-[float_6s_ease-in-out_infinite_2s]" />

      <div className="mx-auto flex min-h-[580px] max-w-6xl flex-col items-center justify-center px-4 py-16 text-center sm:px-6">
        {/* Eyebrow Badge */}
        <div className="highlight-badge mb-6">
          <Sparkles className="h-3.5 w-3.5 text-sky-200" />
          <span>二次元图片 · EdgeOne 加速 · JSON / 302 双模式</span>
        </div>

        {/* Main Title */}
        <h1 className="max-w-4xl text-5xl font-black tracking-tight text-white sm:text-6xl md:text-7xl leading-[1.08]">
          <span className="block">anime images</span>
          <span className="block text-transparent bg-clip-text bg-gradient-to-r from-sky-300 via-blue-300 to-violet-300">
            for anyone
          </span>
        </h1>

        <p className="mt-5 max-w-xl text-base leading-7 text-white/75 sm:text-[17px]">
          免费、稳定、快速的二次元随机图片 API。适合博客头图、论坛签名、Markdown 文档、应用占位图和 ACG 主题站点快速接入。
        </p>

        {/* Search Box */}
        <div className="mt-8 w-full max-w-xl">
          <div className="relative flex items-center rounded-2xl bg-white/95 shadow-[0_8px_40px_rgba(0,0,0,0.25)] border border-white/20 overflow-hidden backdrop-blur-xl">
            <div className="flex flex-1 items-center gap-2 px-4">
              <Search className="h-4 w-4 shrink-0 text-slate-400" />
              <Input
                value={tagInput}
                onChange={(event) => setTagInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleSubmit();
                }}
                placeholder="搜索标签：acg、壁纸、头像..."
                className="h-12 border-0 bg-transparent p-0 text-base shadow-none focus-visible:ring-0 placeholder:text-slate-400/80"
              />
            </div>
            <div className="p-1.5 pr-2">
              <Button
                className="h-9 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 px-5 text-white text-sm font-medium shadow-md shadow-blue-600/25 hover:shadow-blue-600/40 transition-all duration-200 hover:-translate-y-0.5"
                onClick={handleSubmit}
              >
                随机获取
                <Shuffle className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Stats Row */}
        <div className="mt-7 flex max-w-3xl flex-wrap items-center justify-center gap-2.5">
          {statBadges.map((item) => (
            <div
              key={item.label}
              className="flex items-center gap-2 rounded-xl border border-white/14 bg-black/25 px-3.5 py-2 text-xs text-white/88 backdrop-blur-lg sm:text-sm"
            >
              <item.icon className="h-3.5 w-3.5 text-white/55 shrink-0" />
              <span className="text-white/55">{item.label}</span>
              <span className="font-bold text-white">{item.value}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
