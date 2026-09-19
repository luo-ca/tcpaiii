// Slim route dispatcher for EdgeOne Pages Functions.
// All business logic lives in ../lib/*; this file only dispatches routes.
import { API_BUILD_ID } from '../lib/types';
import { corsHeaders, json, noStoreHeaders } from '../lib/response';
import { decodeRouteSegment } from '../lib/validation';
import { getKvHealth, resetImagesCache } from '../lib/kv';
import { resetStatsCache, getRecentStatsDateKeys, getStatsDateKey } from '../lib/stats';
import { handleAdminVerify, resetAdminThrottle, verifyAdminRequest } from '../lib/auth';
import { handleBatchCreateImages, handleCreateImage, handleDeleteImage, handleListImages, handleRandomImage, handleUpdateImage, } from '../lib/images';
import { handleStats } from '../lib/stats';
// ── Simple in-memory rate limiter for /api/random ────────────
const RATE_LIMIT_WINDOW_MS = 1000;
const RATE_LIMIT_MAX = 100;
let _rlCount = 0;
let _rlStart = 0;
function checkRateLimit() {
    const now = Date.now();
    if (now - _rlStart >= RATE_LIMIT_WINDOW_MS) {
        _rlCount = 1;
        _rlStart = now;
        return true;
    }
    _rlCount++;
    return _rlCount <= RATE_LIMIT_MAX;
}
// ── Combined cache reset (test helper) ───────────────────────
function resetRuntimeCaches() {
    resetImagesCache();
    resetStatsCache();
    resetAdminThrottle();
}
// ── Main fetch handler ───────────────────────────────────────
const handler = {
    async fetch(request, runtimeEnv, executionContext) {
        const url = new URL(request.url);
        const pathname = url.pathname;
        // CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                headers: {
                    ...noStoreHeaders(),
                    ...corsHeaders(),
                },
            });
        }
        try {
            // GET /api/health
            if (pathname === '/api/health') {
                if (request.method === 'GET')
                    return json({
                        ok: true,
                        runtime: 'edgeone-pages',
                        buildId: API_BUILD_ID,
                        timestamp: new Date().toISOString(),
                        kv: getKvHealth(runtimeEnv),
                    });
                return json({ error: 'Method Not Allowed' }, 405);
            }
            // GET /api/random  (rate-limited)
            if (pathname === '/api/random') {
                if (request.method === 'GET') {
                    if (!checkRateLimit())
                        return json({ error: 'Too Many Requests' }, 429, { headers: { 'Retry-After': '1' } });
                    return await handleRandomImage(request, runtimeEnv, executionContext);
                }
                return json({ error: 'Method Not Allowed' }, 405);
            }
            // GET /api/list
            if (pathname === '/api/list') {
                if (request.method === 'GET')
                    return await handleListImages(request, runtimeEnv);
                return json({ error: 'Method Not Allowed' }, 405);
            }
            // GET /api/admin/verify
            if (pathname === '/api/admin/verify') {
                if (request.method === 'GET')
                    return await handleAdminVerify(request, runtimeEnv);
                return json({ error: 'Method Not Allowed' }, 405);
            }
            // POST /api/batch
            if (pathname === '/api/batch') {
                if (request.method === 'POST') {
                    const authError = await verifyAdminRequest(request, runtimeEnv);
                    if (authError)
                        return authError;
                    return await handleBatchCreateImages(request, runtimeEnv);
                }
                return json({ error: 'Method Not Allowed' }, 405);
            }
            // POST /api/create
            if (pathname === '/api/create') {
                if (request.method === 'POST') {
                    const authError = await verifyAdminRequest(request, runtimeEnv);
                    if (authError)
                        return authError;
                    return await handleCreateImage(request, runtimeEnv);
                }
                return json({ error: 'Method Not Allowed' }, 405);
            }
            // PUT /api/update/:id
            const updateMatch = pathname.match(/^\/api\/update\/([^/]+)$/);
            if (updateMatch) {
                if (request.method === 'PUT') {
                    const authError = await verifyAdminRequest(request, runtimeEnv);
                    if (authError)
                        return authError;
                    const imageId = decodeRouteSegment(updateMatch[1]);
                    return imageId
                        ? await handleUpdateImage(request, imageId, runtimeEnv)
                        : json({ error: 'Invalid image id' }, 400);
                }
                return json({ error: 'Method Not Allowed' }, 405);
            }
            // DELETE /api/delete/:id
            const deleteMatch = pathname.match(/^\/api\/delete\/([^/]+)$/);
            if (deleteMatch) {
                if (request.method === 'DELETE') {
                    const authError = await verifyAdminRequest(request, runtimeEnv);
                    if (authError)
                        return authError;
                    const imageId = decodeRouteSegment(deleteMatch[1]);
                    return imageId
                        ? await handleDeleteImage(imageId, runtimeEnv)
                        : json({ error: 'Invalid image id' }, 400);
                }
                return json({ error: 'Method Not Allowed' }, 405);
            }
            // GET /api/stats
            if (pathname === '/api/stats') {
                if (request.method === 'GET')
                    return await handleStats(runtimeEnv);
                return json({ error: 'Method Not Allowed' }, 405);
            }
            // 404
            return json({ error: 'Not Found' }, 404);
        }
        catch (err) {
            console.error('Unhandled error:', err);
            return json({
                error: 'Internal Server Error',
                buildId: API_BUILD_ID,
            }, 500);
        }
    },
};
async function onRequest(context) {
    return handler.fetch(context.request, context.env, context);
}
export default onRequest;
export { handler };
export { onRequest };
export { getRecentStatsDateKeys, getStatsDateKey, resetRuntimeCaches };
