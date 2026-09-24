/**
 * 删除去重闸门。
 *
 * 抽成独立模块有两个原因：
 *  1. 逻辑可被真实行为测试直接驱动，而不是靠源码正则断言（那种断言改个
 *     变量名就失效，也测不出并发语义）；
 *  2. admin-page.tsx 只导出组件，避免 react-refresh/only-export-components
 *     警告（该规则要求组件文件不混出非组件导出）。
 *
 * 背景：Radix 的 AlertDialogAction 是**先关弹窗、再跑 onClick**，而 onClick 里
 * 还有一段 `await onRequireToken()`。从弹窗关闭到 mutationFn 真正启动之间，
 * isDeleting 仍是 false —— 用户能再确认一次，于是同一 id 的 DELETE 发两遍：
 *
 *   第一次成功 → 图已被删
 *   第二次 404「图片不存在（可能刚被删除）」→ 界面误报一条失败 toast
 *
 * 用户明明删成功了。窗口开在「弹窗已关、请求未发」之间，禁用触发器堵不住，
 * 所以闸门放在 mutation 层。
 */

/** 用 Set 而不是单个 id：单槽位会被后一张图覆盖，于是前一张图的重复点击 */
/** 又能穿透（刚认领 img-1、用户转去删 img-2，此时 img-1 的占位被顶掉）。 */
export type DeleteGate = { current: Set<string> };

/** 认领一次删除。已被同一 id 占着时返回 false（调用方应静默忽略）。 */
export function claimDelete(ref: DeleteGate, id: string): boolean {
  if (ref.current.has(id)) return false;
  ref.current.add(id);
  return true;
}

/** 释放闸门。只删自己那一项 —— 与其它在飞的 id 互不干扰。 */
export function releaseDelete(ref: DeleteGate, id: string): void {
  ref.current.delete(id);
}