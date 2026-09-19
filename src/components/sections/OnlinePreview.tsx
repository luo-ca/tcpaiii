import { forwardRef, useState, useEffect, useCallback, useRef } from 'react';
import type { ForwardedRef } from 'react';
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
import type { RandomRequest, Stats } from '@/lib/types';
import { fetchRandomImage, statsQueryOptions } from '@/lib/api';
import { getErrorMessage } from '@/lib/helpers';
import { useCopyFeedback } from '@/hooks/use-copy-feedback';
import { TagChip } from '@/components/ui/tag-chip';
import { buildAppUrl } from '@/lib/url';

/**
 * 随机图预览。
 *
 * 首页顶部的搜索框 / 随机按钮通过 `request` 下发意图（纯 props，不再用
 * `document.getElementById` + `CustomEvent` 那种跨组件广播）。
 * `forwardRef` 是为了让上层能拿到这个区块的 DOM，用于「搜完滚动到预览」。
 */
function OnlinePreviewImpl(
  { request }: { request: RandomRequest },
  ref: ForwardedRef<HTMLElement>,
) {
  const [selectedTag, setSelectedTag] = useState<string | undefined>();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageTitle, setImageTitle] = useState<string>('');
  const [imageTags, setImageTags] = useState<string[]>([]);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const { copied, copy: copyImageUrl } = useCopyFeedback();
  const { copied: copiedApi, copy: copyApiUrlText } = useCopyFeedback();
  const queryClient = useQueryClient();
  const prevTokenRef = useRef(request.token);
  const initialLoadRef = useRef(false);
  const requestIdRef = useRef(0);
  const [imageKey, setImageKey] = useState(0);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const randomApiUrl = buildAppUrl(
    `/api/random${selectedTag ? `?tag=${encodeURIComponent(selectedTag)}` : ''}`,
  );

  const { data: stats } = useQuery<Stats>(statsQueryOptions());

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

  // 上层发来新请求（token 递增）时，按请求带的标签重新取图
  useEffect(() => {
    if (request.token === prevTokenRef.current) return;
    prevTokenRef.current = request.token;
    setSelectedTag(request.tag);
    shuffleImage(request.tag);
  }, [request, shuffleImage]);

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
    await copyImageUrl(imageUrl, '图片地址已复制');
  };

  const copyApiUrl = async () => {
    await copyApiUrlText(randomApiUrl, 'API 地址已复制');
  };

  const hasImage = imageUrl && imageLoaded && !previewError;

  // 状态灯三态：加载中（琥珀）/ 出错（红）/ 可用（绿）。
  // 原先只按 imageLoading 判断，handleImageError 后 imageLoading=false
  // 会让出错时仍显示绿色「实时可用」，与红色失败面板自相矛盾。
  const statusTone = previewError ? 'error' : imageLoading ? 'loading' : 'ready';
  const statusDotClass =
    statusTone === 'error'
      ? 'bg-destructive'
      : statusTone === 'loading'
        ? 'bg-warning'
        : 'bg-success';
  const statusPingClass =
    statusTone === 'error'
      ? 'bg-destructive opacity-60'
      : statusTone === 'loading'
        ? 'bg-warning opacity-60'
        : 'bg-success opacity-60';
  const statusLabel =
    statusTone === 'error' ? '加载失败' : statusTone === 'loading' ? '加载中' : '实时可用';

  return (
    <section ref={ref} id="preview" className="relative z-10 px-4 py-16 sm:px-6 sm:py-20 lg:py-24">
      <div className="mx-auto max-w-6xl">
        {/* Section Header */}
        <div className="reveal mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="section-eyebrow">每日精选</p>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">热门二次元图片</h2>
            <p className="mt-2 text-sm text-muted-foreground sm:text-base">
              每次刷新随机一张，复制地址即可接入你的网站。
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground border border-border bg-secondary rounded-full px-3 py-1.5">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            <span>实时更新</span>
          </div>
        </div>

        {/* Browser Preview Card */}
        <div className="reveal overflow-hidden rounded-3xl border-2 border-ink bg-white shadow-[6px_6px_0_0_var(--color-ink)]">
          {/* Browser Chrome Bar */}
          <div className="flex items-center gap-3 border-b-2 border-ink bg-secondary px-4 py-3">
            <div className="hidden items-center gap-1.5 sm:flex shrink-0">
              <div className="browser-dot browser-dot-red" />
              <div className="browser-dot browser-dot-yellow" />
              <div className="browser-dot browser-dot-green" />
            </div>
            <div className="min-w-0 flex-1 sm:ml-2">
              <div className="truncate rounded-md border border-border bg-white px-3 py-1.5 font-mono text-xs text-muted-foreground">
                {randomApiUrl}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 shrink-0 rounded-lg p-0 transition-all hover:bg-brand-50"
              onClick={() => shuffleImage(selectedTag)}
              disabled={imageLoading}
              aria-label="刷新随机图片"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 text-muted-foreground ${imageLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
            </Button>
          </div>

          {/* Content Grid */}
          <div className="grid gap-0 lg:grid-cols-[1.3fr_0.7fr]">
            {/* Image Preview Panel */}
            <div className="relative flex min-h-[360px] items-center justify-center overflow-hidden bg-secondary sm:min-h-[460px]">
              {/* 换图是异步的：给读屏一个礼貌播报，说明现在展示的是哪张，
                  否则视障用户点「刷新」后无法感知内容已更新。 */}
              <span aria-live="polite" className="sr-only">
                {hasImage ? `已加载随机图片：${imageTitle}` : previewError ? '随机图片加载失败' : ''}
              </span>
              {imageLoading && <div className="absolute inset-0 z-20 skeleton-shimmer" />}

              {!imageUrl && !imageLoading && !previewError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground/40">
                  <Camera className="mb-3 h-16 w-16 opacity-25" aria-hidden="true" />
                  <p className="text-sm">等待加载预览图片</p>
                </div>
              )}

              {previewError && !imageLoading && (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-background p-6 text-center">
                  <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-destructive-line bg-destructive-soft">
                    <Camera className="h-8 w-8 text-destructive" aria-hidden="true" />
                  </div>
                  <p className="text-sm font-bold text-foreground">预览加载失败</p>
                  <p className="mt-1 max-w-sm text-xs text-muted-foreground">{previewError}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4 rounded-full"
                    onClick={() => shuffleImage(selectedTag)}
                  >
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                    重试
                  </Button>
                </div>
              )}

              {imageUrl && (
                <img
                  key={imageKey}
                  src={imageUrl}
                  alt={imageTitle}
                  className={`h-full w-full object-cover transition-[opacity,transform] duration-500 ${
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
                            className="sticker-chip rounded-full px-2 py-0.5 text-xs"
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
                        className="sticker-chip h-8 min-w-0 rounded-full text-xs transition-transform"
                        onClick={copyUrl}
                      >
                        {copied ? (
                          <Check className="mr-1 h-3 w-3" aria-hidden="true" />
                        ) : (
                          <CopyIcon className="mr-1 h-3 w-3" aria-hidden="true" />
                        )}
                        {copied ? '已复制' : '复制地址'}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="sticker-chip h-8 w-8 rounded-full p-0 transition-transform"
                        asChild
                      >
                        <a href={imageUrl} target="_blank" rel="noopener noreferrer">
                          <span className="sr-only">打开图片</span>
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                        </a>
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar Info Panel */}
            <div className="flex flex-col gap-5 bg-card p-5 sm:p-6">
              <div>
                <div className="mb-4 flex items-center justify-between gap-2">
                  <Badge className="rounded-full bg-brand-50 text-brand-600 border-brand-100 hover:bg-brand-50 text-xs">
                    随机接口
                  </Badge>
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="relative flex h-2 w-2">
                      <span
                        className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${statusPingClass}`}
                      />
                      <span
                        className={`relative inline-flex h-2 w-2 rounded-full ${statusDotClass}`}
                      />
                    </span>
                    {statusLabel}
                  </span>
                </div>
                <h3 className="text-2xl font-semibold leading-snug tracking-tight">
                  复制即用，一行接入
                </h3>
                <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
                  每次请求返回一张不同的图片，直接用在网页、Markdown 或 CSS 背景里，无需申请
                  Key。
                </p>
              </div>

              {/* Code Block */}
              <div className="rounded-xl bg-code border-2 border-ink overflow-hidden shadow-[4px_4px_0_0_var(--color-ink)]">
                <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
                  <span className="text-[11px] font-medium text-success-bright uppercase tracking-wider">
                    GET
                  </span>
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-white/15" />
                    <div className="w-1.5 h-1.5 rounded-full bg-white/15" />
                    <div className="w-1.5 h-1.5 rounded-full bg-white/15" />
                  </div>
                </div>
                <div className="flex items-center gap-1 p-2 pl-3">
                  <code className="min-w-0 flex-1 truncate font-mono text-xs text-white/80">
                    {randomApiUrl}
                  </code>
                  <button
                    type="button"
                    onClick={() => void copyApiUrl()}
                    aria-label="复制 API 地址"
                    title="复制 API 地址"
                    className="shrink-0 rounded-lg p-2 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    {copiedApi ? (
                      <Check className="h-3.5 w-3.5 text-success-bright" aria-hidden="true" />
                    ) : (
                      <CopyIcon className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2.5 text-sm">
                <Button
                  className="gradient-button rounded-xl h-10 text-white"
                  onClick={() => shuffleImage(selectedTag)}
                  disabled={imageLoading}
                >
                  <RefreshCw
                    className={`mr-1.5 h-3.5 w-3.5 ${imageLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
                  换一张
                </Button>
                <Button
                  variant="outline"
                  className="rounded-xl h-10 bg-white transition-all duration-200"
                  onClick={() => void copyUrl()}
                  disabled={!imageUrl}
                >
                  {copied ? (
                    <Check className="mr-1.5 h-3.5 w-3.5 text-success-ink" aria-hidden="true" />
                  ) : (
                    <CopyIcon className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {copied ? '已复制' : '复制图片'}
                </Button>
              </div>
            </div>
          </div>

          {/* Category Tags Bar */}
          <div className="border-t-2 border-ink bg-secondary p-4">
            <div className="category-strip flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x snap-mandatory sm:flex-wrap sm:overflow-visible">
              <TagChip active={selectedTag === undefined} onClick={() => handleSelectTag(undefined)}>
                全部
              </TagChip>
              {stats?.tags?.map((tag) => (
                <TagChip
                  key={tag}
                  active={selectedTag === tag}
                  onClick={() => handleSelectTag(tag)}
                >
                  {tag}
                </TagChip>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export const OnlinePreview = forwardRef(OnlinePreviewImpl);
