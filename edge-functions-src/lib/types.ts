// Shared type definitions and constants for the edge-functions backend.

export type KvValue = string | ArrayBuffer | ArrayBufferView | ReadableStream;

export type KvNamespace = {
    get(key: string): Promise<unknown>;
    put(key: string, value: KvValue): Promise<unknown>;
    delete?: (key: string) => Promise<unknown>;
    list?: (...args: unknown[]) => Promise<unknown>;
};

export type EdgeKvConstructor = new (options: { namespace: string }) => KvNamespace;
export type RuntimeBinding = string | KvNamespace | undefined;
export type RuntimeBindingRecord = Record<string, RuntimeBinding> & {
    env?: RuntimeBindingRecord;
    bindings?: RuntimeBindingRecord;
};
export type RuntimeEnv = RuntimeBindingRecord | undefined;
export type RuntimeGlobals = typeof globalThis & {
    ADMIN_TOKEN?: string;
    ADMIN_TOKEN_SHA256?: string;
    EdgeKV?: EdgeKvConstructor;
    __ENV?: Record<string, string | undefined>;
    process?: {
        env?: Record<string, string | undefined>;
    };
};
export type EdgeOnePagesContext = {
    request: Request;
    env?: RuntimeEnv;
    waitUntil?: (promise: Promise<unknown>) => void;
};
export type ImageRecord = {
    id: string;
    url: string;
    title: string;
    tags: string[];
    createdAt: string;
};
export type StatsRecord = {
    totalRequests: number;
    lastRequestAt: string | null;
    dailyRequests: Record<string, number>;
    sites: Record<string, number>;
};
export type ImageIndex = {
    byTag: Map<string, ImageRecord[]>;
    sortedTags: string[];
    urlSet: Set<string>;
};
export type CachedImagesState = {
    expiresAt: number;
    images: ImageRecord[];
    index: ImageIndex;
};
export type CachedStatsState = {
    expiresAt: number;
    stats: StatsRecord;
};
export type ImagesMetaRecord = {
    totalImages: number;
    tags: string[];
    updatedAt: string;
};
export type ExecutionContextLike = {
    waitUntil?: (promise: Promise<unknown>) => void;
};

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
export const MAX_JSON_BODY_BYTES = 256 * 1024;
export const IMAGE_ID_PATTERN = /^[A-Za-z0-9_-]{1,160}$/;
/** 与 IMAGE_ID_PATTERN 的长度上限同源：任何拿 id 字符串做输入的地方先截到这里 */
export const MAX_IMAGE_ID_LENGTH = 160;
export const ALLOWED_IMAGE_PROTOCOLS = new Set(['http:', 'https:']);
export const STATS_TIME_ZONE = 'Asia/Shanghai';
export const ADMIN_CONFIG_KEY = 'admin_config';
export const IMAGES_META_KEY = 'meta';
export const API_BUILD_ID = 'edgeone-js-kv-safe-2026-04-29';
export const KV_CACHE_TTL_MS = 10_000;
export const KV_BINDING_NAMES = {
    images: ['images_kv', 'IMAGES_KV', 'images'],
    stats: ['stats_kv', 'STATS_KV', 'stats'],
};
