import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  isChunkLoadError,
  claimChunkReload,
  CHUNK_RELOAD_KEY,
  CHUNK_RELOAD_COOLDOWN_MS,
} from "@/lib/chunk-error";
import { RouteErrorBoundary } from "@/components/layout/RouteErrorBoundary";

/**
 * 路由级 chunk 韧性（清单项 1）：部署换代后旧页面的 lazy chunk 404，
 * 以前 RootErrorBoundary 会 innerHTML 全页兜底 —— 好好的首页也被拖死。
 * 现在：错误只圈在 <main> 里这一块，chunk 类错误自动刷新一次（冷却闸门
 * 防循环），换页自动清错误态。这里钉住三层：
 *  1. 各浏览器 chunk 失败消息形态的识别（识别不到 = 不自愈 = 本特性失效）；
 *  2. 时间戳冷却闸门：首次放行、窗口内拦截、窗口外再放行、storage 抛错降级；
 *  3. 边界行为：成功渲染子树；错误态文案按 chunk/generic 分流；
 *     componentDidCatch 对 chunk 错误刷新且**只刷一次**（防循环是本特性
 *     最大的自我伤害风险）；手动重试对 chunk 必须 reload（React.lazy
 *     缓存 rejection，复位状态永远修不好），对 generic 才复位。
 */

const CHUNK_MSG =
  "error loading dynamically imported module from https://t.paiii.cn/assets/status-page-abc123.js";
const GENERIC_MSG = "Cannot read properties of undefined (reading 'tags')";

function makeChunkError(message = CHUNK_MSG) {
  return new Error(message);
}

/**
 * 伪造 window.sessionStorage。
 *
 * 参数类型原先写成 `Record<string, string> & { throwOnGet?: boolean }`：
 * 那个索引签名要求**每一个**属性的值都是 string，于是 throwOnGet: true
 * （布尔）永远无法赋给它 —— 交叉类型里的 boolean 被索引签名否掉了。
 * tsc 一直在报 TS2345，只是 lint / test / build 都不跑 tsc，所以谁也没发现。
 * 改成显式列出 seed（预置键值）与 throwOnGet（模拟沙箱抛错）两块。
 */
function stubWindow(options?: { seed?: Record<string, string>; throwOnGet?: boolean }) {
  const reload = vi.fn();
  const store = new Map<string, string>();
  const fake: Record<string, unknown> = {
    location: { reload },
    sessionStorage: {
      getItem: (key: string) => {
        if (options?.throwOnGet) throw new Error("SecurityError");
        return store.get(key) ?? null;
      },
      setItem: (key: string, value: string) => void store.set(key, String(value)),
      removeItem: (key: string) => void store.delete(key),
    },
  };
  vi.stubGlobal("window", fake);
  return { reload, store };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isChunkLoadError：各引擎的 chunk 失败形态都要认得", () => {
  it.each([
    "ChunkLoadError: Loading chunk 7 failed.",
    "Loading CSS chunk 3 failed for (https://x/assets/index.css)",
    "Failed to fetch dynamically imported module: https://x/assets/status-page.js",
    "error loading dynamically imported module from https://x/assets/status-page.js",
    "Importing a module script failed.",
  ])("识别 %s", (message) => {
    expect(isChunkLoadError(makeChunkError(message))).toBe(true);
  });

  it("普通运行时错误不得误判为 chunk 错误（否则会无谓刷新）", () => {
    expect(isChunkLoadError(makeChunkError(GENERIC_MSG))).toBe(false);
    expect(isChunkLoadError(new TypeError("x is not a function"))).toBe(false);
    expect(isChunkLoadError("plain string rejection")).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
  });
});

describe("claimChunkReload：时间戳冷却闸门", () => {
  it("首次放行并记录时间戳；窗口内再次调用被拦", () => {
    stubWindow();
    const t0 = 1_700_000_000_000;
    expect(claimChunkReload(t0)).toBe(true);
    expect(claimChunkReload(t0 + 1_000)).toBe(false);
    expect(claimChunkReload(t0 + CHUNK_RELOAD_COOLDOWN_MS - 1)).toBe(false);
  });

  it("超出冷却窗口再次放行（坏部署下用户几分钟后重进还能自愈）", () => {
    stubWindow();
    const t0 = 1_700_000_000_000;
    expect(claimChunkReload(t0)).toBe(true);
    expect(claimChunkReload(t0 + CHUNK_RELOAD_COOLDOWN_MS)).toBe(true);
  });

  it("storage 里的时间戳损坏时按「可放行」处理并覆盖", () => {
    const { store } = stubWindow();
    store.set(CHUNK_RELOAD_KEY, "not-a-number");
    expect(claimChunkReload(5)).toBe(true);
    expect(store.get(CHUNK_RELOAD_KEY)).toBe("5");
  });

  it("sessionStorage 抛错（沙箱/隐私模式）降级为不自动刷新", () => {
    stubWindow({ throwOnGet: true });
    expect(claimChunkReload()).toBe(false);
  });
});

