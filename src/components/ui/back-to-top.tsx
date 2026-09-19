import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { prefersReducedMotion } from '@/lib/helpers';

/** 滚动超过这个距离才出现，避免短页面也弹一个按钮 */
const SHOW_AFTER_PX = 900;

/**
 * 回到顶部。
 *
 * 图库可以一直「加载更多」到几百张，翻到底想改筛选条件时，滚回去很费劲。
 * 挂在 App 根节点一次，所有长页面共享；短页面（未超过阈值）不会出现。
 *
 * z-40 刻意低于弹层的 z-50 —— 灯箱打开时按钮被遮住，不会浮在图上。
 */
export function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => setVisible(window.scrollY > SHOW_AFTER_PX);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleClick = () => {
    // 显式传 smooth 会绕过 html 上的 reduced-motion 降级，这里自己判断一次
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  };

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="回到顶部"
      title="回到顶部"
      className="animate-fade-in ink-shadow fixed bottom-5 right-5 z-40 inline-flex h-11 w-11 items-center justify-center rounded-full border-2 border-ink bg-white text-foreground transition-[background-color,transform] duration-200 hover:bg-brand-50 motion-safe:hover:-translate-x-0.5 motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-x-0 motion-safe:active:translate-y-0 sm:bottom-7 sm:right-7"
    >
      <ArrowUp className="h-4 w-4" aria-hidden />
    </button>
  );
}
