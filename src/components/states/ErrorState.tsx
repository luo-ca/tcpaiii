import { ImageOff, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * 全站统一的错误态：图标 + 标题 + 说明 + 重试动作。
 *
 * 供整页 / 整区块加载失败时使用；区块内部的小型错误（如预览图加载失败）
 * 因布局语境不同，仍保留就地渲染。
 *
 * 容器刻意保持中性的墨线贴纸卡（与 EmptyState 一致，遵守「容器中性克制」）。
 * 注意：不要在卡片上再挂 border-<色> 工具类 —— .glass-strong 的 border 简写在
 * 产物 CSS 中排在 Tailwind 工具类之后（同为 @layer utilities，后者胜），会把
 * 边框颜色工具类盖成永不生效的死类（ErrorState 曾因此在卡片上挂 border-red-200
 * 却从不渲染）。错误的「红色」信号由内层图标容器（border-destructive-line +
 * bg-destructive-soft + text-destructive）与 role="alert" 承担。
 */
export function ErrorState({
  icon: Icon = ImageOff,
  title,
  message,
  onRetry,
  retryLabel = '重新加载',
  className = '',
}: {
  icon?: typeof ImageOff;
  title: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={`glass-strong mx-auto max-w-md rounded-2xl p-8 text-center ${className}`}
    >
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-destructive-line bg-destructive-soft">
        <Icon className="h-7 w-7 text-destructive" aria-hidden="true" />
      </div>
      <p className="text-lg font-bold text-foreground">{title}</p>
      {message && <p className="mt-2 text-sm text-muted-foreground">{message}</p>}
      {onRetry && (
        <Button className="mt-5" variant="outline" onClick={onRetry}>
          <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
