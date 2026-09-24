import { useCallback, useEffect, useRef, useState } from 'react';
import { copyText } from '@/lib/helpers';

/**
 * 统一的复制反馈。
 *
 * 全站的复制提示只有一个来源：`copyText` 内部的 sonner toast。
 * 这个 hook 只负责按钮自身的瞬时状态（图标/文案切换），避免每个按钮
 * 各自维护一套 feedback 逻辑。
 *
 * 同时修掉两个「组件卸载后仍会 setState」的路径（P139）：
 *  1. 已计时的复位 —— 卸载时 clearTimeout，这条原先就有。
 *  2. **飞行中的 promise** —— 原先漏掉。`copy` 里 `await copyText(...)` 期间
 *     组件若被卸载（点了复制立刻关灯箱、或切路由），promise 恢复后照样
 *     `setCopied(true)` 并挂上新的 setTimeout —— 那是卸载之后才建立、
 *     永远不会被清理的副作用（清理函数早已跑完）。用 mountedRef 在 await
 *     之后守卫。
 *
 * 为什么必须有第 2 条：useEffect 清理只在「本次渲染已提交」时注册，
 * 而 await 恢复是宏任务，两者时序不保证，只能显式判活。
 */
export function useCopyFeedback(timeoutMs = 2000) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const copy = useCallback(
    async (text: string, successMessage?: string): Promise<boolean> => {
      const ok = await copyText(text, successMessage);
      if (!ok) return false;
      // await 期间可能已卸载：此后 setState / 设 timer 都是悬挂副作用
      if (!mountedRef.current) return true;

      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), timeoutMs);
      return true;
    },
    [timeoutMs],
  );

  return { copied, copy };
}
