// KV connection, caching, and data-access wrappers.
// EdgeOne Pages KV is exposed through project-bound variables such as
// images_kv and stats_kv. The EdgeKV constructor remains as a
// local-test / legacy fallback.

import type {
    CachedImagesState,
    ImageIndex,
    ImageRecord,
    ImagesMetaRecord,
    KvNamespace,
    RuntimeBinding,
    RuntimeEnv,
    RuntimeGlobals,
} from './types';

import {
    ADMIN_CONFIG_KEY,
    IMAGES_META_KEY,
    KV_BINDING_NAMES,
    KV_CACHE_TTL_MS,
} from './types';

import { isJsonObject, isSha256Hex, normalizeImageUrl, normalizeTags, normalizeTitle, sortTags } from './validation';

// ── Ambient KV binding declarations (resolved at runtime) ────

declare const images_kv: KvNamespace | undefined;
declare const IMAGES_KV: KvNamespace | undefined;
declare const images: KvNamespace | undefined;
declare const stats_kv: KvNamespace | undefined;
declare const STATS_KV: KvNamespace | undefined;
declare const stats: KvNamespace | undefined;

// ── Module state ─────────────────────────────────────────────

let _legacyKvImages: KvNamespace | null = null;
let _legacyKvStats: KvNamespace | null = null;
let _cachedImagesState: CachedImagesState | null = null;
let _saveQueue: Promise<unknown> = Promise.resolve();

export function resetImagesCache() {
    _cachedImagesState = null;
}

// ── KV connection ────────────────────────────────────────────

export function getKvImages(runtimeEnv?: RuntimeEnv) {
    const directBinding = getDirectKvBinding(() => images_kv)
        || getDirectKvBinding(() => IMAGES_KV)
        || getDirectKvBinding(() => images);
    if (directBinding)
        return directBinding;
    return getRuntimeKv(runtimeEnv, KV_BINDING_NAMES.images, 'images', () => {
        if (!_legacyKvImages) {
            _legacyKvImages = createLegacyKv('images');
        }
        return _legacyKvImages;
    });
}

export function getKvStats(runtimeEnv?: RuntimeEnv) {
    const directBinding = getDirectKvBinding(() => stats_kv)
        || getDirectKvBinding(() => STATS_KV)
        || getDirectKvBinding(() => stats);
    if (directBinding)
        return directBinding;
    return getRuntimeKv(runtimeEnv, KV_BINDING_NAMES.stats, 'stats', () => {
        if (!_legacyKvStats) {
            _legacyKvStats = createLegacyKv('stats');
        }
        return _legacyKvStats;
    });
}

function getDirectKvBinding(readBinding: () => unknown) {
    try {
        const binding = readBinding();
        return isKvNamespace(binding) ? binding : undefined;
    }
    catch {
        return undefined;
    }
}

function getRuntimeKv(runtimeEnv: RuntimeEnv, bindingNames: string[], _namespace: string, fallback: () => KvNamespace) {
    for (const name of bindingNames) {
        const envBinding = getEnvBinding(runtimeEnv, name);
        if (isKvNamespace(envBinding))
            return envBinding;
        const globalBinding = (globalThis as Record<string, unknown>)[name];
        if (isKvNamespace(globalBinding))
            return globalBinding;
    }
    return fallback();
}

function createLegacyKv(namespace: string) {
    const EdgeKV = (globalThis as RuntimeGlobals).EdgeKV;
    if (!EdgeKV) {
        throw new Error(`EdgeOne KV binding is missing. Bind namespace "${namespace}" as "${namespace}_kv".`);
    }
    return new EdgeKV({ namespace });
}

function isKvNamespace(value: unknown): value is KvNamespace {
    return isJsonObject(value)
        && typeof value.get === 'function'
        && typeof value.put === 'function';
}

function hasRuntimeKvBinding(runtimeEnv: RuntimeEnv, bindingNames: string[]) {
    const runtime = globalThis as RuntimeGlobals & Record<string, unknown>;
    return bindingNames.some(name => isKvNamespace(getEnvBinding(runtimeEnv, name)) || isKvNamespace(runtime[name]));
}

