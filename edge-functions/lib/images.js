// Image CRUD route handlers.
import { MAX_BATCH_SIZE } from './types';
import { corsHeaders, json, noStoreHeaders } from './response';
import { isJsonObject, isValidImageId, normalizeImageUrl, normalizePositiveInt, normalizeTags, normalizeTitle, readJsonObject, } from './validation';
import { DEFAULT_LIST_PAGE_SIZE, MAX_LIST_PAGE_SIZE, } from './types';
import { getAllImages, getImagesState, saveAllImages } from './kv';
import { updateRequestStats } from './stats';
// ── Helpers ──────────────────────────────────────────────────
function generateImageId() {
    if (typeof crypto.randomUUID === 'function') {
        return `img-${crypto.randomUUID()}`;
    }
    return `img-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
// ── GET /api/random ──────────────────────────────────────────
export async function handleRandomImage(request, runtimeEnv, executionContext) {
    const url = new URL(request.url);
    const tag = url.searchParams.get('tag') || url.searchParams.get('type');
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
        return json({ error: `No images found with tag: ${tag}` }, 404);
    }
    const randomIndex = Math.floor(Math.random() * candidates.length);
    const selected = candidates[randomIndex];
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
    const search = url.searchParams.get('search')?.trim().toLowerCase() ?? '';
    const tag = url.searchParams.get('tag')?.trim() ?? '';
    if (!pageParam && !pageSizeParam && !search && !tag) {
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
    });
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
    const imagesState = await getImagesState(runtimeEnv);
    const images = imagesState.images.slice();
    const existingUrls = new Set(imagesState.index.urlSet);
    const results = [];
    for (const item of body.images) {
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
        total: body.images.length,
        success: successCount,
        failed: body.images.length - successCount,
        results,
    }, 201);
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
}
// ── DELETE /api/delete/:id ───────────────────────────────────
export async function handleDeleteImage(id, runtimeEnv) {
    if (!isValidImageId(id)) {
        return json({ error: 'Invalid image id' }, 400);
    }
    const imagesState = await getImagesState(runtimeEnv);
    const filtered = imagesState.images.filter(img => img.id !== id);
    if (filtered.length === imagesState.images.length) {
        return json({ error: 'Image not found' }, 404);
    }
    await saveAllImages(filtered, runtimeEnv);
    return json({ success: true, deletedId: id });
}
