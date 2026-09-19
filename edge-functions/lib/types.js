// Shared type definitions and constants for the edge-functions backend.
// ── Constants ────────────────────────────────────────────────
export const MAX_BATCH_SIZE = 500;
export const DEFAULT_LIST_PAGE_SIZE = 24;
export const MAX_LIST_PAGE_SIZE = 60;
export const MAX_TITLE_LENGTH = 120;
export const MAX_TAG_LENGTH = 40;
export const MAX_TAGS_PER_IMAGE = 20;
export const MAX_LIST_FILTER_LENGTH = 100;
/** 公开读接口（stats / 分页 list）的短边缘缓存：配合前端 bustCache 关闭。 */
export const READ_CACHE_CONTROL = 'public, s-maxage=10, stale-while-revalidate=30';
export const MAX_TRACKED_SITES = 500;
export const MAX_JSON_BODY_BYTES = 256 * 1024;
export const IMAGE_ID_PATTERN = /^[A-Za-z0-9_-]{1,160}$/;
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
