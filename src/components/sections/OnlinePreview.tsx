import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Camera,
  ExternalLink,
  RefreshCw,
  Clock,
  Check,
  Copy as CopyIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Stats } from '@/lib/types';
import { fetchRandomImage, fetchStats } from '@/lib/api';
import { getErrorMessage, copyText } from '@/lib/helpers';
import { buildAppUrl } from '@/lib/url';

export function OnlinePreview({ shuffleTrigger }: { shuffleTrigger: number }) {
  const [selectedTag, setSelectedTag] = useState<string | undefined>();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageTitle, setImageTitle] = useState<string>('');
  const [imageTags, setImageTags] = useState<string[]>([]);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedApi, setCopiedApi] = useState(false);
  const queryClient = useQueryClient();
  const prevTriggerRef = useRef(0);
  const initialLoadRef = useRef(false);
  const requestIdRef = useRef(0);
  const [imageKey, setImageKey] = useState(0);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const randomApiUrl = buildAppUrl(
    `/api/random${selectedTag ? `?tag=${encodeURIComponent(selectedTag)}` : ''}`,
  );

  const { data: stats } = useQuery<Stats>({
    queryKey: ['stats'],
    queryFn: fetchStats,
    refetchInterval: 15_000,
    staleTime: 15_000,
  });

  const shuffleImage = useCallback(
    async (tag?: string) => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      setImageLoading(true);
      setPreviewError(null);
      try {
        const img = await fetchRandomImage(tag);
        if (requestId !== requestIdRef.current) return;
        setImageLoaded(false);
        setImageKey((key) => key + 1);
        setImageUrl(img.url);
        setImageTitle(img.title);
        setImageTags(img.tags);
        queryClient.invalidateQueries({ queryKey: ['stats'] });
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        const message = getErrorMessage(err, '获取随机图片失败');
        setPreviewError(message);
        toast.error(message);
        setImageLoading(false);
      }
    },
    [queryClient],
  );

  const handleSelectTag = useCallback(
    (tag?: string) => {
      setSelectedTag(tag);
      shuffleImage(tag);
    },
    [shuffleImage],
  );

  useEffect(() => {
    if (initialLoadRef.current) return;
    initialLoadRef.current = true;
    shuffleImage();
  }, [shuffleImage]);

  useEffect(() => {
    if (shuffleTrigger > prevTriggerRef.current) {
      prevTriggerRef.current = shuffleTrigger;
      shuffleImage(selectedTag);
    }
  }, [shuffleTrigger, shuffleImage, selectedTag]);

  const handleImageLoad = () => {
    setImageLoading(false);
    setImageLoaded(true);
    setPreviewError(null);
  };

  const handleImageError = () => {
    const message = '图片加载失败，请重试';
    setImageLoading(false);
    setImageLoaded(false);
    setPreviewError(message);
    toast.error(message);
  };

  const copyUrl = async () => {
    if (!imageUrl) return;
    const success = await copyText(imageUrl, '图片地址已复制');
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const copyApiUrl = async () => {
    const success = await copyText(randomApiUrl, 'API 地址已复制');
    if (success) {
      setCopiedApi(true);
      setTimeout(() => setCopiedApi(false), 2000);
    }
  };

  useEffect(() => {
    const handleExternalTag = (event: Event) => {
      const tag =
        event instanceof CustomEvent && typeof event.detail === 'string'
          ? event.detail.trim()
          : '';
      if (tag) handleSelectTag(tag);
    };

    window.addEventListener('paiii:select-tag', handleExternalTag);
    return () => window.removeEventListener('paiii:select-tag', handleExternalTag);
  }, [handleSelectTag]);

  const hasImage = imageUrl && imageLoaded && !previewError;

  return (
    <section id="preview" className="relative z-10 py-16 sm:py-20 px-4 sm:px-6 scroll-mt-20">
      <div className="mx-auto max-w-6xl">
        {/* Section Header */}
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-blue-500">
              Daily Picks
            </p>
            <h2 className="text-3xl font-black tracking-tight sm:text-4xl">热门二次元图片</h2>
            <p className="mt-2 text-muted-foreground text-sm">
              每次刷新随机一张，复制地址即可接入你的网站。
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-secondary/60 rounded-full px-3 py-1.5">
            <Clock className="h-3.5 w-3.5" />
            <span>实时更新</span>
          </div>
        </div>

        {/* Browser Preview Card */}
        <div className="overflow-hidden rounded-[1.5rem] border border-white/60 bg-white/75 shadow-[0_20px_60px_rgba(15,23,42,0.08),0_4px_16px_rgba(15,23,42,0.04)] backdrop-blur-xl">
          {/* Browser Chrome Bar */}
          <div className="flex items-center gap-3 border-b border-slate-200/60 bg-slate-50/80 px-4 py-3">
            <div className="hidden items-center gap-1.5 sm:flex shrink-0">
              <div className="browser-dot browser-dot-red" />
              <div className="browser-dot browser-dot-yellow" />
              <div className="browser-dot browser-dot-green" />
            </div>
            <div className="min-w-0 flex-1 sm:ml-2">
              <div className="truncate rounded-md bg-white/80 border border-slate-200/70 px-3 py-1.5 text-xs text-muted-foreground font-mono shadow-sm">
                {randomApiUrl}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 shrink-0 rounded-lg hover:bg-slate-200/70 transition-all"
              onClick={() => shuffleImage(selectedTag)}
              disabled={imageLoading}
              aria-label="刷新随机图片"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 text-slate-500 ${imageLoading ? 'animate-spin' : ''}`}
              />
            </Button>
          </div>

          {/* Content Grid */}
          <div className="grid gap-0 lg:grid-cols-[1.3fr_0.7fr]">
            {/* Image Preview Panel */}
            <div className="relative flex min-h-[360px] items-center justify-center overflow-hidden bg-slate-100 sm:min-h-[460px]">
              {imageLoading && <div className="absolute inset-0 z-20 skeleton-shimmer" />}

              {!imageUrl && !imageLoading && !previewError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground/40">
                  <Camera className="mb-3 h-16 w-16 opacity-25" />
                  <p className="text-sm">等待加载预览图片</p>
                </div>
              )}

              {previewError && !imageLoading && (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-background/80 p-6 text-center backdrop-blur-md">
                  <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mb-3">
                    <Camera className="h-8 w-8 text-red-300" />
                  </div>
                  <p className="text-sm font-semibold text-foreground">预览加载失败</p>
                  <p className="mt-1 max-w-sm text-xs text-muted-foreground">{previewError}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4 rounded-full"
                    onClick={() => shuffleImage(selectedTag)}
                  >
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                    重试
                  </Button>
                </div>
              )}

              {imageUrl && (
                <img
                  key={imageKey}
                  src={imageUrl}
                  alt={imageTitle}
                  className={`h-full w-full object-cover transition-all duration-500 ${
                    imageLoaded && !previewError
                      ? 'opacity-100 scale-100'
                      : 'opacity-0 scale-[0.97]'
                  }`}
                  onLoad={handleImageLoad}
                  onError={handleImageError}
                />
              )}

              {hasImage && (
                <div className="absolute inset-x-0 bottom-0 z-10 p-4 bg-gradient-to-t from-black/80 via-black/45 to-transparent">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <h3 className="mb-1.5 truncate text-base font-semibold text-white">
                        {imageTitle}
                      </h3>
                      <div className="flex flex-wrap gap-1">
                        {imageTags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-white/18 px-2 py-0.5 text-xs text-white/88 backdrop-blur-sm border border-white/10"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-1.5 sm:ml-3 sm:flex-nowrap">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-8 min-w-0 rounded-full border-0 bg-white/18 text-xs text-white backdrop-blur-sm hover:bg-white/28 transition-colors"
                        onClick={copyUrl}
                      >
                        {copied ? (
                          <Check className="mr-1 h-3 w-3" />
                        ) : (
                          <CopyIcon className="mr-1 h-3 w-3" />
                        )}
                        {copied ? '已复制' : '复制地址'}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-8 w-8 rounded-full border-0 bg-white/18 p-0 text-white backdrop-blur-sm hover:bg-white/28 transition-colors"
                        asChild
                      >
                        <a href={imageUrl} target="_blank" rel="noopener noreferrer">
                          <span className="sr-only">打开图片</span>
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar Info Panel */}
            <div className="flex flex-col gap-5 bg-white/65 p-5 sm:p-6">
              <div>
                <div className="mb-4 flex items-center justify-between gap-2">
                  <Badge className="rounded-full bg-blue-50 text-blue-600 border-blue-100 hover:bg-blue-50 text-xs">
                    Random API
                  </Badge>
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="relative flex h-2 w-2">
                      <span
                        className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${
                          imageLoading ? 'bg-amber-400' : 'bg-emerald-400'
                        }`}
                      />
                      <span
                        className={`relative inline-flex h-2 w-2 rounded-full ${
                          imageLoading ? 'bg-amber-500' : 'bg-emerald-500'
                        }`}
                      />
                    </span>
                    {imageLoading ? '加载中' : '实时可用'}
                  </span>
                </div>
                <h3 className="text-2xl font-black tracking-tight leading-snug">
                  复制即用，一行接入
                </h3>
                <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
                  每次请求返回一张不同的图片，直接用在网页、Markdown 或 CSS 背景里，无需申请
                  Key。
                </p>
              </div>

              {/* Code Block */}
              <div className="rounded-xl bg-slate-950 overflow-hidden shadow-xl">
                <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
                  <span className="text-[10px] font-medium text-emerald-400 uppercase tracking-wider">
                    GET
                  </span>
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-white/15" />
                    <div className="w-1.5 h-1.5 rounded-full bg-white/15" />
                    <div className="w-1.5 h-1.5 rounded-full bg-white/15" />
                  </div>
                </div>
                <div className="flex items-center gap-1 p-2 pl-3">
                  <code className="min-w-0 flex-1 truncate font-mono text-xs text-slate-300">
                    {randomApiUrl}
                  </code>
                  <button
                    type="button"
                    onClick={() => void copyApiUrl()}
                    aria-label="复制 API 地址"
                    title="复制 API 地址"
                    className="shrink-0 rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    {copiedApi ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <CopyIcon className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2.5 text-sm">
                <Button
                  className="rounded-xl h-10 bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-md shadow-blue-600/20 hover:shadow-blue-600/35 hover:-translate-y-0.5 transition-all duration-200"
                  onClick={() => shuffleImage(selectedTag)}
                  disabled={imageLoading}
                >
                  <RefreshCw
                    className={`mr-1.5 h-3.5 w-3.5 ${imageLoading ? 'animate-spin' : ''}`}
                  />
                  换一张
                </Button>
                <Button
                  variant="outline"
                  className="rounded-xl h-10 bg-white/70 hover:bg-white/90 transition-all duration-200"
                  onClick={() => void copyUrl()}
                  disabled={!imageUrl}
                >
                  {copied ? (
                    <Check className="mr-1.5 h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <CopyIcon className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  {copied ? '已复制' : '复制图片'}
                </Button>
              </div>
            </div>
          </div>

          {/* Category Tags Bar */}
          <div className="border-t border-slate-200/60 bg-slate-50/70 p-4">
            <div className="category-strip flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x snap-mandatory sm:flex-wrap sm:overflow-visible">
              <button
                type="button"
                className={`category-button shrink-0 snap-start px-3.5 py-1.5 rounded-full text-sm font-medium transition-all ${
                  selectedTag === undefined
                    ? 'active bg-primary text-primary-foreground shadow-md'
                    : 'bg-white/70 text-muted-foreground border border-slate-200/70 hover:bg-white hover:text-foreground'
                }`}
                onClick={() => handleSelectTag(undefined)}
              >
                全部
              </button>
              {stats?.tags?.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className={`category-button shrink-0 snap-start px-3.5 py-1.5 rounded-full text-sm font-medium transition-all ${
                    selectedTag === tag
                      ? 'active bg-primary text-primary-foreground shadow-md'
                      : 'bg-white/70 text-muted-foreground border border-slate-200/70 hover:bg-white hover:text-foreground'
                  }`}
                  onClick={() => handleSelectTag(tag)}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
