// KV connection, caching, and data-access wrappers.
// EdgeOne Pages KV is exposed through project-bound variables such as
// images_kv and stats_kv. The EdgeKV constructor remains as a
// local-test / legacy fallback.
import { ADMIN_CONFIG_KEY, IMAGES_META_KEY, KV_BINDING_NAMES, KV_CACHE_TTL_MS, } from './types';
import { isJsonObject, isSha256Hex, normalizeImageUrl, normalizeTags, normalizeTitle, sortTags } from './validation';
// ── Module state ─────────────────────────────────────────────
let _legacyKvImages = null;
let _legacyKvStats = null;
let _cachedImagesState = null;
export function resetImagesCache() {
    _cachedImagesState = null;
}
// ── KV connection ────────────────────────────────────────────
export function getKvImages(runtimeEnv) {
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
export function getKvStats(runtimeEnv) {
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
function getDirectKvBinding(readBinding) {
    try {
        const binding = readBinding();
        return isKvNamespace(binding) ? binding : undefined;
    }
    catch {
        return undefined;
    }
}
function getRuntimeKv(runtimeEnv, bindingNames, _namespace, fallback) {
    for (const name of bindingNames) {
        const envBinding = getEnvBinding(runtimeEnv, name);
        if (isKvNamespace(envBinding))
            return envBinding;
        const globalBinding = globalThis[name];
        if (isKvNamespace(globalBinding))
            return globalBinding;
    }
    return fallback();
}
function createLegacyKv(namespace) {
    const EdgeKV = globalThis.EdgeKV;
    if (!EdgeKV) {
        throw new Error(`EdgeOne KV binding is missing. Bind namespace "${namespace}" as "${namespace}_kv".`);
    }
    return new EdgeKV({ namespace });
}
function isKvNamespace(value) {
    return isJsonObject(value)
        && typeof value.get === 'function'
        && typeof value.put === 'function';
}
function hasRuntimeKvBinding(runtimeEnv, bindingNames) {
    const runtime = globalThis;
    return bindingNames.some(name => isKvNamespace(getEnvBinding(runtimeEnv, name)) || isKvNamespace(runtime[name]));
}
export function getKvHealth(runtimeEnv) {
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
export function parseStoredJson(value, fallback) {
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
function sanitizeStoredImage(value) {
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
function sanitizeStoredImages(value) {
    if (!Array.isArray(value))
        return [];
    return value.map(sanitizeStoredImage).filter((item) => Boolean(item));
}
export function buildImageIndex(images) {
    const byTag = new Map();
    const tagSet = new Set();
    const urlSet = new Set();
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
function buildImagesMeta(images) {
    return {
        totalImages: images.length,
        tags: buildImageIndex(images).sortedTags,
        updatedAt: new Date().toISOString(),
    };
}
function sanitizeImagesMeta(value) {
    if (!isJsonObject(value) || !Array.isArray(value.tags))
        return null;
    const tags = value.tags.filter((tag) => typeof tag === 'string' && tag.trim().length > 0);
    if (typeof value.totalImages !== 'number' || !Number.isFinite(value.totalImages))
        return null;
    return {
        totalImages: Math.max(0, Math.floor(value.totalImages)),
        tags: sortTags([...new Set(tags)]),
        updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date(0).toISOString(),
    };
}
// ── Runtime env helpers ──────────────────────────────────────
export function getRuntimeSecret(name, runtimeEnv) {
    const runtime = globalThis;
    return getEnvString(runtimeEnv, name)
        || runtime[name]
        || runtime.__ENV?.[name]
        || runtime.process?.env?.[name];
}
function getEnvString(runtimeEnv, name) {
    const value = getEnvBinding(runtimeEnv, name);
    return typeof value === 'string' ? value : undefined;
}
function getEnvBinding(runtimeEnv, name) {
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
function getCachedImagesState(images) {
    return {
        expiresAt: Date.now() + KV_CACHE_TTL_MS,
        images,
        index: buildImageIndex(images),
    };
}
// ── Image data access ────────────────────────────────────────
export async function getImagesMeta(runtimeEnv) {
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
export async function getImagesState(runtimeEnv) {
    if (_cachedImagesState && _cachedImagesState.expiresAt > Date.now()) {
        return _cachedImagesState;
    }
    const data = await getKvImages(runtimeEnv).get('all');
    const images = data ? sanitizeStoredImages(parseStoredJson(data, [])) : [];
    _cachedImagesState = getCachedImagesState(images);
    return _cachedImagesState;
}
export async function getAllImages(runtimeEnv) {
    return (await getImagesState(runtimeEnv)).images;
}
export async function saveAllImages(images, runtimeEnv) {
    const kv = getKvImages(runtimeEnv);
    const imagesMeta = buildImagesMeta(images);
    await Promise.all([
        kv.put('all', JSON.stringify(images)),
        kv.put(IMAGES_META_KEY, JSON.stringify(imagesMeta)),
    ]);
    _cachedImagesState = getCachedImagesState(images);
}
// ── Admin config (stored in stats KV) ────────────────────────
export async function getAdminConfig(runtimeEnv) {
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