export function getKvHealth(runtimeEnv?: RuntimeEnv) {
    return {
        imagesBound: Boolean(getDirectKvBinding(() => images_kv)
            || getDirectKvBinding(() => IMAGES_KV)
            || getDirectKvBinding(() => images)
            || hasRuntimeKvBinding(runtimeEnv, KV_BINDING_NAMES.images)),
        statsBound: Boolean(getDirectKvBinding(() => stats_kv)
            || getDirectKvBinding(() => STATS_KV)
            || getDirectKvBinding(() => stats)
            || hasRuntimeKvBinding(runtimeEnv, KV_BINDING_NAMES.stats)),
    };
}

// ── Generic parse helper ─────────────────────────────────────

export function parseStoredJson(value: unknown, fallback: unknown): unknown {
    if (typeof value !== 'string') {
        return value === undefined ? fallback : value;
    }
    try {
        return JSON.parse(value);
    }
    catch {
        return fallback;
    }
}

// ── Image data sanitisation & indexing ───────────────────────

function sanitizeStoredImage(value: unknown): ImageRecord | null {
    if (!isJsonObject(value))
        return null;
    const imageUrl = normalizeImageUrl(value.url);
    if (!imageUrl)
        return null;
    const tags = normalizeTags(value.tags);
    if (!tags)
        return null;
    const createdAt = typeof value.createdAt === 'string' && value.createdAt.trim()
        ? value.createdAt.trim()
        : new Date(0).toISOString();
    return {
        id: typeof value.id === 'string' && value.id.trim()
            ? value.id.trim()
            : `img-${createdAt}-${imageUrl}`,
        url: imageUrl,
        title: normalizeTitle(value.title),
        tags,
        createdAt,
    };
}

function sanitizeStoredImages(value: unknown): ImageRecord[] {
    if (!Array.isArray(value))
        return [];
    return value.map(sanitizeStoredImage).filter((item): item is ImageRecord => Boolean(item));
}

export function buildImageIndex(images: ImageRecord[]): ImageIndex {
    const byTag = new Map<string, ImageRecord[]>();
    const tagSet = new Set<string>();
    const urlSet = new Set<string>();
    for (const image of images) {
        urlSet.add(image.url);
        for (const tag of image.tags) {
            tagSet.add(tag);
            const normalizedTag = tag.toLowerCase();
            const group = byTag.get(normalizedTag);
            if (group) {
                group.push(image);
            }
            else {
                byTag.set(normalizedTag, [image]);
            }
        }
    }
    return {
        byTag,
        sortedTags: sortTags(Array.from(tagSet)),
        urlSet,
    };
}

function buildImagesMeta(images: ImageRecord[]): ImagesMetaRecord {
    return {
        totalImages: images.length,
        tags: buildImageIndex(images).sortedTags,
        updatedAt: new Date().toISOString(),
    };
}

function sanitizeImagesMeta(value: unknown): ImagesMetaRecord | null {
    if (!isJsonObject(value) || !Array.isArray(value.tags))
        return null;
    const tags = value.tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0);
    if (typeof value.totalImages !== 'number' || !Number.isFinite(value.totalImages))
        return null;
    return {
        totalImages: Math.max(0, Math.floor(value.totalImages)),
        tags: sortTags([...new Set(tags)]),
        updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date(0).toISOString(),
    };
}

// ── Runtime env helpers ──────────────────────────────────────

export function getRuntimeSecret(name: string, runtimeEnv?: RuntimeEnv) {
    const runtime = globalThis as RuntimeGlobals & Record<string, string | undefined>;
    return getEnvString(runtimeEnv, name)
        || runtime[name]
        || runtime.__ENV?.[name]
        || runtime.process?.env?.[name];
}

function getEnvString(runtimeEnv: RuntimeEnv, name: string) {
    const value = getEnvBinding(runtimeEnv, name);
    return typeof value === 'string' ? value : undefined;
}

function getEnvBinding(runtimeEnv: RuntimeEnv, name: string): RuntimeBinding {
    if (!runtimeEnv || typeof runtimeEnv !== 'object')
        return undefined;
    const directValue = runtimeEnv[name];
    if (directValue)
        return directValue;
    const envValue = 'env' in runtimeEnv ? runtimeEnv.env?.[name] : undefined;
    if (envValue)
        return envValue;
    return 'bindings' in runtimeEnv ? runtimeEnv.bindings?.[name] : undefined;
}

// ── Image cache helpers ──────────────────────────────────────

function getCachedImagesState(images: ImageRecord[]): CachedImagesState {
    return {
        expiresAt: Date.now() + KV_CACHE_TTL_MS,
        images,
        index: buildImageIndex(images),
    };
}

