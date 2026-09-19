import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import StatusPage from "@/features/status-page";
import { ROUTES } from "@/lib/router";
import { HEADER_TABS } from "@/lib/constants";
import { fetchHealth, measureRandomLatency } from "@/lib/api";
import type { HealthPayload } from "@/lib/types";

/**
 * 迷你状态页（P52，清单项 7）的三层契约：
 *  1. 渲染：首帧（react-query 未落地 = loading）不崩，骨架与页头齐全；
 *  2. 路由/导航一致性：/status 进了 ROUTES、顶栏页签与移动端网格列数同步
 *     —— 列数跟不上的话导航折成两行，--header-h 少算，全站顶部被遮
 *     （P22 顶栏高度契约的延伸，这次由数据反推而不是手写死）；
 *  3. API 行为：fetchHealth 打对端点、measureRandomLatency 返回四舍五入的
 *     毫秒数并把失败照抛（状态页据此归类「测速失败」）。
 */

const headerSource = readFileSync(
  resolve(process.cwd(), "src/components/layout/Header.tsx"),
  "utf8",
);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("StatusPage 渲染", () => {
  it("loading 首帧：页头、骨架与测速卡就位，不崩", () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.stubGlobal("fetch", async () => new Response("{}"));
    const html = renderToStaticMarkup(
      createElement(QueryClientProvider, { client }, createElement(StatusPage)),
    );
    expect(html).toContain("运行状况");
    expect(html).toContain("服务状态");
    // 未落地时不得凭空宣称「服务正常」——那是假信号
    expect(html).not.toContain("服务正常");
    expect(html).toContain("skeleton-shimmer");
    // 测速卡初始态文案
    expect(html).toContain("尚未测速");
  });
});

describe("/status 路由与导航一致性", () => {
  it("/status 在 ROUTES 与顶栏页签里，且不在 sitemap 之外静默丢元信息", () => {
    expect(ROUTES).toContain("/status");
    expect(HEADER_TABS.map((tab) => tab.path)).toContain("/status");
  });

  it("移动端导航列数恒等于页签数 —— 折行会撑破 --header-h 契约", () => {
    const gridCols = headerSource.match(/grid grid-cols-(\d)[^"]*gap-1 pb-2 md:hidden/)?.[1];
    expect(gridCols, "未能定位移动端导航的列数类").toBeTruthy();
    expect(Number(gridCols)).toBe(HEADER_TABS.length);
  });

  it("compact 页签钉死 whitespace-nowrap（P52 加第 4 个页签的直接后果）", () => {
    // 4 列下 320px 屏每格 ~69px：「API 文档」不加 nowrap 会在 h-8 卡内折两行，
    // 被 border 裁切（--header-h 靠 h-8 挡住，但观感当场碎裂）。
    const compact = headerSource.match(/const tabClassCompact[\s\S]*?`([^`]*)`/)?.[1];
    expect(compact, "未能定位 tabClassCompact 的类名串").toBeTruthy();
    expect(compact).toContain("whitespace-nowrap");
  });

  it("状态页是公开页：进 sitemap；管理后台继续缺席", () => {
    const sitemap = readFileSync(resolve(process.cwd(), "public/sitemap.xml"), "utf8");
    expect(sitemap).toContain("https://t.paiii.cn/status");
    expect(sitemap).not.toContain("https://t.paiii.cn/admin");
  });
});

describe("status 相关 API 行为", () => {
  it("fetchHealth 请求 /api/health 并透传 JSON", async () => {
    const payload: HealthPayload = {
      ok: true,
      runtime: "edgeone-pages",
      buildId: "test-build",
      timestamp: "2026-01-01T00:00:00.000Z",
      kv: { imagesBound: true, statsBound: true },
    };
    const seen: string[] = [];
    // apiRequest 的破缓分支要读 window.location.origin（与 api-client-preview 同款桩）
    vi.stubGlobal("window", {
      location: { origin: "https://t.example.test", pathname: "/status", search: "", hash: "" },
    });
    vi.stubGlobal(
      "fetch",
      async (input: RequestInfo | URL) => {
        const url = String(input);
        seen.push(url);
        return new Response(JSON.stringify(payload), {
          headers: { "content-type": "application/json" },
        });
      },
    );

    await expect(fetchHealth()).resolves.toMatchObject({ ok: true, buildId: "test-build" });
    // 破缓 GET：路径必须是 /api/health，_t 参数允许出现
    expect(seen[0]).toMatch(/^\/api\/health\?_t=\d+$/);
  });

  it("measureRandomLatency 返回非负整数毫秒", async () => {
    vi.stubGlobal("fetch", async () => new Response(null, { status: 302 }));
    const ms = await measureRandomLatency();
    expect(Number.isInteger(ms)).toBe(true);
    expect(ms).toBeGreaterThanOrEqual(0);
  });

  it("测速失败必须照抛 —— 状态页靠异常归类为「测速失败」而非 0ms", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("offline");
    });
    await expect(measureRandomLatency()).rejects.toThrow(/offline/);
  });
});
