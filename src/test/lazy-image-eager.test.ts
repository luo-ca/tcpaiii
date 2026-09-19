import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 后台图片卡片的懒加载：eager 卡片必须能独立于 IntersectionObserver 拿到图源。
 *
 * 背景：卡片列表的 key 是 `img.id`（组件按图复用），而 `eager = index < 6`
 * 取的是**数组位置**。于是筛选（搜索 / 标签）或删除之后，一张原本在次屏外、
 * state 仍是 'idle' 的卡片会被复用到 index < 6 的位置上，忽然变成 eager：
 *   · useEffect 依赖 [eager] 重跑，但 eager 分支直接 return，不再挂 observer；
 *   · 上一个 observer 已被上一轮 cleanup 断开（rootMargin 也无从补救）；
 *   · 于是 state 永远停在 'idle'。
 * 若取源只看 state（`state !== 'idle' ? src : undefined`），这张图就永远停在
 * 骨架屏上 —— 用户表现为「搜索出几张图，其中一两张一直在转圈」。
 *
 * 契约：activeSrc 的推导必须把 eager 一并算进去。
 */

const SOURCE = readFileSync(
  resolve(process.cwd(), "src/features/admin-page.tsx"),
  "utf8",
);

describe("后台懒加载：eager 卡片不得被 state 卡住", () => {
  it("全站只有一处 activeSrc 推导，且把 eager 算了进去", () => {
    const derivations = SOURCE.match(/const activeSrc\s*=[^;]*;/g) ?? [];
    expect(derivations).toHaveLength(1);
    expect(derivations[0]).toMatch(/\beager\b/);
  });

  it("eager 由位置决定，而卡片按 img.id 复用 —— 所以 eager 会中途翻转", () => {
    // 触发条件：位置会变 + 按 id 复用，缺一不可。
    // 若哪天改成「按 index 做 key」，这个 bug 自然消失，届时本测试也该一并改。
    expect(SOURCE).toMatch(/const eager = index < \d+;/);
    expect(SOURCE).toMatch(/key=\{img\.id\}/);
    expect(SOURCE).toMatch(/useLazyImage\(img\.url, eager\)/);
  });
});
