import { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Images, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NavLink } from '@/components/ui/nav-link';
import { MasonryTile, SKELETON_RATIOS } from '@/components/ui/masonry-tile';
import { ImageLightbox } from '@/components/ui/image-lightbox';
import type { PaginatedImages } from '@/lib/types';
import { fetchImagesPage } from '@/lib/api';

const PREVIEW_COUNT = 8;

/**
 * 首页图库预览。取图库最新的 8 张。
 *
 * 与 `/gallery` 共用 `MasonryTile` + `ImageLightbox`：同一站点两处点图应当同一种
 * 行为。原先首页是「新标签页打开原图」、公开图库是就地开灯箱，用户容易困惑；
 * 现在两处都是就地开灯箱，可左右切换、Esc 关闭。
 *
 * 数据来自不写统计的 `/api/list`。
 */
export function GalleryPreview() {
  const { data, isLoading, isError, isFetching, refetch } = useQuery<PaginatedImages>({
    queryKey: ['gallery-preview'],
    queryFn: () => fetchImagesPage({ page: 1, pageSize: PREVIEW_COUNT }),
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const items = data?.items ?? [];

  const navigateLightbox = useCallback(
    (delta: number) => {
      setLightboxIndex((current) => {
        if (current === null) return current;
        const next = current + delta;
        if (next < 0 || next >= items.length) return current;
        return next;
      });
    },
    [items.length],
  );

  // 稳定引用：配合 MasonryTile 的 memo，首页无关渲染不逐张重排瓦片
  const openTile = useCallback((index: number) => setLightboxIndex(index), []);

  // 图库确实为空时整段收起；拉取失败不算「空」，保留区块并给出重试，
  // 免得接口抖动时首页区块凭空消失，与真空库完全同形。
  if (!isLoading && !isError && items.length === 0) return null;

  return (
    <section id="gallery-preview" className="relative z-10 px-4 py-16 sm:px-6 sm:py-20 lg:py-24">
      <div className="mx-auto max-w-6xl">
        <div className="reveal mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="section-eyebrow">
              <Images className="h-3.5 w-3.5" aria-hidden="true" />
              最新收录
            </p>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">图库精选</h2>
            <p className="mt-2 text-sm text-muted-foreground sm:text-base">
              点任意一张看大图，左右方向键切换，或进图库按标签筛选浏览。
            </p>
          </div>
          <NavLink
            to="/gallery"
            className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-xl border border-border bg-white px-4 py-2 text-sm font-medium text-foreground shadow-sm transition-[border-color,color,box-shadow] hover:border-brand-300 hover:text-brand-600 hover:shadow-md sm:self-auto"
          >
            浏览完整图库
            {data && data.total > 0 && (
              <span className="tabular-nums text-muted-foreground">{data.total}</span>
            )}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </NavLink>
        </div>

        {/* 与公开图库同形的瀑布流：同一批数据两种排版会显得两个站点 */}
        {isLoading ? (
          <div className="reveal columns-2 gap-3 sm:columns-3 sm:gap-4 lg:columns-4">
            {Array.from({ length: PREVIEW_COUNT }).map((_, i) => (
              <div
                key={i}
                className="mb-3 break-inside-avoid rounded-2xl skeleton-shimmer sm:mb-4"
                style={{ aspectRatio: String(SKELETON_RATIOS[i % SKELETON_RATIOS.length]) }}
              />
            ))}
          </div>
        ) : isError && items.length === 0 ? (
          <div className="reveal rounded-2xl border border-border bg-white px-4 py-8 text-center">
            <p className="text-sm text-muted-foreground">图库精选暂时加载失败。</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refetch()}
              disabled={isFetching}
              className="mt-3 rounded-lg text-xs"
            >
              {isFetching ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              )}
              {isFetching ? '重试中…' : '重试'}
            </Button>
          </div>
        ) : (
          <div className="reveal columns-2 gap-3 sm:columns-3 sm:gap-4 lg:columns-4">
            {items.map((image, index) => (
              <MasonryTile
                key={image.id}
                image={image}
                index={index}
                priority={index === 0}
                onOpen={openTile}
              />
            ))}
          </div>
        )}
      </div>

      <ImageLightbox
        images={items}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onNavigate={navigateLightbox}
      />
    </section>
  );
}
