import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Images } from 'lucide-react';
import { NavLink } from '@/components/ui/nav-link';
import type { ImageRecord, PaginatedImages } from '@/lib/types';
import { fetchImagesPage } from '@/lib/api';

const PREVIEW_COUNT = 8;

/** 单张缩略图。加载失败时把自己藏起来，避免首页出现裂图。 */
function PreviewTile({ image }: { image: ImageRecord }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;

  return (
    <a
      href={image.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative block aspect-video overflow-hidden rounded-2xl border border-white/60 bg-secondary shadow-sm transition-all duration-300 motion-safe:hover:-translate-y-0.5 hover:shadow-lg"
      title={image.title || '查看原图'}
    >
      <img
        src={image.url}
        alt={image.title || '二次元图片'}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className="h-full w-full object-cover transition-transform duration-500 motion-safe:group-hover:scale-105"
      />
      {/* 触摸设备没有 hover，说明条必须常显，否则手机上只看到图看不到标题 */}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/75 to-transparent p-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100 pointer-coarse:opacity-100">
        <span className="truncate text-xs font-medium text-white">
          {image.title || '未命名'}
        </span>
        {image.tags[0] && (
          <span className="shrink-0 rounded-full bg-white/20 px-2 py-0.5 text-[11px] text-white backdrop-blur-sm">
            {image.tags[0]}
          </span>
        )}
      </div>
    </a>
  );
}

/**
 * 首页图库预览。取图库最新的 8 张，点任意一张看原图，或进 `/gallery` 逛完整图库。
 *
 * `/gallery` 现在是**面向访客的瀑布流浏览页**（管理后台已迁到 `/admin`），
 * 所以这里的「浏览完整图库」是一个真实可达的承诺。
 * 数据来自不写统计的 `/api/list`。
 */
export function GalleryPreview() {
  const { data, isLoading } = useQuery<PaginatedImages>({
    queryKey: ['gallery-preview'],
    queryFn: () => fetchImagesPage({ page: 1, pageSize: PREVIEW_COUNT }),
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const items = data?.items ?? [];

  // 图库为空（或彻底取不到）时整段收起，不留一个空壳区块在首页
  if (!isLoading && items.length === 0) return null;

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
              点任意一张查看原图，或进图库按标签筛选浏览。
            </p>
          </div>
          <NavLink
            to="/gallery"
            className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-xl border border-border bg-white/70 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-white sm:self-auto"
          >
            浏览完整图库
            {data && data.total > 0 && (
              <span className="tabular-nums text-muted-foreground">{data.total}</span>
            )}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </NavLink>
        </div>

        {isLoading ? (
          <div className="reveal grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 sm:gap-4">
            {Array.from({ length: PREVIEW_COUNT }).map((_, i) => (
              <div key={i} className="aspect-video rounded-2xl skeleton-shimmer" />
            ))}
          </div>
        ) : (
          <div className="reveal grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 sm:gap-4">
            {items.map((image) => (
              <PreviewTile key={image.id} image={image} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