function makeBoundary(error: Error | null) {
  const boundary = new RouteErrorBoundary({
    resetKey: "/status",
    children: createElement("span", null, "route-content"),
  });
  boundary.state = { error };
  return boundary;
}

describe("RouteErrorBoundary 渲染分流", () => {
  it("无错误时原样渲染子树", () => {
    const html = renderToStaticMarkup(makeBoundary(null).render());
    expect(html).toContain("route-content");
  });

  it("chunk 错误：文案点破「资源已更新」并给出「重新加载」", () => {
    const html = renderToStaticMarkup(makeBoundary(makeChunkError()).render());
    expect(html).toContain("页面资源已更新");
    expect(html).toContain("重新加载");
    expect(html).not.toContain("route-content");
  });

  it("普通渲染错误：不谎称部署问题，动作是「重试」", () => {
    const html = renderToStaticMarkup(makeBoundary(makeChunkError(GENERIC_MSG)).render());
    expect(html).toContain("页面出错了");
    expect(html).toContain("重试");
    expect(html).not.toContain("页面资源已更新");
  });
});

describe("RouteErrorBoundary 行为", () => {
  it("chunk 错误 componentDidCatch 自动刷新，且冷却窗口内第二次失败不再刷（防循环）", () => {
    const { reload } = stubWindow();
    const first = makeBoundary(null);
    first.componentDidCatch(makeChunkError(), { componentStack: "" });
    expect(reload).toHaveBeenCalledTimes(1);

    // 模拟「刷新后仍是坏部署」：同一会话内再来一次 chunk 失败
    const second = makeBoundary(null);
    second.componentDidCatch(makeChunkError(), { componentStack: "" });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("普通错误 componentDidCatch 绝不触发刷新", () => {
    const { reload } = stubWindow();
    makeBoundary(null).componentDidCatch(makeChunkError(GENERIC_MSG), { componentStack: "" });
    expect(reload).not.toHaveBeenCalled();
  });

  it("手动重试：chunk 错误走 reload（lazy 缓存 rejection，复位无效）", () => {
    const { reload } = stubWindow();
    const boundary = makeBoundary(makeChunkError());
    boundary.setState = vi.fn();
    boundary.handleRetry();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(boundary.setState).not.toHaveBeenCalled();
  });

  it("手动重试：普通错误复位错误态即可，不刷新页面", () => {
    const { reload } = stubWindow();
    const boundary = makeBoundary(makeChunkError(GENERIC_MSG));
    const setState = vi.fn();
    boundary.setState = setState;
    boundary.handleRetry();
    expect(reload).not.toHaveBeenCalled();
    expect(setState).toHaveBeenCalledWith({ error: null });
  });

  it("换路由（resetKey 变化）即清错误态 —— 上一块的失败不得扣留新页", () => {
    const boundary = new RouteErrorBoundary({
      resetKey: "/status",
      children: createElement("span", null, "a"),
    });
    boundary.state = { error: makeChunkError(GENERIC_MSG) };
    const setState = vi.fn();
    boundary.setState = setState;
    boundary.componentDidUpdate({ resetKey: "/status", children: null });
    expect(setState).not.toHaveBeenCalled();
    boundary.componentDidUpdate({ resetKey: "/gallery", children: null });
    expect(setState).toHaveBeenCalledWith({ error: null });
  });
});

describe("App 接线守卫（源文本）", () => {
  const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

  it("边界以当前路由为 resetKey 包住 main 内子树", () => {
    expect(appSource).toContain("<RouteErrorBoundary resetKey={route}>");
    // 首页分支必须在边界之内 —— 边界只圈 lazy 页的话，首页反而没人保护
    const wrapped = appSource.slice(
      appSource.indexOf("<RouteErrorBoundary"),
      appSource.indexOf("</RouteErrorBoundary>"),
    );
    expect(wrapped).toContain("{route === '/' && <HomePage />}");
  });
});
