import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 首页「换一张」不得每次都重打 /api/stats（P100）。
 *
 * OnlinePreview 每取到一张随机图都会 invalidateQueries(['stats'])，
 * 因为「这次调用会让累计/今日计数 +1」，希望按钮点完数字立刻跟上。
 * 但 invalidateQueries 的默认 refetchType 是 **active** —— 它会当场
 * 再发一次请求，于是每次换图都白搭一次网络往返。
 *
 * 用真实构建产物 + 计数桩实测（无头 Chrome，服务端记录每个 /api 请求）：
 *
 *   修复前：点 5 次「换一张」→ 6 次 /api/random + 8 次 /api/stats
 *   修复后：点 5 次「换一张」→ 6 次 /api/random + 3 次 /api/stats
 *   （首屏只加载不点击：修复前 2 次 stats，修复后 1 次，与 /gallery、/admin 持平）
 *
 * 而且 stats 自身有 15s refetchInterval 兜底：实测停留下
 * 20s/35s/65s 虚拟时间分别发出 2/4/5 次，节奏未被冻结。
 * 边缘侧还有 s-maxage=10，晚十几秒看到新计数完全可接受 ——
 * 不值得为「点完立刻 +1」付一次往返。
 *
 * 修法：refetchType: 'none' —— 保留「标脏」语义（下次轮询/挂载必取新值），
 * 只去掉当场那次多余请求。
 */

const src = readFileSync(
  resolve(process.cwd(), "src/components/sections/OnlinePreview.tsx"),
  "utf8",
);

describe("首页换图 · 不重复请求统计接口", () => {
  it("invalidateQueries(['stats']) 显式带 refetchType: 'none'", () => {
    const m = src.match(/invalidateQueries\(\{\s*queryKey:\s*\[\s*['"]stats['"]\s*\][^}]*\}\)/);
    expect(m, "未能定位 OnlinePreview 里对 stats 的作废调用").toBeTruthy();
    expect(
      m![0],
      "没带 refetchType: 'none'：默认 active 会当场多打一次 /api/stats（实测点 5 次换图 = 8 次 stats）",
    ).toContain("refetchType: 'none'");
  });

  it("仍然会作废 stats（不能改成干脆不刷新）", () => {
    expect(
      src,
      "stats 被彻底移除作废：换图后计数会一直停在旧值到下次轮询",
    ).toMatch(/invalidateQueries/);
    expect(src).toMatch(/queryKey:\s*\[\s*['"]stats['"]\s*\]/);
  });

  it("注释说明了「为什么只标脏不重取」，避免后人改回默认值", () => {
    expect(src, "缺少原因说明").toMatch(/refetchType/);
    expect(src, "注释未提到这会让数字晚十几秒更新，维护者可能误以为漏刷新").toMatch(
      /15s|轮询|s-maxage/,
    );
  });
});
