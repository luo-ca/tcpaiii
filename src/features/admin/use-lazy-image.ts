import { useState, useEffect, useRef, useCallback } from 'react';

import type { LazyImageState } from '@/lib/types';

/**
 * useLazyImage — IntersectionObserver-based lazy loading hook.
 */
export function useLazyImage(src: string, eager = false): {
  containerRef: React.RefObject<HTMLDivElement | null>;
  activeSrc: string | undefined;
  state: LazyImageState;
  onLoad: () => void;
  onError: () => void;
} {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<LazyImageState>(eager ? 'loading' : 'idle');

  // eager 必须能独立取源，不能只看 state：卡片按 img.id 复用，而 eager 由
  // 数组位置决定，筛选/删除后原本在次屏外、state 仍是 'idle' 的卡片会被挪到
  // index < 6 上 —— 此时 observer 早已被 cleanup 断开且 eager 分支不再重挂，
  // state 会永远停在 'idle'，那张图就永远停在骨架屏上。
  const activeSrc = eager || state !== 'idle' ? src : undefined;

  useEffect(() => {
    if (eager) return;
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          // 只把「还没开始」的 idle 卡推进到 loading。已终结的 loaded / error
          // 绝不能被复活的 observe 拉回 loading：卡片按 img.id 复用、eager 由位置
          // 决定，一张已加载的卡从 index<6 挪到 index≥6 时 eager true→false 会让
          // 本 effect 重新挂 observer，observe() 规范保证首次必回报交叉态 —— 若该卡
          // 此刻仍在视口内，无条件的推进会把 loaded 打回 loading，
          // 而 src 没变、浏览器不再重新加载、onLoad 永不复燃 → 永久停在骨架屏。
          setState((current) => (current === 'idle' ? 'loading' : current));
          observer.disconnect();
        }
      },
      { rootMargin: '400px' },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [eager]);

  const onLoad = useCallback(() => setState('loaded'), []);
  const onError = useCallback(() => setState('error'), []);

  return { containerRef, activeSrc, state, onLoad, onError };
}
