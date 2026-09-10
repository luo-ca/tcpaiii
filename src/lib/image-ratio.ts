/**
 * 图片原始宽高比缓存。
 *
 * 图库接口返回的 `ImageRecord` 只有 `{ id, url, title, tags, createdAt }` —— **没有宽高**。
 * 所以瀑布流在图片加载完成前无法预留正确高度：图片逐张到达时，整列会往下跳（CLS）。
 *
 * 这里在 `onLoad` 时记下 `naturalWidth / naturalHeight`（内存 + localStorage），
 * 下次渲染同一张图时就能一开始用 `aspect-ratio` 占好位。
 * 重复访问布局偏移 ≈ 0；首次访问仍有轻微偏移 —— 这是"服务端不返回尺寸"的固有代价，
 * 真要从根上解决得让 `/api/list` 带上宽高字段（需要改 KV 结构与导入流程）。
 */

const STORAGE_KEY = 'paiii:image-ratios';
const MAX_ENTRIES = 500;
const MIN_RATIO = 0.05;
const MAX_RATIO = 20;

const isBrowser = typeof window !== 'undefined';
/** url -> width / height */
const ratios = new Map<string, number>();

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function isSaneRatio(ratio: number) {
  return Number.isFinite(ratio) && ratio >= MIN_RATIO && ratio <= MAX_RATIO;
}

function hydrate() {
  if (!isBrowser) return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return;
    for (const [url, ratio] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof ratio === 'number' && isSaneRatio(ratio)) ratios.set(url, ratio);
    }
  } catch {
    // localStorage 被禁用 / 内容损坏：不影响功能，只是拿不到占位比例
  }
}

function schedulePersist() {
  if (!isBrowser || persistTimer !== null) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      // 只保留最近 MAX_ENTRIES 条，避免无限增长
      const entries = Array.from(ratios.entries());
      const trimmed = entries.length > MAX_ENTRIES ? entries.slice(entries.length - MAX_ENTRIES) : entries;
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(trimmed)));
    } catch {
      // 隐私模式 / 配额满：静默放弃持久化
    }
  }, 1000);
}

// 模块加载时就补齐缓存，让 getImageRatio 在渲染期保持纯查询
hydrate();

/** 已缓存的宽高比；没记录时返回 undefined，由调用方决定默认比例。 */
export function getImageRatio(url: string): number | undefined {
  return ratios.get(url);
}

/** 图片加载完成时调用，记录真实比例。已有记录则跳过（避免重复写盘）。 */
export function rememberImageRatio(url: string, naturalWidth: number, naturalHeight: number) {
  if (!naturalWidth || !naturalHeight) return;
  if (ratios.has(url)) return;
  const ratio = naturalWidth / naturalHeight;
  if (!isSaneRatio(ratio)) return;
  ratios.set(url, ratio);
  schedulePersist();
}
