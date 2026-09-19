import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 后台懒加载状态机：IntersectionObserver 只能把「还没开始」的卡片推进一次，
 * 绝不能把已终结的卡片（loaded / error）复活回 loading。
 *
 * 背景（与 P28「activeSrc 被 state 卡住」同源、方向相反）：
 * 卡片的 eager = index < 6 取的是**数组位置**，而列表 key={img.id} 让组件按图复用。
 * 于是搜索命中几张靠后的图并加载完、再**清空搜索框**恢复全量时，一张已 loaded
 * 的卡片会从 index<6 挪到 index≥6 —— eager 由 true→false 让依赖 [eager] 的
 * useEffect 重新挂上 IntersectionObserver：
 *   · observe() 规范保证会异步回报一次当前交叉状态；
 *   · 该卡此刻仍（含 rootMargin 400px）在视口内 → entries[0].isIntersecting=true；
 *   · 旧代码无条件 setState('loading')，把 'loaded' 强行拖回 'loading'。
 * 而 src 没变，<img> 不会重新加载、onLoad 永不复燃 → 卡片永久停在
 * opacity-0 + 骨架屏闪烁（'error' 卡则错误提示被抹成骨架屏）。
 *
 * 契约：observer 回调里的状态推进必须是「仅当 current === 'idle' 才进 loading」的
 * 守卫式更新，不得出现把任意非 idle 态拉回 loading 的无条件 setState('loading')。
 */

const SOURCE = [
  "src/features/admin-page.tsx",
  "src/features/admin/image-card.tsx",
  "src/features/admin/use-lazy-image.ts",
]
  .map((rel) => readFileSync(resolve(process.cwd(), rel), "utf8"))
  .join("\n");

describe("后台懒加载：observer 不得复活已终结的卡片状态", () => {
  it("observer 回调里没有把 state 无条件打回 loading 的写法", () => {
    // 全局唯一的 setState('loading') 只应出现在 IntersectionObserver 回调里；
    // 一旦它不再是裸调用（改成守卫式），这个精确子串就该彻底消失。
    expect(SOURCE).not.toContain("setState('loading')");
  });

  it("状态推进是守卫式：仅从 idle 进入 loading，其余态原样保留", () => {
    expect(SOURCE).toMatch(/current === 'idle' \? 'loading' : current/);
  });

  it("触发前提仍然成立：eager 由位置决定 + 卡片按 img.id 复用 + observer 随 [eager] 重挂", () => {
    // 若哪天改成按 index 做 key，或 eager 不再随位置翻转，本 bug 自然消失，
    // 届时这三条前提连同上面的契约应一并重估。
    expect(SOURCE).toMatch(/const eager = index < \d+;/);
    expect(SOURCE).toMatch(/key=\{img\.id\}/);
    expect(SOURCE).toMatch(/}, \[eager\]\);/);
  });
});
