import { useCallback, useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery, useQuery, keepPreviousData } from '@tanstack/react-query';
import { Images, Loader2, Search, SearchX, Tag, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MasonryTile, SKELETON_RATIOS } from '@/components/ui/masonry-tile';
import { ImageLightbox } from '@/components/ui/image-lightbox';
import type { PaginatedImages, Stats } from '@/lib/types';
import { fetchImagesPage, fetchStats } from '@/lib/api';
import { getErrorMessage } from '@/lib/helpers';
import { readGalleryQuery, writeGalleryQuery } from '@/lib/url';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { ErrorState } from '@/components/states/ErrorState';
import { EmptyState } from '@/components/states/EmptyState';

/** 后端 MAX_LIST_PAGE_SIZE = 60，这里取默认值 24，保证翻页粒度舒服 */
const BROWSE_PAGE_SIZE = 24;

export default function GalleryBrowse() {
  // 首帧直接从地址栏取初值，避免「先渲染整库、再跳成筛选结果」的闪动
  const [{ search: initialSearch, tag: initialTag }] = useState(() =>
    readGalleryQuery(window.location.search),
  );
  const [selectedTag, setSelectedTag] = useState<string | null>(initialTag);
  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const debouncedSearchTerm = useDebouncedValue(searchTerm, 300);
  const searchQuery = debouncedSearchTerm.trim();

  // 筛选状态回写地址栏。用 replaceState 而不是 pushState：
  // 否则每敲一个字都会往历史里塞一条记录，后退键会变成「逐字回退」。
  useEffect(() => {
    const current = window.location.search.replace(/^\?/, '');
    const next = writeGalleryQuery(current, { search: searchQuery, tag: selectedTag });
    if (next === current) return;

    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${next ? `?${next}` : ''}${window.location.hash}`,
    );
  }, [searchQuery, selectedTag]);

  // 前进/后退回到带参数的图库地址时，把筛选状态同步回来
  useEffect(() => {
    const onPopState = () => {
      const { search, tag } = readGalleryQuery(window.location.search);
      setSearchTerm(search);
      setSelectedTag(tag);
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

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
  const hasNextPage = Boolean(imagesQuery.hasNextPage);
  const fetchNextPage = imagesQuery.fetchNextPage;

  // 灯箱索引越界处理。
  // 允许索引停在 `images.length` —— 那是「已请求、但下一页还没到达」的占位，
  // 等 fetchNextPage 回来后数据变长，索引自然落到新图上。只有当越界且确实
  // 没有下一页（例如切换筛选后结果变少）时才收起灯箱。
  useEffect(() => {
    if (lightboxIndex === null) return;
    if (lightboxIndex <= images.length - 1) return;
    if (hasNextPage && lightboxIndex === images.length) return;
    setLightboxIndex(null);
  }, [images.length, lightboxIndex, hasNextPage]);

  const navigateLightbox = useCallback(
    (delta: number) => {
      setLightboxIndex((current) => {
        if (current === null) return current;
        const next = current + delta;
        if (next < 0 || next > images.length) return current;
        // 走到末尾再按「下一张」：就地续加载下一页，而不是把用户卡住
        if (next === images.length) {
          if (!hasNextPage) return current;
          void fetchNextPage();
          return next;
        }
        return next;
      });
    },
    [images.length, hasNextPage, fetchNextPage],
  );

  const clearFilters = () => {
    setSelectedTag(null);
    setSearchTerm('');
  };

  const chipClass = (active: boolean) =>
    `category-button shrink-0 snap-start rounded-full px-3.5 py-1.5 text-sm font-medium ${
      active
        ? 'border-2 border-ink bg-primary text-primary-foreground shadow-[2px_2px_0_0_var(--color-ink)]'
        : 'border-2 border-ink bg-white text-muted-foreground hover:bg-brand-50 hover:text-foreground'
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
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">
            点任意一张看大图，左右方向键切换，Esc 关闭。
            {total > 0 && (
              <>
                {' '}共 <span className="font-semibold text-foreground tabular-nums">{total}</span> 张
                {hasFilter ? '（当前筛选结果）' : ''}。
              </>
            )}
          </p>
        </div>

        <div className="flex w-full shrink-0 items-center gap-2 sm:w-auto">
          <div className="relative flex-1 sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" aria-hidden="true" />
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="搜索标题…"
              aria-label="搜索图片标题"
              className="h-10 rounded-xl pl-9"
            />
          </div>
          {/* 筛选生效时才出现：原先只能滚到空结果页里清筛选，筛选条件在地址栏里也看不见 */}
          {hasFilter && (
            <Button
              variant="ghost"
              onClick={clearFilters}
              className="h-10 shrink-0 rounded-xl px-3 text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              清空筛选
            </Button>
          )}
        </div>
      </div>

      {/* 标签筛选 */}
      {tags.length > 0 && (
        <div className="reveal category-strip mb-6 flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x snap-mandatory sm:flex-wrap sm:overflow-visible">
          <button
            type="button"
            onClick={() => setSelectedTag(null)}
            aria-pressed={selectedTag === null}
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
                className="h-11 rounded-xl bg-white px-6 hover:bg-brand-50"
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

      <ImageLightbox
        images={images}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onNavigate={navigateLightbox}
        hasMore={hasNextPage}
      />
    </div>
  );
}
