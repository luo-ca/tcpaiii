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
export function json(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            'content-type': 'application/json',
            ...noStoreHeaders(),
            ...corsHeaders(),
        },
    });
}
