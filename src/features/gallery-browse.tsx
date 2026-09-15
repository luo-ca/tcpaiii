import { useCallback, useEffect, useMemo, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, SyntheticEvent } from 'react';
import { useInfiniteQuery, useQuery, keepPreviousData } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  Check,
  Copy as CopyIcon,
  ExternalLink,
  ImageOff,
  Images,
  Loader2,
  Search,
  SearchX,
  Tag,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import type { ImageRecord, PaginatedImages, Stats } from '@/lib/types';
import { fetchImagesPage, fetchStats } from '@/lib/api';
import { getErrorMessage } from '@/lib/helpers';
import { getImageRatio, rememberImageRatio } from '@/lib/image-ratio';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { ErrorState } from '@/components/states/ErrorState';
import { EmptyState } from '@/components/states/EmptyState';
import { useCopyFeedback } from '@/hooks/use-copy-feedback';

/** 后端 MAX_LIST_PAGE_SIZE = 60，这里取默认值 24，保证翻页粒度舒服 */
const BROWSE_PAGE_SIZE = 24;

/**
 * 尺寸未知时的临时占位比例。
 *
 * 这个值不是拍脑袋来的：实测图库 40 张样本，**39 张是横构图壁纸**
 * （3500×2475、3840×2160、5000×2813 这类），中位比例 ≈1.75、众数 16:9。
 * 取 16/9 作占位时，平均绝对偏差仅 0.064；原先误用 3:4（竖构图）偏差高达 0.99——
 * 占位框几乎全错，图片到达时整块塌缩，这正是一开始 CLS 的主因。
 */
const DEFAULT_RATIO = 16 / 9;

/** 骨架屏用的三种横构图比例，贴近真实分布 */
const SKELETON_RATIOS = [16 / 9, 3 / 2, 16 / 10];

// ============================================================
// 单张瀑布流卡片
// ============================================================

/**
 * 单张瀑布流卡片。
 *
 * `priority` 只给第一张：它恒在首屏（已在 390 与 1440 两档实测），
 * 且实测它还是本批数据里最高的一张（264×373，面积约为普通瓦片的 2.5 倍），
 * 也就是最可能的 LCP 候选 —— 让它先于另外 23 张抢到带宽。
 *
 * 注意**不要**顺手写成「前 N 张优先」：CSS multi-column 是逐列向下填充的，
 * DOM 里 index 0/1/2/3 会同处第一列（实测桌面 4 列时 0~4 全在第 1 列），
 * 那样会把 3 张首屏外的图提到前面，反而拖慢首屏。
 */
