import { useEffect, useRef, useState } from 'react';
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy as CopyIcon,
  ExternalLink,
  ImageOff,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import type { ImageRecord } from '@/lib/types';
import { useCopyFeedback } from '@/hooks/use-copy-feedback';

/**
 * 图片灯箱。公开图库与首页「图库精选」共用：键盘左右切换、触摸滑动、
 * 相邻图预取、页码指示、加载 / 失败兜底。
 *
 * 抽到共享模块是为了统一两处的查看体验 —— 首页原先点图是「新标签页打开原图」，
 * 公开图库是就地开灯箱，同一个站点两种行为，用户容易困惑。
 */
export function ImageLightbox({
  images,
  index,
  onClose,
  onNavigate,
  hasMore = false,
}: {
  images: ImageRecord[];
  index: number | null;
  onClose: () => void;
  onNavigate: (delta: number) => void;
  /** 是否还有「尚未加载」的后继图片：为 true 时「下一张」保持可用，以触发续加载 */
  hasMore?: boolean;
}) {
  const { copied, copy } = useCopyFeedback();
  const image = index === null ? null : images[index];
  // 索引可以临时等于 images.length：那是「已请求下一页、数据还在路上」的占位态。
  const isPendingNext = index !== null && !image;
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');

  // 切换图片（含方向键翻页）时重新回到「加载中」，避免沿用上一张的完成态
  useEffect(() => {
    setStatus('loading');
  }, [image?.id]);

  const hasPrev = index !== null && index > 0;
  // 还有未加载的后继图时，「下一张」也要可用，否则用户到末尾就卡住了
  const hasNext = index !== null && (index < images.length - 1 || hasMore);

  // 预取相邻一张的原图：翻页时不再逐张现等网络，手感接近瞬时。
  // 只预取 ±1，避免一次性拉开一串大图带宽。
  useEffect(() => {
    if (index === null) return;
    for (const delta of [-1, 1]) {
      const neighbor = images[index + delta];
      if (!neighbor) continue;
      const preload = new window.Image();
      preload.decoding = 'async';
      preload.src = neighbor.url;
    }
  }, [images, index]);

  // 触摸/触控笔水平滑动切图。鼠标不参与（桌面用箭头按钮或方向键），
  // 免得一次划选文字就被误判成翻页。
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const SWIPE_MIN_PX = 48;

  const handlePointerDown = (event: ReactPointerEvent) => {
    if (event.pointerType === 'mouse') return;
    swipeStartRef.current = { x: event.clientX, y: event.clientY };
  };

  const handlePointerUp = (event: ReactPointerEvent) => {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    // 位移太小视为点击；竖向为主视为滚动，都不翻页
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.2) return;
    if (dx < 0 && hasNext) onNavigate(1);
    else if (dx > 0 && hasPrev) onNavigate(-1);
  };

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
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          swipeStartRef.current = null;
        }}
        aria-describedby={undefined}
        className="w-auto max-w-[min(1120px,94vw)] gap-0 border-0 bg-transparent p-0 shadow-none [&>button]:text-white/70 [&>button:hover]:text-white"
      >
        <DialogTitle className="sr-only">
          {image?.title || '图片预览'}
          {index !== null
            ? `（第 ${Math.min(index + 1, images.length)} 张，共 ${images.length} 张）`
            : ''}
        </DialogTitle>

        {/* 可见的翻页计数：读屏有 DialogTitle，但明眼用户也需要知道翻到第几张。
            索引可能临时等于 images.length（下一页占位），计数夹到当前已加载张数。 */}
        {index !== null && images.length > 1 && (
          <span
            aria-hidden="true"
            className="absolute left-1/2 top-1 -translate-x-1/2 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-medium tabular-nums text-white/85 backdrop-blur-sm sm:top-2"
          >
            {Math.min(index + 1, images.length)} / {images.length}
          </span>
        )}

        {/* 翻到末尾、下一页还在路上：给个明确的加载态，别让对话框空着 */}
        {isPendingNext && (
          <div
            role="status"
            className="flex min-h-[38vh] min-w-[min(74vw,320px)] flex-col items-center justify-center gap-3 text-center"
          >
            <Loader2 className="h-7 w-7 animate-spin text-white/70" aria-hidden="true" />
            <p className="text-sm text-white/80">正在加载下一张…</p>
          </div>
        )}

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
                  {copied ? (
                    <Check className="mr-1 h-3 w-3" aria-hidden="true" />
                  ) : (
                    <CopyIcon className="mr-1 h-3 w-3" aria-hidden="true" />
                  )}
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
