import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 全站错误态的重试按钮要有进行中反馈（P110）。
 *
 * ErrorState 是整页/整区块加载失败时的共用组件，三个调用方
 * （gallery-browse 的图库失败、admin-page 的图库失败、RouteErrorBoundary 的
 * 区块崩溃）传进来的 onRetry 都是会发请求的函数（react-query 的 refetch）。
 *
 * 但 prop 签名是 `() => void`：返回值被丢掉，组件无从知道请求是否在进行 ——
 * 按钮点完外观毫无变化。网络慢时用户会反复点，每次再发一个请求；
 * 而 RouteErrorBoundary 的 chunk 错误重试实际是 location.reload()，
 * 连点还可能触发多次刷新。
 *
 * 修法：组件自己接管（useState + finally），请求期间禁用并换成「重试中…」，
 * 三个调用方无需改动、自动受益。
 */

const src = readFileSync(
  resolve(process.cwd(), "src/components/states/ErrorState.tsx"),
  "utf8",
);

describe("ErrorState · 重试按钮有进行中反馈", () => {
  it("组件内部维护进行中状态", () => {
    expect(src, "缺 useState：无从跟踪重试是否在进行").toMatch(/useState/);
    expect(src, "未定义 retrying 状态").toContain("retrying");
  });

  it("重试在请求期间被禁用，并标 aria-busy", () => {
    expect(src, "缺 disabled={retrying}：请求中仍可连点").toContain("disabled={retrying}");
    expect(src, "缺 aria-busy：读屏无从得知正在重试").toContain("aria-busy={retrying}");
  });

  it("文案与图标随状态切换", () => {
    expect(src, "缺「重试中…」文案").toContain("重试中…");
    expect(src, "缺 animate-spin 的加载图标").toContain("animate-spin");
    // 未在重试时仍显示调用方传入的文案（chunk 错误是「重新加载」）
    expect(src, "未重试时不再使用调用方传入的 retryLabel").toMatch(/: retryLabel/);
  });

  it("同步与异步 onRetry 都能复位按钮", () => {
    // RouteErrorBoundary 的 onRetry 是同步的（清错误态），
    // react-query 的 refetch 返回 Promise —— 必须用 Promise.resolve().then()
    // 包一层，两种都能落到 finally。
    expect(src, "未用 Promise.resolve 包住 onRetry，同步实现会漏掉 finally").toMatch(
      /Promise\.resolve\(\)/,
    );
    expect(src, "缺 finally：重试完成后按钮会一直停在「重试中…」").toContain("finally");
  });

  it("防重入：retrying 期间再次点击直接返回", () => {
    expect(src, "缺防重入判断").toMatch(/if \(!onRetry \|\| retrying\) return;/);
  });
});