function MasonryTile({
  image,
  priority = false,
  onOpen,
}: {
  image: ImageRecord;
  priority?: boolean;
  onOpen: () => void;
}) {
  // 优先用缓存过的真实比例占位（重复访问 → 布局稳定）
  const [ratio, setRatio] = useState<number>(() => getImageRatio(image.url) ?? DEFAULT_RATIO);
  const [state, setState] = useState<'loading' | 'loaded' | 'error'>('loading');

  const handleLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    const el = event.currentTarget;
    const real = el.naturalWidth / el.naturalHeight;
    if (Number.isFinite(real) && real > 0) {
      rememberImageRatio(image.url, el.naturalWidth, el.naturalHeight);
      // 首次访问：用真实比例纠正占位，之后这张图就稳定了
      if (Math.abs(real - ratio) > 0.001) setRatio(real);
    }
    setState('loaded');
  };

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`查看大图：${image.title || '未命名图片'}`}
      className="reveal group relative mb-3 block w-full break-inside-avoid overflow-hidden rounded-2xl border border-white/60 bg-secondary shadow-sm transition-all duration-300 motion-safe:hover:-translate-y-0.5 hover:shadow-lg sm:mb-4"
      style={{ aspectRatio: String(ratio) }}
    >
      {state === 'loading' && <div className="absolute inset-0 skeleton-shimmer" aria-hidden="true" />}

      {state === 'error' ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-muted-foreground/50">
          <ImageOff className="h-6 w-6 opacity-40" aria-hidden="true" />
          <span className="text-xs">加载失败</span>
        </div>
      ) : (
        <img
          src={image.url}
          alt={image.title || '二次元图片'}
          loading={priority ? 'eager' : 'lazy'}
          {...(priority ? { fetchpriority: 'high' as const } : {})}
          decoding="async"
          onLoad={handleLoad}
          onError={() => setState('error')}
          className={`h-full w-full object-cover transition-all duration-500 motion-safe:group-hover:scale-[1.03] ${
            state === 'loaded' ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}

      {/* 说明浮层：可悬停设备上收成 hover 显示；触摸设备（primary pointer 为 coarse）
          没有 hover，必须常显，否则手机上永远看不到标题与标签。 */}
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 pointer-coarse:opacity-100" />
      <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100 pointer-coarse:opacity-100">
        <span className="min-w-0 flex-1 truncate text-left text-xs font-medium text-white">
          {image.title || '未命名'}
        </span>
        {image.tags[0] && (
          <span className="shrink-0 rounded-full bg-white/20 px-2 py-0.5 text-[11px] text-white backdrop-blur-sm">
            {image.tags[0]}
          </span>
        )}
      </span>
    </button>
  );
}

// ============================================================
// 灯箱
// ============================================================

function Lightbox({
  images,
  index,
  onClose,
  onNavigate,
}: {
  images: ImageRecord[];
  index: number | null;
  onClose: () => void;
  onNavigate: (delta: number) => void;
}) {
  const { copied, copy } = useCopyFeedback();
  const image = index === null ? null : images[index];
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');

  // 切换图片（含方向键翻页）时重新回到「加载中」，避免沿用上一张的完成态
  useEffect(() => {
    setStatus('loading');
  }, [image?.id]);
  const hasPrev = index !== null && index > 0;
  const hasNext = index !== null && index < images.length - 1;

  // Esc 由 Radix Dialog 负责；这里补左右方向键
  const handleKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key === 'ArrowLeft' && hasPrev) {
      event.preventDefault();
      onNavigate(-1);
    }
    if (event.key === 'ArrowRight' && hasNext) {
      event.preventDefault();
      onNavigate(1);
    }
  };

  return (
    <Dialog open={index !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        onKeyDown={handleKeyDown}
        aria-describedby={undefined}
        className="w-auto max-w-[min(1120px,94vw)] gap-0 border-0 bg-transparent p-0 shadow-none [&>button]:text-white/70 [&>button:hover]:text-white"
      >
        <DialogTitle className="sr-only">
          {image?.title || '图片预览'}
          {index !== null ? `（第 ${index + 1} 张，共 ${images.length} 张）` : ''}
        </DialogTitle>

        {image && (
          <figure className="flex flex-col items-center gap-3">
            {/* 原图较大，加载中先给一个占位框；失败则给明确兜底而不是留白 */}
            <div className="relative flex min-h-[38vh] min-w-[min(74vw,320px)] items-center justify-center">
              {status === 'loading' && (
                <Loader2 className="absolute h-7 w-7 animate-spin text-white/70" aria-hidden />
              )}
              {status === 'error' ? (
                <div className="flex min-h-[38vh] flex-col items-center justify-center gap-3 rounded-2xl bg-white/10 px-8 py-10 text-center">
                  <ImageOff className="h-8 w-8 text-white/50" aria-hidden />
                  <p className="text-sm text-white/85">原图加载失败</p>
                  <a
                    href={image.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-8 items-center gap-1 rounded-full bg-white/15 px-3.5 text-xs text-white transition-colors hover:bg-white/25"
                  >
                    在新标签页打开
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                </div>
              ) : (
                <img
                  key={image.id}
                  src={image.url}
                  alt={image.title || '二次元图片'}
                  onLoad={() => setStatus('loaded')}
                  onError={() => setStatus('error')}
                  className={`max-h-[78vh] w-auto max-w-full rounded-2xl object-contain shadow-2xl transition-opacity duration-300 ${
                    status === 'loaded' ? 'opacity-100' : 'opacity-0'
                  }`}
                />
              )}
            </div>

            <figcaption className="flex w-full flex-wrap items-center justify-center gap-2 px-1">
              <span className="max-w-[46vw] truncate text-sm font-medium text-white/90">
                {image.title || '未命名'}
              </span>
              {image.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] text-white/80 backdrop-blur-sm"
                >
                  {tag}
                </span>
              ))}
              <span className="inline-flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7 rounded-full border-0 bg-white/15 text-xs text-white backdrop-blur-sm hover:bg-white/25"
                  onClick={() => void copy(image.url, '图片地址已复制')}
                >
                  {copied ? <Check className="mr-1 h-3 w-3" aria-hidden="true" /> : <CopyIcon className="mr-1 h-3 w-3" aria-hidden="true" />}
                  {copied ? '已复制' : '复制地址'}
                </Button>
                <a
                  href={image.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-7 items-center gap-1 rounded-full bg-white/15 px-3 text-xs text-white backdrop-blur-sm transition-colors hover:bg-white/25"
                >
                  原图
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              </span>
            </figcaption>
          </figure>
        )}

        {/* 左右切换 */}
        {hasPrev && (
          <button
            type="button"
            onClick={() => onNavigate(-1)}
            aria-label="上一张"
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/12 p-2.5 text-white backdrop-blur-md transition-colors hover:bg-white/25 sm:left-4"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
        {hasNext && (
          <button
            type="button"
            onClick={() => onNavigate(1)}
            aria-label="下一张"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/12 p-2.5 text-white backdrop-blur-md transition-colors hover:bg-white/25 sm:right-4"
          >
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// 页面
// ============================================================

export default function GalleryBrowse() {
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const debouncedSearchTerm = useDebouncedValue(searchTerm, 300);
  const searchQuery = debouncedSearchTerm.trim();

  const { data: stats } = useQuery<Stats>({
    queryKey: ['stats'],
    queryFn: fetchStats,
    refetchInterval: 15_000,
    staleTime: 15_000,
  });

  const imagesQuery = useInfiniteQuery<PaginatedImages>({
    queryKey: ['gallery-browse', { tag: selectedTag, search: searchQuery }],
    queryFn: ({ pageParam }) =>
      fetchImagesPage({
        page: pageParam as number,
        pageSize: BROWSE_PAGE_SIZE,
        search: searchQuery,
        tag: selectedTag,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasNextPage ? lastPage.page + 1 : undefined),
    // 切换标签/搜索时保留上一批，避免整块闪白
    placeholderData: keepPreviousData,
  });

  const images = useMemo(
    () => imagesQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [imagesQuery.data],
  );
  const total = imagesQuery.data?.pages[0]?.total ?? 0;
  const tags = stats?.tags ?? [];
  const isInitialLoading = imagesQuery.isLoading && !imagesQuery.data;
  const isEmpty = !isInitialLoading && images.length === 0;
  const hasFilter = Boolean(selectedTag) || searchQuery.length > 0;

  // 数据变化后，灯箱里索引可能越界
  useEffect(() => {
    if (lightboxIndex !== null && lightboxIndex >= images.length) setLightboxIndex(null);
  }, [images.length, lightboxIndex]);

  const navigateLightbox = useCallback(
    (delta: number) => {
      setLightboxIndex((current) => {
        if (current === null) return current;
        const next = current + delta;
        if (next < 0 || next >= images.length) return current;
        return next;
      });
    },
    [images.length],
  );

  const clearFilters = () => {
    setSelectedTag(null);
    setSearchTerm('');
  };

  const chipClass = (active: boolean) =>
    `category-button shrink-0 snap-start rounded-full px-3.5 py-1.5 text-sm font-medium transition-all ${
      active
        ? 'bg-primary text-primary-foreground shadow-md'
        : 'border border-border bg-white/70 text-muted-foreground hover:bg-white hover:text-foreground'
    }`;

  return (
    <div className="relative z-10 mx-auto max-w-6xl px-4 pb-24 pt-[calc(var(--header-h)+32px)] sm:px-6">
      {/* 页头 */}
      <div className="reveal mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="section-eyebrow">
            <Images className="h-3.5 w-3.5" aria-hidden="true" />
            公共图库
          </p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">二次元图库</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            点任意一张看大图，左右方向键切换，Esc 关闭。
            {total > 0 && (
              <>
                {' '}共 <span className="font-semibold text-foreground tabular-nums">{total}</span> 张
                {hasFilter ? '（当前筛选结果）' : ''}。
              </>
            )}
          </p>
        </div>

        <div className="relative w-full shrink-0 sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" aria-hidden="true" />
          <Input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="搜索标题…"
            aria-label="搜索图片标题"
            className="h-10 rounded-xl border-border bg-white/70 pl-9"
          />
        </div>
      </div>

      {/* 标签筛选 */}
      {tags.length > 0 && (
        <div className="reveal category-strip mb-6 flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x snap-mandatory sm:flex-wrap sm:overflow-visible">
          <button
            type="button"
            onClick={() => setSelectedTag(null)}
            className={chipClass(selectedTag === null)}
          >
            全部
          </button>
          {tags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setSelectedTag((current) => (current === tag ? null : tag))}
              aria-pressed={selectedTag === tag}
              className={chipClass(selectedTag === tag)}
            >
              <Tag className="mr-1 inline h-3 w-3 align-[-2px]" aria-hidden="true" />
              {tag}
            </button>
          ))}
        </div>
      )}

      {/* 三种状态：加载 / 出错 / 空 */}
      {isInitialLoading ? (
        <div className="reveal columns-2 gap-3 sm:columns-3 sm:gap-4 lg:columns-4">
          {Array.from({ length: BROWSE_PAGE_SIZE }).map((_, i) => (
            <div
              key={i}
              className="mb-3 break-inside-avoid rounded-2xl skeleton-shimmer sm:mb-4"
              style={{ aspectRatio: String(SKELETON_RATIOS[i % SKELETON_RATIOS.length]) }}
            />
          ))}
        </div>
      ) : imagesQuery.isError ? (
        <ErrorState
          title="图库加载失败"
          message={getErrorMessage(imagesQuery.error, '请稍后重试')}
          onRetry={() => imagesQuery.refetch()}
        />
      ) : isEmpty ? (
        <EmptyState
          icon={hasFilter ? SearchX : Images}
          title={hasFilter ? '没有匹配的图片' : '图库还是空的'}
          message={
            hasFilter
              ? '换个关键词，或清空筛选条件看看全部图片。'
              : '等管理员导入第一批图片后这里就会热闹起来。'
          }
        >
          {hasFilter && (
            <Button variant="outline" onClick={clearFilters}>
              清空筛选
            </Button>
          )}
        </EmptyState>
      ) : (
        <>
          <div
            className={`columns-2 gap-3 transition-opacity duration-200 sm:columns-3 sm:gap-4 lg:columns-4 ${
              imagesQuery.isPlaceholderData ? 'opacity-60' : 'opacity-100'
            }`}
          >
            {images.map((image, index) => (
              <MasonryTile
                key={image.id}
                image={image}
                priority={index === 0}
                onOpen={() => setLightboxIndex(index)}
              />
            ))}
          </div>

          <div className="mt-8 flex flex-col items-center gap-3">
            {imagesQuery.hasNextPage ? (
              <Button
                variant="outline"
                className="h-11 rounded-xl bg-white/70 px-6 hover:bg-white"
                onClick={() => void imagesQuery.fetchNextPage()}
                disabled={imagesQuery.isFetchingNextPage}
              >
                {imagesQuery.isFetchingNextPage ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                    加载中…
                  </>
                ) : (
                  '加载更多'
                )}
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">已经到底了 · 共 {images.length} 张</p>
            )}
          </div>
        </>
      )}

      <Lightbox
        images={images}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onNavigate={navigateLightbox}
      />
    </div>
  );
}
