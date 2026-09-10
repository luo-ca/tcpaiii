import { useSyncExternalStore } from 'react';

/**
 * 站内路由。零依赖实现，只用 History API。
 *
 * 为什么不用 react-router：全站只有 3 个静态页面、没有嵌套路由 / loader /
 * 数据预取，引入 ~20KB(gzip) 的依赖不划算。这里 60 行覆盖全部所需能力。
 *
 * 服务端回落由 `edgeone.json` 的 SPA fallback 负责：
 *   { "rewrites": [{ "source": "/*", "destination": "/index.html" }] }
 * 官方文档明确该配置只在「未命中任何静态资源与函数」时才生效，
 * 所以直接访问 `/gallery`、`/docs` 不会 404，且不会影响 /api/* 与 /assets/*。
 */

/**
 * 站内页面。`/admin` 是图库管理后台（需 admin token），刻意不放进任何对外导航
 * 与 sitemap，且带 noindex —— 它不是给访客和搜索引擎看的。
 */
export const ROUTES = ['/', '/gallery', '/docs', '/admin'] as const;
export type RoutePath = (typeof ROUTES)[number];

/** 同页重复跳转时 popstate 不会触发，用自定义事件补齐广播。 */
const NAVIGATE_EVENT = 'paiii:navigate';

const isBrowser = typeof window !== 'undefined';

function normalize(pathname: string): RoutePath {
  const trimmed = pathname.replace(/\/+$/, '');
  const path = trimmed === '' ? '/' : trimmed;
  // 未知路径一律归入首页（edgeone.json 的 SPA fallback 保证了这类请求也能拿到 index.html）
  return (ROUTES as readonly string[]).includes(path) ? (path as RoutePath) : '/';
}

let snapshot: RoutePath = '/';
const listeners = new Set<() => void>();

function readLocation(): RoutePath {
  return isBrowser ? normalize(window.location.pathname) : '/';
}

function emit() {
  const next = readLocation();
  if (next === snapshot) return;
  snapshot = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): RoutePath {
  return snapshot;
}

if (isBrowser) {
  snapshot = readLocation();
  window.addEventListener('popstate', emit);
  window.addEventListener(NAVIGATE_EVENT, emit);
}

/** 当前路由。用 useSyncExternalStore 而非 Context，任何组件都能零成本订阅。 */
export function useRoute(): RoutePath {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * 跳转后定位滚动位置。
 * 有 hash 时等目标区块挂载（区块可能是 lazy 的）再滚；否则回到页面顶部。
 */
function settleScroll(hash: string) {
  if (hash) {
    let attempts = 0;
    const tryScroll = () => {
      let target: Element | null = null;
      try {
        target = document.querySelector(hash);
      } catch {
        // hash 不是合法选择器（含特殊字符）时放弃滚动，不影响跳转本身
      }
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      if (attempts < 20) {
        attempts += 1;
        requestAnimationFrame(tryScroll);
      }
    };
    requestAnimationFrame(tryScroll);
    return;
  }
  window.scrollTo({ top: 0, behavior: 'auto' });
}

/** 站内跳转。`to` 可以是 `/docs` 这样的路径，也可以带 `#anchor`。 */
export function navigate(to: string, options: { replace?: boolean } = {}) {
  if (!isBrowser) return;

  const url = new URL(to, window.location.origin);
  // 只把 path/search/hash 写进地址栏，丢弃 origin 以免跨域场景出错
  const next = `${url.pathname}${url.search}${url.hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;

  // 已经在这个位置了（例如在首页再点一次「随机」）：不写历史，只把视口带回去
  if (next === current) {
    settleScroll(url.hash);
    return;
  }

  if (options.replace) {
    window.history.replaceState(null, '', next);
  } else {
    window.history.pushState(null, '', next);
  }

  emit();
  settleScroll(url.hash);
}
