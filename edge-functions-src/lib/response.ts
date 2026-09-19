// Response helpers: json(), CORS headers, cache-control headers.

export function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '0',
    };
}

export function noStoreHeaders() {
    return {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0',
        'CDN-Cache-Control': 'no-store',
        'Surrogate-Control': 'no-store',
        'Timing-Allow-Origin': '*',
        Pragma: 'no-cache',
        Expires: '0',
        Vary: 'Accept, Accept-Encoding, Origin, Referer',
    };
}

export function json(
    body: unknown,
    status = 200,
    opts?: { cacheControl?: string; headers?: Record<string, string> },
) {
    // cacheControl 是给可缓存读接口（stats / 分页 list）显式开的口子；
    // 不传就是原来的全套 no-store，写接口与错误响应永远走这条。
    const cacheHeaders = opts?.cacheControl
        ? { 'Cache-Control': opts.cacheControl, 'CDN-Cache-Control': opts.cacheControl, Vary: 'Accept, Accept-Encoding' }
        : noStoreHeaders();
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            'content-type': 'application/json',
            ...cacheHeaders,
            ...corsHeaders(),
            ...opts?.headers,
        },
    });
}
