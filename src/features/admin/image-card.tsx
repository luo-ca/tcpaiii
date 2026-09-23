import { memo } from 'react';
import {
  Trash2,
  Copy,
  Image,
  Loader2,
  CheckSquare,
  Square,
} from 'lucide-react';

import type { ImageRecord } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useLazyImage } from './use-lazy-image';
import { EditImageDialog } from './edit-image-dialog';

// ============================================================
// Image Card
// ============================================================

// 一屏最多 48 张卡：不 memo 的话搜索框每敲一个字符，全部卡片连带
// EditImageDialog 的 state 一起重渲染。回调已全部提到稳定引用，
// img 对象在 react-query 缓存里没有新数据时身份也不变，memo 命中率高。
export const ImageCard = memo(function ImageCard({
  img,
  index,
  adminToken,
  onCopyUrl,
  onDelete,
  onRefresh,
  onRequireToken,
  isDeleting,
  selectable,
  selected,
  onToggleSelect,
}: {
  img: ImageRecord;
  index: number;
  adminToken: string;
  onCopyUrl: (url: string) => void;
  onDelete: (id: string) => void;
  onRefresh: () => void;
  onRequireToken: () => Promise<boolean>;
  isDeleting: boolean;
  selectable: boolean;
  selected: boolean;
  onToggleSelect: (id: string) => void;
}) {
  const eager = index < 6;
  const { containerRef, activeSrc, state, onLoad, onError } = useLazyImage(img.url, eager);

  return (
    <Card
      className={`glass-card group animate-fade-in overflow-hidden rounded-2xl ${
        selected ? 'ring-2 ring-brand-500' : ''
      }`}
      style={{ animationDelay: `${Math.min(index, 12) * 0.04}s` }}
    >
      <CardContent className="p-0">
        <div ref={containerRef as React.RefObject<HTMLDivElement>} className="relative aspect-video overflow-hidden bg-muted/50">
          {state !== 'loaded' && state !== 'error' && (
            <div className="absolute inset-0 skeleton-shimmer" aria-hidden="true" />
          )}

          {state === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted/40 text-muted-foreground">
              <Image className="w-8 h-8 opacity-40" aria-hidden="true" />
              <span className="text-xs">加载失败</span>
            </div>
          )}

          {/* 选择模式下的左上角复选框：pointer-coarse 下浮层常显会挡住它，
              所以单独占一个高层级、不随 hover 隐藏 */}
          {selectable && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onToggleSelect(img.id);
              }}
              className="absolute left-2 top-2 z-20 flex h-8 w-8 items-center justify-center rounded-lg border-2 border-ink bg-white/95 shadow-[2px_2px_0_0_var(--color-ink)] transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2"
              aria-pressed={selected}
              aria-label={selected ? `取消选择：${img.title || '未命名图片'}` : `选择：${img.title || '未命名图片'}`}
            >
              {selected ? <CheckSquare className="h-4 w-4 text-brand-500" aria-hidden="true" /> : <Square className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
            </button>
          )}

          {activeSrc && (
            <img
              src={activeSrc}
              alt={img.title || '未命名图片'}
              className={`w-full h-full object-cover transition-[opacity,transform] duration-500 motion-safe:group-hover:scale-108 ${
                state === 'loaded' ? 'opacity-100' : 'opacity-0'
              }`}
              decoding="async"
              onLoad={onLoad}
              onError={onError}
            />
          )}

          {/* 标题/标签/操作按钮浮层。是否「悬停才显示」必须按**指针能力**判断，
              不能按视口宽度：平板（如 768px iPad）宽度已 ≥sm 却仍是触摸屏、没有 hover，
              用视口断点来近似 hover，会把浮层永久藏住，里面的复制/编辑/删除按钮直接点不到。
              这里的 pointer-coarse 与公开图库（gallery-browse）、首页图库（GalleryPreview）一致。
              另补 group-focus-within：键盘 Tab 到按钮时也要能看见浮层。 */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100" />

          <div className="absolute inset-x-0 bottom-0 p-3.5 translate-y-1 transition-[opacity,transform] duration-300 opacity-0 motion-safe:group-hover:translate-y-0 group-hover:opacity-100 motion-safe:group-focus-within:translate-y-0 group-focus-within:opacity-100 pointer-coarse:translate-y-0 pointer-coarse:opacity-100">
            <div className="flex items-end justify-between gap-2">
              <div className="min-w-0 flex-1">
                {/* h3 而不是 h4：卡片网格挂在页面 h1「图片管理」之下，用 h3 与页头
                    形成 h1 → h3 的层级（跳一级不影响读屏跳读，但 h4 会更碎）。
                    公开图库的瓦片不用标题元素 —— 它整个是 button，标题元素不能嵌在
                    按钮里；这里卡片不是 button，用 h3 合法且对「按标题浏览图片」有价值。

                    注：原文写的理由是「该 h3 早于 h1 出现（页头在网格之后渲染）」，
                    但页头早已移到网格之前（现 admin-page.tsx 中 h1 在 ~345 行、
                    <ImageCard> 在 ~632 行），那个理由不再成立，已按现状改写。 */}
                <h3 className="text-white font-semibold text-sm truncate leading-snug">{img.title}</h3>
                <div className="flex gap-1 mt-1.5 flex-wrap">
                  {img.tags.map((tag) => (
                    <span
                      key={tag}
                      className="sticker-chip rounded-full px-1.5 py-0.5 text-[11px]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button
                  variant="secondary"
                  size="icon"
                  className="sticker-chip h-7 w-7 rounded-lg transition-transform"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCopyUrl(img.url);
                  }}
                  aria-label={`复制图片地址：${img.title || '未命名图片'}`}
                >
                  <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                </Button>
                <EditImageDialog
                  image={img}
                  adminToken={adminToken}
                  onSuccess={onRefresh}
                  onRequireToken={onRequireToken}
                />
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="destructive"
                      size="icon"
                      className="h-7 w-7 rounded-lg border-2 border-ink bg-destructive-ink text-white shadow-[2px_2px_0_0_var(--color-ink)] transition-transform hover:bg-destructive-ink/90"
                      aria-label={isDeleting ? `正在删除：${img.title || '未命名图片'}` : `删除图片：${img.title || '未命名图片'}`}
                      disabled={isDeleting}
                    >
                      {isDeleting ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      )}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="glass-strong rounded-2xl">
                    <AlertDialogHeader>
                      <AlertDialogTitle>确认删除</AlertDialogTitle>
                      <AlertDialogDescription>
                        确定要删除「{img.title}」吗？此操作不可撤销。
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="rounded-xl">取消</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={async () => {
                          if (await onRequireToken()) onDelete(img.id);
                        }}
                        className="bg-destructive-ink text-white hover:bg-destructive-ink/90 rounded-xl"
                      >
                        删除
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
});
