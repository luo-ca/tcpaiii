import { ImageOff, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * 全站统一的错误态：图标 + 标题 + 说明 + 重试动作。
 *
 * 供整页 / 整区块加载失败时使用；区块内部的小型错误（如预览图加载失败）
 * 因布局语境不同，仍保留就地渲染。
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
      className={`mx-auto max-w-md rounded-2xl border border-red-100 glass-strong p-8 text-center ${className}`}
    >
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50">
        <Icon className="h-7 w-7 text-red-400" aria-hidden="true" />
      </div>
      <p className="text-lg font-medium text-foreground">{title}</p>
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
