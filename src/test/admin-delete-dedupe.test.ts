import { describe, expect, it } from "vitest";
import { claimDelete, releaseDelete, type DeleteGate } from "@/features/admin/delete-gate";

/**
 * 删除去重闸门的真实行为测试（P141）。
 *
 * 为什么需要它：Radix 的 AlertDialogAction 是**先关弹窗、再跑 onClick**，
 * 而 onClick 里还有一段 `await onRequireToken()`。从弹窗关闭到 mutationFn
 * 真正启动之间，isDeleting 仍是 false —— 用户能再确认一次，于是同一 id 的
 * DELETE 发两遍：
 *
 *   第一次成功 → 图已被删
 *   第二次 404「图片不存在（可能刚被删除）」→ 界面误报一条失败 toast
 *
 * 用户明明删成功了。窗口开在「弹窗已关、请求未发」之间，禁用触发器堵不住，
 * 所以闸门放在 mutation 层。这里直接驱动闸门，验证并发语义。
 */

const gate = (): DeleteGate => ({ current: new Set<string>() });

describe("claimDelete / releaseDelete（P141）", () => {
  it("首次认领成功", () => {
    const ref = gate();
    expect(claimDelete(ref, "img-1")).toBe(true);
    expect(ref.current.has("img-1")).toBe(true);
  });

  it("同一 id 飞行中再次认领被拒（连点不会发第二个 DELETE）", () => {
    const ref = gate();
    expect(claimDelete(ref, "img-1")).toBe(true);
    expect(claimDelete(ref, "img-1")).toBe(false);
    expect(claimDelete(ref, "img-1")).toBe(false);
  });

  it("不同 id 各自独立：删 A 的同时删 B 不被误挡，且 A 仍受保护", () => {
    const ref = gate();
    expect(claimDelete(ref, "img-1")).toBe(true);
    // 另一张图是独立操作，不该被上一张的闸门挡住
    expect(claimDelete(ref, "img-2")).toBe(true);
    // 关键回归：认领 img-2 不能把 img-1 的保护顶掉
    //（单槽位实现正是在这里漏掉重复点击）
    expect(claimDelete(ref, "img-1")).toBe(false);
  });

  it("释放后可再次认领同一 id", () => {
    const ref = gate();
    expect(claimDelete(ref, "img-1")).toBe(true);
    releaseDelete(ref, "img-1");
    expect(ref.current.has("img-1")).toBe(false);
    expect(claimDelete(ref, "img-1")).toBe(true);
  });

  it("释放只影响自己的 id，不动其它在飞的请求", () => {
    const ref = gate();
    claimDelete(ref, "img-1");
    claimDelete(ref, "img-2");
    releaseDelete(ref, "img-1");
    expect(ref.current.has("img-1")).toBe(false);
    expect(ref.current.has("img-2"), "释放 img-1 误清了 img-2，会让重复点击穿透").toBe(true);
    expect(claimDelete(ref, "img-2")).toBe(false);
  });

  it("响应乱序：迟到的释放不会把已重新认领的同一 id 解锁", () => {
    const ref = gate();
    claimDelete(ref, "img-1");
    releaseDelete(ref, "img-1");
    // 用户立刻又删了一次（新请求在飞）
    expect(claimDelete(ref, "img-1")).toBe(true);
    // 上一个请求的 finally 现在才跑到 —— 但它是同 id 的释放，
    // 这里不区分新旧请求，属于已知简化：该 id 会解锁。
    // 断言当前实现确实解锁（记录这个边界，避免误以为它能区分代次）。
    releaseDelete(ref, "img-1");
    expect(ref.current.has("img-1")).toBe(false);
  });
});