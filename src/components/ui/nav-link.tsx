import { forwardRef } from 'react';
import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from 'react';
import { navigate } from '@/lib/router';

type NavLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  to: string;
  children: ReactNode;
};

/**
 * 站内链接。
 *
 * 渲染成真实的 `<a href="/docs">`，而不是按钮 —— 这样中键、右键「在新标签页打开」、
 * 悬停看地址、以及爬虫抓取链接全部照常工作；只有「当前窗口左键单击」才被接管成
 * 客户端跳转，避免整页刷新。
 */
export const NavLink = forwardRef<HTMLAnchorElement, NavLinkProps>(function NavLink(
  { to, children, onClick, target, ...rest },
  ref,
) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    // 调用方已经 preventDefault，或点击的是带修饰键 / 非左键 / 指定新窗口 —— 都交回浏览器
    if (event.defaultPrevented) return;
    if (event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (target && target !== '_self') return;
    // 绝对地址（http:) 或协议相对（//）视为外链，不拦截
    if (/^[a-z][a-z0-9+.-]*:/i.test(to) || to.startsWith('//')) return;

    event.preventDefault();
    navigate(to);
  };

  return (
    <a ref={ref} href={to} target={target} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
});
