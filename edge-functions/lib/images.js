// Image CRUD route handlers.
import { MAX_BATCH_SIZE } from './types';
import { corsHeaders, json, noStoreHeaders } from './response';
import { isJsonObject, isValidImageId, normalizeImageUrl, normalizePositiveInt, normalizeTags, normalizeTitle, readJsonObject, } from './validation';
import { DEFAULT_LIST_PAGE_SIZE, MAX_LIST_PAGE_SIZE, MAX_LIST_FILTER_LENGTH, MAX_TAG_LENGTH, MAX_IMAGE_ID_LENGTH, READ_CACHE_CONTROL, } from './types';
import { getAllImages, getImagesState, saveAllImages } from './kv';
import { updateRequestStats } from './stats';
// ── Helpers ──────────────────────────────────────────────────
function generateImageId() {
    if (typeof crypto.randomUUID === 'function') {
        return `img-${crypto.randomUUID()}`;
    }
    return `img-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
// ── Gallery RMW serialization ────────────────────────────────
// 所有写路由的「读全量 → 本地改动 → 写回」必须整段排队执行（与 stats.ts 的
// updateRequestStats 同族修法）：P38 只把 saveAllImages 内部的两次 put 排了队，
// 但读与写之间仍让出控制权，并发 create/update/delete/batch 各自读到同一份旧
// 快照、各自改完互相覆盖 —— 图库条目被静默吞掉，比计数少计更致命。
// 链尾吞掉异常：一次写失败不能卡死后续所有写；异常照常回传给本次调用方
// （由各 handler 冒泡到 dispatcher 的统一 500）。
let _galleryQueue = Promise.resolve();
function withGalleryTransaction(task) {
    const queued = _galleryQueue.then(task);
    _galleryQueue = queued.catch(() => undefined);
    return queued;
}
// ── GET /api/random ──────────────────────────────────────────
export async function handleRandomImage(request, runtimeEnv, executionContext) {
    const url = new URL(request.url);
    // tag 是用户输入：查索引前先截到入库上限（与 list 同规则），
    // 免得超长串变成 byTag.get 前无界的 toLowerCase 分配
    const rawTag = url.searchParams.get('tag') || url.searchParams.get('type');
    const tag = rawTag ? rawTag.slice(0, MAX_TAG_LENGTH) : null;
    // exclude=<id>：跳过调用方刚拿到的一张（前端「换一张」不再连点撞同图）。
    // 同 id 上限截断；它是软偏好不是硬约束 —— 见下方兜底
    const excludeId = url.searchParams.get('exclude')?.slice(0, MAX_IMAGE_ID_LENGTH) || null;
    const format = url.searchParams.get('format');
    const wantsJson = url.searchParams.has('json')
        || format === 'json'
        || url.searchParams.get('redirect') === 'false';
    const imagesState = await getImagesState(runtimeEnv);
    if (imagesState.images.length === 0) {
        return json({ error: 'No images available' }, 404);
    }
    let candidates = imagesState.images;
    if (tag) {
        candidates = imagesState.index.byTag.get(tag.toLowerCase()) ?? [];
    }
    if (candidates.length === 0) {
        // tag 已在查索引前截到 MAX_TAG_LENGTH，回显直接透传即可
        return json({ error: `No images found with tag: ${tag ?? ''}` }, 404);
    }
    // 仅剩一张时不排除：宁可返回「上一张」，也不能让「换一张」按钮当场 404
    // excludeId 只是「别撞回上一张」的软偏好，不是硬约束。
    // 过滤后必须自己兜一次空池：id 理论上唯一（crypto.randomUUID），
    // 但存储被手工改过 / 数据损坏时可能出现重复 id，此时若排除项恰好覆盖
    // 全部候选，pool 会变成空数组 —— pool[NaN] 是 undefined，
    // 紧接着的 selected.id / selected.url 就会抛异常，把这个 tag 变成
    // 持续 500。宁可返回「上一张」，也不能让接口挂掉。
    // excludeId 只是「别撞回上一张」的软偏好，不是硬约束。
    // 过滤后必须自己兜一次空池：id 理论上唯一（crypto.randomUUID），
    // 但存储被手工改过 / 数据损坏时可能出现重复 id，此时若排除项恰好覆盖
    // 全部候选，pool 会变成空数组 —— pool[NaN] 是 undefined，
    // 紧接着的 selected.id / selected.url 就会抛异常，把这个 tag 变成
    // 持续 500。宁可返回「上一张」，也不能让接口挂掉。
    const filteredPool = excludeId && candidates.length > 1
        ? candidates.filter(image => image.id !== excludeId)
        : candidates;
    const pool = filteredPool.length > 0 ? filteredPool : candidates;
    const randomIndex = Math.floor(Math.random() * pool.length);
    const selected = pool[randomIndex];
    // Stats must never block or break the hot path: failures are swallowed,
    // waitUntil runtimes persist in the background, and runtimes without
    // waitUntil (tests/dev) get a bounded wait so a slow KV can't stall 302.
    const statsTask = updateRequestStats(request, runtimeEnv).catch(() => {
        // Ignore stats persistence failures on the hot path.
    });
    if (executionContext?.waitUntil) {
        executionContext.waitUntil(statsTask);
    }
    else {
        await Promise.race([
            statsTask,
            new Promise((resolve) => setTimeout(resolve, 500)),
        ]);
    }
    if (wantsJson) {
        return json({
            id: selected.id,
            url: selected.url,
            title: selected.title,
            tags: selected.tags,
            createdAt: selected.createdAt,
        });
    }
    return new Response(null, {
        status: 302,
        headers: {
            Location: selected.url,
            ...noStoreHeaders(),
            ...corsHeaders(),
        },
    });
}
// ── GET /api/list ────────────────────────────────────────────
export async function handleListImages(request, runtimeEnv) {
    const url = new URL(request.url);
    const images = await getAllImages(runtimeEnv);
    const pageParam = url.searchParams.get('page');
    const pageSizeParam = url.searchParams.get('pageSize');
    // search / tag 是用户输入：截断到合理长度再进全列表线性扫描，
    // 免得超长串把每次匹配的 toLowerCase+includes 变成正则级开销
    const search = (url.searchParams.get('search')?.trim().toLowerCase() ?? '').slice(0, MAX_LIST_FILTER_LENGTH);
    const tag = (url.searchParams.get('tag')?.trim() ?? '').slice(0, MAX_TAG_LENGTH);
    if (!pageParam && !pageSizeParam && !search && !tag) {
        // 遗留裸数组：只给导入去重预检用，保持 no-store（要的就是当下的全量）
        return json(images);
    }
    let filtered = images;
    if (tag) {
        filtered = filtered.filter(img => img.tags.some(item => item.toLowerCase() === tag.toLowerCase()));
    }
    if (search) {
        filtered = filtered.filter(img => img.title.toLowerCase().includes(search)
            || img.url.toLowerCase().includes(search)
            || img.tags.some(item => item.toLowerCase().includes(search)));
    }
    const pageSize = normalizePositiveInt(pageSizeParam, DEFAULT_LIST_PAGE_SIZE, MAX_LIST_PAGE_SIZE);
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(normalizePositiveInt(pageParam, 1), totalPages);
    const start = (page - 1) * pageSize;
    const items = filtered.slice(start, start + pageSize);
    return json({
        items,
        page,
        pageSize,
        total,
        totalPages,
        hasPrevPage: page > 1,
        hasNextPage: page < totalPages,
    }, 200, { cacheControl: READ_CACHE_CONTROL });
}
// ── POST /api/batch ──────────────────────────────────────────
export async function handleBatchCreateImages(request, runtimeEnv) {
    const body = await readJsonObject(request);
    if (!body) {
        return json({ error: 'Request body must be a valid JSON object' }, 400);
    }
    if (!Array.isArray(body.images) || body.images.length === 0) {
        return json({ error: 'images array is required and must not be empty' }, 400);
    }
    if (body.images.length > MAX_BATCH_SIZE) {
        return json({ error: `Maximum ${MAX_BATCH_SIZE} images per batch request` }, 400);
    }
    // 提升为 const：Array.isArray 对属性的收窄跨不进闭包，队列内得用已收窄的引用
    const batchItems = body.images;
    // 请求体校验留在队列外（body 只能读一次，且不涉及图库状态）
    return withGalleryTransaction(async () => {
        const imagesState = await getImagesState(runtimeEnv);
        const images = imagesState.images.slice();
        const existingUrls = new Set(imagesState.index.urlSet);
        const results = [];
        for (const item of batchItems) {
            if (!isJsonObject(item)) {
                results.push({ success: false, url: '', error: 'Invalid image payload' });
                continue;
            }
            const trimmedUrl = normalizeImageUrl(item.url);
            if (!trimmedUrl) {
                results.push({ success: false, url: typeof item.url === 'string' ? item.url.trim() : '', error: 'URL must be a valid http(s) URL' });
                continue;
            }
            if (existingUrls.has(trimmedUrl)) {
                results.push({ success: false, url: trimmedUrl, error: 'URL already exists' });
                continue;
            }
            const tags = normalizeTags(item.tags);
            if (!tags) {
                results.push({ success: false, url: trimmedUrl, error: 'Tags must be an array of strings' });
                continue;
            }
            const newImage = {
                id: generateImageId(),
                url: trimmedUrl,
                title: normalizeTitle(item.title),
                tags,
                createdAt: new Date().toISOString(),
            };
            images.push(newImage);
            existingUrls.add(trimmedUrl);
            results.push({ success: true, url: trimmedUrl, id: newImage.id });
        }
        await saveAllImages(images, runtimeEnv);
        const successCount = results.filter(r => r.success).length;
        return json({
            total: batchItems.length,
            success: successCount,
            failed: batchItems.length - successCount,
            results,
        }, 201);
    });
}
// ── POST /api/batch-update ───────────────────────────────────
export async function handleBatchUpdateImageTags(request, runtimeEnv) {
    const body = await readJsonObject(request);
    if (!body) {
        return json({ error: 'Request body must be a valid JSON object' }, 400);
    }
    if (!Array.isArray(body.ids) || body.ids.length === 0) {
        return json({ error: 'ids array is required and must not be empty' }, 400);
    }
    if (body.ids.length > MAX_BATCH_SIZE) {
        return json({ error: `Maximum ${MAX_BATCH_SIZE} images per batch request` }, 400);
    }
    // 两个列表都走 normalizeTags 的入库契约（trim/截断/去重/封顶 20）；
    // null = 传了但不是字符串数组
    const addTags = body.addTags === undefined ? [] : normalizeTags(body.addTags);
    const removeTags = body.removeTags === undefined ? [] : normalizeTags(body.removeTags);
    if (!addTags || !removeTags) {
        return json({ error: 'addTags/removeTags must be arrays of strings' }, 400);
    }
    if (addTags.length === 0 && removeTags.length === 0) {
        return json({ error: 'addTags or removeTags must contain at least one tag' }, 400);
    }
    // 提升为 const：Array.isArray 的收窄跨不进闭包（与 batch-create 同因）
    const batchIds = body.ids;
    return withGalleryTransaction(async () => {
        const imagesState = await getImagesState(runtimeEnv);
        const images = imagesState.images.slice();
        const indexById = new Map(images.map((img, imgIndex) => [img.id, imgIndex]));
        // 移除按小写比对：标签检索（list/random 索引）全站都是大小写不敏感的，
        // 只有存的时候按原样 —— 移除若区分大小写就删不掉「ACG」里的「acg」
        const lowerRemove = new Set(removeTags.map(tag => tag.toLowerCase()));
        const results = [];
        let successCount = 0;
        for (const rawId of batchIds) {
            if (typeof rawId !== 'string' || !isValidImageId(rawId)) {
                results.push({ success: false, id: typeof rawId === 'string' ? rawId : '', error: 'Invalid image id' });
                continue;
            }
            const position = indexById.get(rawId);
            if (position === undefined) {
                results.push({ success: false, id: rawId, error: 'Image not found' });
                continue;
            }
            const current = images[position];
            // 加回仍过一遍 normalizeTags：与 create/update「提交什么就存什么」同契约；
            // 重复 id 天然幂等（第二次在已合并结果上再合并，结果不变）
            const kept = current.tags.filter(tag => !lowerRemove.has(tag.toLowerCase()));
            const merged = normalizeTags([...kept, ...addTags]) ?? [];
            images[position] = { ...current, tags: merged };
            successCount += 1;
            results.push({ success: true, id: rawId, tags: merged });
        }
        // 一条都没改到（全部无效/不存在）就不落库，省掉一次徒劳的 meta 重写
        if (successCount > 0) {
            await saveAllImages(images, runtimeEnv);
        }
        return json({
            total: batchIds.length,
            success: successCount,
            failed: batchIds.length - successCount,
            results,
        });
    });
}
// ── POST /api/create ─────────────────────────────────────────
export async function handleCreateImage(request, runtimeEnv) {
    const body = await readJsonObject(request);
    if (!body) {
        return json({ error: 'Request body must be a valid JSON object' }, 400);
    }
    const imageUrl = normalizeImageUrl(body.url);
    if (!imageUrl) {
        return json({ error: 'url must be a valid http(s) URL' }, 400);
    }
    const tags = normalizeTags(body.tags);
    if (!tags) {
        return json({ error: 'tags must be an array of strings' }, 400);
    }
    return withGalleryTransaction(async () => {
        const imagesState = await getImagesState(runtimeEnv);
        const images = imagesState.images.slice();
        const newImage = {
            id: generateImageId(),
            url: imageUrl,
            title: normalizeTitle(body.title),
            tags,
            createdAt: new Date().toISOString(),
        };
        if (imagesState.index.urlSet.has(newImage.url)) {
            return json({ error: 'Image URL already exists' }, 409);
        }
        images.push(newImage);
        await saveAllImages(images, runtimeEnv);
        return json(newImage, 201);
    });
}
// ── PUT /api/update/:id ──────────────────────────────────────
export async function handleUpdateImage(request, id, runtimeEnv) {
    if (!isValidImageId(id)) {
        return json({ error: 'Invalid image id' }, 400);
    }
    const body = await readJsonObject(request);
    if (!body) {
        return json({ error: 'Request body must be a valid JSON object' }, 400);
    }
    return withGalleryTransaction(async () => {
        const imagesState = await getImagesState(runtimeEnv);
        const images = imagesState.images.slice();
        const index = images.findIndex(img => img.id === id);
        if (index === -1) {
            return json({ error: 'Image not found' }, 404);
        }
        const nextUrl = body.url === undefined ? images[index].url : normalizeImageUrl(body.url);
        if (!nextUrl) {
            return json({ error: 'url must be a valid http(s) URL' }, 400);
        }
        if (nextUrl !== images[index].url) {
            if (images.some(img => img.id !== id && img.url === nextUrl)) {
                return json({ error: 'Image URL already exists' }, 409);
            }
        }
        const nextTags = body.tags === undefined ? images[index].tags : normalizeTags(body.tags);
        if (!nextTags) {
            return json({ error: 'tags must be an array of strings' }, 400);
        }
        images[index] = {
            ...images[index],
            url: nextUrl,
            title: body.title === undefined ? images[index].title : normalizeTitle(body.title, images[index].title),
            tags: nextTags,
        };
        await saveAllImages(images, runtimeEnv);
        return json(images[index]);
    });
}
// ── DELETE /api/delete/:id ───────────────────────────────────
export async function handleDeleteImage(id, runtimeEnv) {
    if (!isValidImageId(id)) {
        return json({ error: 'Invalid image id' }, 400);
    }
    return withGalleryTransaction(async () => {
        const imagesState = await getImagesState(runtimeEnv);
        const filtered = imagesState.images.filter(img => img.id !== id);
        if (filtered.length === imagesState.images.length) {
            return json({ error: 'Image not found' }, 404);
        }
        await saveAllImages(filtered, runtimeEnv);
        return json({ success: true, deletedId: id });
    });
}