// ── Image data access ────────────────────────────────────────

export async function getImagesMeta(runtimeEnv?: RuntimeEnv): Promise<ImagesMetaRecord> {
    if (_cachedImagesState && _cachedImagesState.expiresAt > Date.now()) {
        return {
            totalImages: _cachedImagesState.images.length,
            tags: _cachedImagesState.index.sortedTags,
            updatedAt: new Date().toISOString(),
        };
    }
    const data = await getKvImages(runtimeEnv).get(IMAGES_META_KEY);
    const meta = sanitizeImagesMeta(parseStoredJson(data, null));
    if (meta) {
        return meta;
    }
    const imagesState = await getImagesState(runtimeEnv);
    return {
        totalImages: imagesState.images.length,
        tags: imagesState.index.sortedTags,
        updatedAt: new Date().toISOString(),
    };
}

export async function getImagesState(runtimeEnv?: RuntimeEnv): Promise<CachedImagesState> {
    if (_cachedImagesState && _cachedImagesState.expiresAt > Date.now()) {
        return _cachedImagesState;
    }
    const data = await getKvImages(runtimeEnv).get('all');
    const images = data ? sanitizeStoredImages(parseStoredJson(data, [])) : [];
    _cachedImagesState = getCachedImagesState(images);
    return _cachedImagesState;
}

export async function getAllImages(runtimeEnv?: RuntimeEnv): Promise<ImageRecord[]> {
    return (await getImagesState(runtimeEnv)).images;
}

export async function saveAllImages(images: ImageRecord[], runtimeEnv?: RuntimeEnv) {
    // 写必须排队：'all' 与 'meta' 是两次 put，并发请求的写一旦交错，
    // 图库数据和 stats 元信息就会永久错位（各自的失败也互不影响）。
    // 链尾吞掉异常，避免一次失败卡死后续所有写；异常照常回传给本次调用方。
    //
    // 两次 put 之间没有事务：若 'all' 成功、'meta' 失败（配额耗尽 / 网络瞬断 /
    // 节点被回收 —— 概率低但真实存在），必须**删掉旧的 meta**。
    // 否则旧 meta 形状合法、会被 sanitizeImagesMeta 接受，导致 /api/stats
    // 长期返回过期的 totalImages 与 tags，而 'all' 其实早已更新。
    //
    // 为什么删而不是回滚 'all'：meta 是**可从 all 重建的派生数据** ——
    // getImagesMeta 在 meta 缺失时会回退到 getImagesState 现场重建。
    // 删掉过期 meta 让下次读取自动自愈，既不用先 get 原值（省一次往返），
    // 也让语义更清晰：all 是唯一权威，meta 只是它的缓存。
    const snapshot = images.slice();
    const task = _saveQueue.then(async () => {
        const kv = getKvImages(runtimeEnv);
        await kv.put('all', JSON.stringify(snapshot));
        try {
            await kv.put(IMAGES_META_KEY, JSON.stringify(buildImagesMeta(snapshot)));
        }
        catch (error) {
            // meta 写失败：清掉可能残留的过期 meta，交下一次读取重建。
            // delete 自身失败不能再掩盖原始错误 —— 一律吞掉它并抛原错。
            try {
                await kv.delete?.(IMAGES_META_KEY);
            }
            catch {
                // ignore
            }
            throw error;
        }
        _cachedImagesState = getCachedImagesState(snapshot);
    });
    _saveQueue = task.catch(() => undefined);
    return task;
}

// ── Admin config (stored in stats KV) ────────────────────────

export async function getAdminConfig(runtimeEnv?: RuntimeEnv) {
    const data = await getKvStats(runtimeEnv).get(ADMIN_CONFIG_KEY);
    if (!data)
        return { tokenSha256: null, updatedAt: null };
    const parsed = parseStoredJson(data, {});
    const parsedConfig = isJsonObject(parsed) ? parsed : {};
    const tokenSha256 = typeof parsedConfig.tokenSha256 === 'string' && isSha256Hex(parsedConfig.tokenSha256)
        ? parsedConfig.tokenSha256.toLowerCase()
        : null;
    return {
        tokenSha256,
        updatedAt: typeof parsedConfig.updatedAt === 'string' ? parsedConfig.updatedAt : null,
    };
}
