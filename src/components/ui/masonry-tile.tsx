import { memo, useState } from 'react';
import type { SyntheticEvent } from 'react';
import { ImageOff } from 'lucide-react';
import type { ImageRecord } from '@/lib/types';
import { getImageRatio, rememberImageRatio } from '@/lib/image-ratio';

/**
 * 尺寸未知时的临时占位比例。
 *
 * 这个值不是拍脑袋来的：实测图库 40 张样本，**39 张是横构图壁纸**
 * （3500×2475、3840×2160、5000×2813 这类），中位比例 ≈1.75、众数 16:9。
 * 取 16/9 作占位时，平均绝对偏差仅 0.064；原先误用 3:4（竖构图）偏差高达 0.99——
 * 占位框几乎全错，图片到达时整块塌缩，这正是一开始 CLS 的主因。
 */
export const DEFAULT_RATIO = 16 / 9;

/** 骨架屏用的三种横构图比例，贴近真实分布 */
export const SKELETON_RATIOS = [16 / 9, 3 / 2, 16 / 10];

// ============================================================
// 单张瀑布流卡片（公开图库与首页图库预览共用）
// ============================================================

/**
 * 单张瀑布流卡片。
 *
 * 抽到共享模块，是为了让首页「图库精选」与 `/gallery` 的瓦片外观、hover 行为、
 * 触摸兜底完全一致 —— 两处各写一份迟早会漂移。
 *
 * `priority` 只给第一张：它恒在首屏（已在 390 与 1440 两档实测），
 * 且实测它还是本批数据里最高的一张（264×373，面积约为普通瓦片的 2.5 倍），
 * 也就是最可能的 LCP 候选 —— 让它先于另外 23 张抢到带宽。
 *
 * 注意**不要**顺手写成「前 N 张优先」：CSS multi-column 是逐列向下填充的，
 * DOM 里 index 0/1/2/3 会同处第一列（实测桌面 4 列时 0~4 全在第 1 列），
 * 那样会把 3 张首屏外的图提到前面，反而拖慢首屏。
 *
 * `onOpen(index)` + memo：调用方传稳定回调与本张索引，瓦片 props 才可能在
 * 搜索输入等无关重渲染中保持全等，网格不被逐张重排。
 */
export const MasonryTile = memo(function MasonryTile({
  image,
  index,
  priority = false,
  onOpen,
}: {
  image: ImageRecord;
  index: number;
  priority?: boolean;
  onOpen: (index: number) => void;
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
      onClick={() => onOpen(index)}
      aria-label={`查看大图：${image.title || '未命名图片'}`}
      className="reveal group relative mb-3 block w-full break-inside-avoid overflow-hidden rounded-2xl border-2 border-ink bg-secondary shadow-sm transition-all duration-300 motion-safe:hover:-translate-y-0.5 hover:shadow-md sm:mb-4"
      style={{ aspectRatio: String(ratio) }}
    >
      {state === 'loading' && (
        <div className="absolute inset-0 skeleton-shimmer" aria-hidden="true" />
      )}

      {state === 'error' ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-muted-foreground">
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
          className={`h-full w-full object-cover transition-[opacity,transform] duration-500 motion-safe:group-hover:scale-[1.03] ${
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
          <span className="sticker-chip shrink-0 rounded-full px-2 py-0.5 text-[11px]">
            {image.tags[0]}
          </span>
        )}
      </span>
    </button>
  );
});
