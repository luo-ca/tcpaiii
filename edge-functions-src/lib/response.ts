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
        // 纵深防御：/api/* 里有会「原样回显调用方输入」的响应
        // （例如 /api/random?tag=<script>... 会把 tag 写进 error 文案）。
        // 它靠 application/json 本身不足以自保 —— 某些老浏览器会对顶层导航
        // 做 MIME 嗅探，把 JSON 当 HTML 解析，于是回显的内容就成了 XSS。
        // 全网响应头里的 nosniff 目前只由 edgeone.json 的 /* 规则提供，
        // 一旦那条规则被改窄，这些接口就会同时失去这层保护。
        // 所以函数自己再声明一次 —— 与 CDN 层重复是无害的，缺了才致命。
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0',
        'CDN-Cache-Control': 'no-store',
        'Surrogate-Control': 'no-store',
        'Timing-Allow-Origin': '*',
        Pragma: 'no-cache',
        Expires: '0',
        Vary: 'Accept, Accept-Encoding, Origin, Referer',
    };
}

/**
 * 由 json() 自己决定的头，调用方的 opts.headers 同名项一律丢弃。
 *
 * cache-control / cdn-cache-control / vary 与 content-type 同理：它们由
 * cacheControl 分支决定，而 Headers 对同名头是「拼接」而不是「后写者胜」
 * （传 'cache-control: no-store' 会得到 "no-store, public, s-maxage=..."），
 * 一段 no-store 就足以让 CDN 从此不再缓存可缓存读接口。
 */
const RESERVED_HEADERS = new Set([
    'content-type',
    'x-content-type-options',
    'cache-control',
    'cdn-cache-control',
    'vary',
]);

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
    // 安全头不可被调用方覆盖，而 HTTP 头名大小写不敏感：光把 opts?.headers 提到
    // 前面展开不够 —— 传 "Content-Type" 与我们的 "content-type" 在 Headers 里是两个
    // 键，会被合并成 "text/html, application/json"。所以按小写名剔一遍再展开。
    const extraHeaders = Object.entries(opts?.headers ?? {}).filter(
        ([name]) => !RESERVED_HEADERS.has(name.toLowerCase()),
    );
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            ...Object.fromEntries(extraHeaders),
            // nosniff 无条件加，不挂在任一分支上 —— 否则「可缓存」那支会悄悄漏掉它，
            // 而漏掉正是最难被发现的（缓存响应平时看起来一切正常）。
            'X-Content-Type-Options': 'nosniff',
            'content-type': 'application/json',
            ...cacheHeaders,
            ...corsHeaders(),
        },
    });
}
