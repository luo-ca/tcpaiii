import { SearchX } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * 全站统一的空态：图标 + 标题 + 说明 + 可选动作（由调用方传入，通常是引导按钮）。
 */
export function EmptyState({
  icon: Icon = SearchX,
  title,
  message,
  children,
  className = '',
}: {
  icon?: typeof SearchX;
  title: string;
  message?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={`glass-strong mx-auto max-w-md rounded-2xl p-8 text-center ${className}`}
    >
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-ink bg-secondary/70">
        <Icon className="h-7 w-7 text-muted-foreground/50" aria-hidden="true" />
      </div>
      <p className="text-lg font-bold text-foreground">{title}</p>
      {message && <p className="mt-2 text-sm text-muted-foreground">{message}</p>}
      {children && <div className="mt-5 flex justify-center">{children}</div>}
    </div>
  );
}
