import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/**
 * 贴纸标签 chip 的单点定义：`/gallery` 筛选、admin 筛选、首页在线预览三处共用。
 * 硬投影激活态由 index.css 的 `.category-button.active` 承担——刻意不写成
 * Tailwind 工具类，transition/transform 也在同一处，避免三副本漂移。
 */
export function TagChip({
  active = false,
  size = 'md',
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  size?: 'sm' | 'md';
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        'category-button shrink-0 snap-start cursor-pointer rounded-full border-2 border-ink font-medium',
        size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-3.5 py-1.5 text-sm',
        active
          ? 'active bg-primary text-primary-foreground'
          : 'bg-white text-muted-foreground hover:bg-brand-50 hover:text-foreground',
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
