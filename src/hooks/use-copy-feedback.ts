import { useCallback, useEffect, useRef, useState } from 'react';
import { copyText } from '@/lib/helpers';

/**
 * 统一的复制反馈。
 *
 * 全站的复制提示只有一个来源：`copyText` 内部的 sonner toast。
 * 这个 hook 只负责按钮自身的瞬时状态（图标/文案切换），避免每个按钮
 * 各自维护一套 feedback 逻辑。
 *
 * 同时修掉了原先裸 `setTimeout` 的问题：组件卸载后仍会 setState。
 */
export function useCopyFeedback(timeoutMs = 2000) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const copy = useCallback(
    async (text: string, successMessage?: string): Promise<boolean> => {
      const ok = await copyText(text, successMessage);
      if (!ok) return false;

      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), timeoutMs);
      return true;
    },
    [timeoutMs],
  );

  return { copied, copy };
}
