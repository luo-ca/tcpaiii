// ============================================================
// Chunk load error resilience
// ============================================================

/**
 * 部署后旧页面持有的 hashed chunk 会 404：用户点任何未访问过的 lazy 路由，
 * dynamic import 直接 reject。各浏览器的报错形态不一样，全部按字符串归类：
 * 命中即认定为「资源过期」而不是「代码有 bug」—— 前者刷新就能自愈。
 */
const CHUNK_ERROR_PATTERNS = [
  /ChunkLoadError/i, // webpack 风格 name
  /Loading CSS chunk/i, // link preload 注入的样式 chunk
  /Failed to fetch dynamically imported module/i, // Chrome
  /error loading dynamically imported module/i, // Vite 5 的 Error 前缀
  /Importing a module script failed/i, // Safari / WebKit
];

export function isChunkLoadError(error: unknown): boolean {
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : String(error ?? '');
  const haystack = `${name} ${message}`;
  return CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(haystack));
}

/**
 * 自动刷新的冷却闸门：一次「会话」里只允许在 COOLDOWN 窗口内自动刷新一次。
 *
 * 用时间戳而不是布尔标志，是因为布尔标志一旦被「应用成功启动」清掉，
 * 直开一个坏路由（/admin 的 chunk 404）就会 reload → 清标志 → 再 reload
 * 无限循环。时间戳不依赖任何成功信号来清，刷新后若仍失败，窗口内直接改走
 * 手动重试 UI —— 循环被默认堵死。
 *
 * 沙箱/private mode 下 sessionStorage 可能抛：抛错一律退回「不自动刷新」，
 * 让调用方走手动 UI，绝不制造刷新循环。
 */
export const CHUNK_RELOAD_KEY = 'chunk-reload-at-ts';
export const CHUNK_RELOAD_COOLDOWN_MS = 15_000;

export function claimChunkReload(now = Date.now()): boolean {
  try {
    const raw = window.sessionStorage.getItem(CHUNK_RELOAD_KEY);
    const last = raw === null ? Number.NaN : Number(raw);
    // 首次（raw 为 null）或时间戳损坏（NaN）都视为「可刷新」；
    // NaN 的比较恒为 false，需与「距上次已超窗口」合并成同一放行分支
    if (raw === null || !Number.isFinite(last) || now - last >= CHUNK_RELOAD_COOLDOWN_MS) {
      window.sessionStorage.setItem(CHUNK_RELOAD_KEY, String(now));
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
