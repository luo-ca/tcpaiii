import { useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import { toast } from 'sonner';
import { prefersReducedMotion } from './helpers';

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
 * `/status` 是迷你服务状态页：健康检查 + KV 绑定 + 自助调用测速，给「接口挂了？」
 * 的访客一个不用翻文档就能自证的入口。
 */
export const ROUTES = ['/', '/gallery', '/docs', '/status', '/admin'] as const;
export type RoutePath = (typeof ROUTES)[number];

/**
 * 软 404 提示里回显路径的字符上限。
 *
 * 路径来自 window.location.pathname —— 是**未经校验的用户输入**：
 * 拼错的分享链接、爬虫扫的长垃圾路径都可能几千字符。原样拼进 toast
 * 会铺成一大块文本盖住页面（toast 是文本渲染，无 XSS，但会挡内容）。
 * 截断并在末尾加省略号，让用户知道显示的不是全貌。
 */
const MAX_DISPLAY_PATH_LENGTH = 60;

/** 把路径裁到可展示长度；超长时以省略号结尾。 */
export function truncatePathForDisplay(path: string): string {
  if (path.length <= MAX_DISPLAY_PATH_LENGTH) return path;
  return path.slice(0, MAX_DISPLAY_PATH_LENGTH) + '…';
}

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

type StartViewTransition = (updateCallback: () => void) => unknown;
const docWithViewTransition = isBrowser
  ? (document as Document & { startViewTransition?: StartViewTransition })
  : null;

/**
 * 跨页跳转可用的 startViewTransition；同页锚点、减弱动效、不支持的浏览器返回 null。
 * 返回前 bind(document)，抽出函数调用不会丢 this。
 */
function getViewTransition(nextPathname: string): StartViewTransition | null {
  const start = docWithViewTransition?.startViewTransition;
  if (!start) return null;
  if (prefersReducedMotion()) return null;
  if (nextPathname === window.location.pathname) return null;
  return start.bind(docWithViewTransition);
}

if (isBrowser) {
  // 软 404 收口：SPA fallback 让任意错拼路径都返回 200 + 首页内容，
  // 地址栏与内容分裂、canonical 又指回首页会把这个假象固化。
  // 直接把地址改写回真实落地页，DOM / 地址栏 / canonical 三者回到一致。
  const rawPath = window.location.pathname.replace(/\/+$/, '') || '/';
  if (!(ROUTES as readonly string[]).includes(rawPath)) {
    window.history.replaceState(null, '', '/');
    // 等 Toaster 挂载订阅后再播报，模块求值期直发会被 sonner 丢掉
    window.setTimeout(() => toast.warning(`页面「${truncatePathForDisplay(rawPath)}」不存在，已回到首页`), 300);
  }
  snapshot = readLocation();
  window.addEventListener('popstate', emit);
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
        target.scrollIntoView({
          behavior: prefersReducedMotion() ? 'auto' : 'smooth',
          block: 'start',
        });
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

  const pushAndEmit = () => {
    if (options.replace) {
      window.history.replaceState(null, '', next);
    } else {
      window.history.pushState(null, '', next);
    }
    emit();
  };

  const startViewTransition = getViewTransition(url.pathname);
  if (startViewTransition) {
    // flushSync 确保回调返回前 React 已把新页面渲染进 DOM，
    // 否则 View Transition 会把「更新前的画面」当成新状态截下来。
    startViewTransition(() => {
      flushSync(pushAndEmit);
      settleScroll(url.hash);
    });
  } else {
    pushAndEmit();
    settleScroll(url.hash);
  }
}
