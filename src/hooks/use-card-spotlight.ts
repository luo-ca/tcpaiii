import { useEffect } from 'react';

/**
 * 光标跟随柔光的全局驱动。
 *
 * 只挂**一个**指针监听（并做 rAF 合帧），为指针下方最近的 `.spotlight-card`
 * 写入 `--spot-x` / `--spot-y`；具体光斑由 CSS 的 `.spotlight-card::after` 渲染。
 *
 * 采用事件委托而非给每张卡片回调：卡片是列表批量渲染的，逐个绑监听会成倍增加；
 * 且只对精确指针（`pointer: fine`）启用，触摸设备直接不挂、不产生任何开销。
 */
export function useCardSpotlight() {
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    if (!window.matchMedia('(pointer: fine)').matches) return;

    let frame = 0;
    let pending: { el: HTMLElement; x: number; y: number } | null = null;

    const flush = () => {
      frame = 0;
      if (!pending) return;
      const { el, x, y } = pending;
      pending = null;
      el.style.setProperty('--spot-x', `${x}px`);
      el.style.setProperty('--spot-y', `${y}px`);
    };

    const onMove = (event: PointerEvent) => {
      const target = event.target;
      const el =
        target instanceof Element ? target.closest<HTMLElement>('.spotlight-card') : null;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      pending = { el, x: event.clientX - rect.left, y: event.clientY - rect.top };
      if (!frame) frame = requestAnimationFrame(flush);
    };

    document.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      document.removeEventListener('pointermove', onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
}
