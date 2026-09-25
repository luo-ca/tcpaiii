// Shared type definitions and constants for the edge-functions backend.
// ── Constants ────────────────────────────────────────────────
export const MAX_BATCH_SIZE = 500;
export const DEFAULT_LIST_PAGE_SIZE = 24;
export const MAX_LIST_PAGE_SIZE = 60;
export const MAX_TITLE_LENGTH = 120;
export const MAX_TAG_LENGTH = 40;
export const MAX_TAGS_PER_IMAGE = 20;
export const MAX_LIST_FILTER_LENGTH = 100;
/**
 * 图片 URL 的硬上限。不封顶的话，单条 250KB（受请求体上限保护）的 URL
 * 也能永久写进 'all' blob——此后每一次 /api/list / /api/random / /api/stats
 * 都要搬运并重新解析这坨垃圾。2048 覆盖所有现实中的图片地址。
 */
export const MAX_IMAGE_URL_LENGTH = 2048;
/** 公开读接口（stats / 分页 list）的短边缘缓存：配合前端 bustCache 关闭。 */
export const READ_CACHE_CONTROL = 'public, s-maxage=10, stale-while-revalidate=30';
export const MAX_TRACKED_SITES = 500;
/**
 * dailyRequests 保留的天数。与 MAX_TRACKED_SITES 同理：它是**只增**的每日桶，
 * 却由 /api/random —— 全站热路径 —— 每个请求全量 JSON.stringify 重写一次。
 * 不封顶则 value 随运行天数线性长（10 年 ~68KB，纯历史垃圾）。
 * 取 90：公开响应只回最近 7 天（handleStats 的 getRecentStatsDateKeys），
 * 90 天留足排障/回看的余量，同时把存储钉在 ~2KB。
 */
export const MAX_TRACKED_DAILY_KEYS = 90;
export const MAX_JSON_BODY_BYTES = 256 * 1024;
export const IMAGE_ID_PATTERN = /^[A-Za-z0-9_-]{1,160}$/;
/** 与 IMAGE_ID_PATTERN 的长度上限同源：任何拿 id 字符串做输入的地方先截到这里 */
export const MAX_IMAGE_ID_LENGTH = 160;
export const ALLOWED_IMAGE_PROTOCOLS = new Set(['http:', 'https:']);
export const STATS_TIME_ZONE = 'Asia/Shanghai';
export const ADMIN_CONFIG_KEY = 'admin_config';
export const IMAGES_META_KEY = 'meta';
export const API_BUILD_ID = 'edgeone-js-kv-safe-2026-04-29';
export const KV_CACHE_TTL_MS = 10000;
export const KV_BINDING_NAMES = {
    images: ['images_kv', 'IMAGES_KV', 'images'],
    stats: ['stats_kv', 'STATS_KV', 'stats'],
};
