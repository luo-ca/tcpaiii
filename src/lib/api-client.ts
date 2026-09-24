// ============================================================
// API Client — unified HTTP layer
// ============================================================

import type { ApiErrorPayload } from './types';
import { API_HTML_FALLBACK_MESSAGE } from './constants';
import { appendCurrentPreviewParams, buildApiPath } from './url';

// ---- internal helpers ----

function isApiErrorPayload(value: unknown): value is ApiErrorPayload {
  return typeof value === 'object' && value !== null;
}

function isJsonContentType(contentType: string): boolean {
  return contentType.includes('application/json') || contentType.includes('+json');
}

function isLikelyHtmlResponse(contentType: string, body: string): boolean {
  const normalizedBody = body.trim().slice(0, 200).toLowerCase();
  return (
    contentType.includes('text/html') ||
    normalizedBody.startsWith('<!doctype') ||
    normalizedBody.startsWith('<html') ||
    normalizedBody.includes('<head')
  );
}

function summarizeBody(body: string): string {
  return body.trim().replace(/\s+/g, ' ').slice(0, 140);
}

async function readTextSafely(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

function getNonJsonApiMessage(response: Response, body: string, fallback: string): string {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';

  if (isLikelyHtmlResponse(contentType, body)) {
    return API_HTML_FALLBACK_MESSAGE;
  }

  const summary = summarizeBody(body);
  if (summary) {
    return `${fallback}：接口返回了非 JSON 内容（${summary}）`;
  }

  return `${fallback}：接口返回了非 JSON 内容`;
}

// ---- exported helpers ----

export function withNoCacheQuery(input: RequestInfo | URL, init?: RequestInit): RequestInfo | URL {
  const method = (
    init?.method || (input instanceof Request ? input.method : undefined) || 'GET'
  ).toUpperCase();
  if (method !== 'GET') return input;

  const cacheBustValue = String(Date.now());

  if (typeof input === 'string') {
    const url = new URL(buildApiPath(input), window.location.origin);
    url.searchParams.set('_t', cacheBustValue);
    return url.pathname + url.search + url.hash;
  }

  if (input instanceof URL) {
    const nextUrl = appendCurrentPreviewParams(new URL(input.toString()));
    nextUrl.searchParams.set('_t', cacheBustValue);
    return nextUrl;
  }

  if (input instanceof Request) {
    const nextUrl = appendCurrentPreviewParams(new URL(input.url));
    nextUrl.searchParams.set('_t', cacheBustValue);
    return new Request(nextUrl.toString(), input);
  }

  return input;
}

/**
 * Edge 函数返回的错误文案是英文（`Invalid admin token`、`Image URL already exists`…），
 * 而 getErrorMessage 会把 error.message 原样展示 —— 结果是中文后台里冒出英文报错。
 *
 * 实测触发路径（都是正常操作，不需要构造异常）：
 *   · 密钥填错            → Invalid admin token
 *   · 密钥未配置          → Admin token is not configured
 *   · 连续试错            → Too many failed admin attempts, try again later
 *   · 添加/编辑成重复地址 → Image URL already exists
 *   · 批量粘贴重复地址    → URL already exists
 *   · 地址格式非法        → url must be a valid http(s) URL
 *   · 编辑/删除已被删的图 → Image not found
 *
 * 原先只有 admin-page 对 `not configured` 做了一次特判，其余全部漏出。
 * 收口在这一层：所有经 apiRequest 的错误都会先过映射，调用方不必各写一份。
 * 映射不到的文案原样返回 —— 不吞信息，只是把已知的常见错误译成中文。
 */
const SERVER_ERROR_ZH: Array<[RegExp, string]> = [
  [/^invalid admin token$/i, '管理密钥错误'],
  [/^admin token required$/i, '请先填写管理密钥'],
  [/^admin token is not configured$/i, '服务端未配置管理密钥，请先在 ESA 环境变量配置 ADMIN_TOKEN'],
  [/^too many failed admin attempts/i, '管理密钥尝试次数过多，请稍后再试'],
  [/^(image )?url already exists$/i, '该图片地址已存在'],
  [/^url must be a valid https?\(s\) url$/i, '图片地址必须是有效的 http(s) URL'],
  [/^invalid image id$/i, '图片 ID 无效'],
  [/^image not found$/i, '图片不存在（可能刚被删除）'],
  [/^no images available$/i, '图库暂时没有可用的图片'],
  [/^invalid image payload$/i, '图片数据格式不正确'],
  [/^images array is required/i, '请至少提供一张图片'],
  [/^maximum \d+ images per batch/i, '单次批量数量超出上限'],
  [/^tags must be an array of strings$/i, '标签格式不正确'],
  [/^ids array is required/i, '请至少选择一张图片'],
  [/^addtags\/removetags must be arrays/i, '标签参数格式不正确'],
  [/^addtags or removetags must contain at least one tag$/i, '请至少填写一个要添加或移除的标签'],
  [/^request body must be a valid json object$/i, '请求数据格式不正确'],
  [/^too many requests$/i, '请求过于频繁，请稍后再试'],
];

function translateServerError(message: string): string {
  const trimmed = message.trim();
  for (const [pattern, zh] of SERVER_ERROR_ZH) {
    if (pattern.test(trimmed)) return zh;
  }
  return message;
}

export async function getApiErrorMessage(response: Response, fallback: string): Promise<string> {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';

  try {
    if (isJsonContentType(contentType)) {
      const payload = await response.clone().json();
      if (isApiErrorPayload(payload)) {
        return translateServerError(payload.error || payload.message || fallback);
      }
    }
  } catch {
    // Non-JSON error bodies are handled by the fallback below.
  }

  const body = await readTextSafely(response.clone());
  return getNonJsonApiMessage(response, body, fallback);
}

/**
 * Generic, robust API request wrapper.
 * - Adds cache-busting to GET requests (opt-out via `opts.bustCache: false`
 *   for idempotent list queries that benefit from CDN/edge caching)
 * - Validates JSON content-type
 * - Extracts meaningful error messages
 */
/**
 * 给任意形态的请求目标补上 EdgeOne 预览参数。
 *
 * 与 withNoCacheQuery 的 `_t` 无关 —— 预览链接（?eo_token=…）上**每一个** API
 * 请求都必须带这组参数，少了它请求会打到线上部署：预览页读到的是生产数据，
 * 管理员一次「添加图片」直接写进生产库。原先只有「GET + 破缓」这条路径顺带补过
 * （buildApiPath 在 withNoCacheQuery 里），stats / 分页 list / 全部写请求都在漏。
 */
function appendPreviewParams(input: RequestInfo | URL): RequestInfo | URL {
  if (typeof input === 'string') return buildApiPath(input);

  if (input instanceof URL) {
    return appendCurrentPreviewParams(new URL(input.toString()));
  }

  if (input instanceof Request) {
    const nextUrl = appendCurrentPreviewParams(new URL(input.url));
    // 参数已在（或不该加）时原样返回，省掉一次 Request body 搬运
    if (nextUrl.toString() === input.url) return input;
    return new Request(nextUrl.toString(), input);
  }

  return input;
}

export async function apiRequest<T>(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  fallback: string,
  opts?: { bustCache?: boolean },
): Promise<T> {
  const bustCache = opts?.bustCache ?? true;
  // 预览参数是硬契约，先无条件补齐；`_t` 破缓仍只管 GET
  const target = appendPreviewParams(input);
  const response = await fetch(bustCache ? withNoCacheQuery(target, init) : target, {
    ...init,
    // bustCache 关闭时交给服务端 Cache-Control 说话（后端已给
    // stats/分页 list 发短边缘缓存）；强推 no-store 会让那套契约形同虚设
    cache: bustCache ? 'no-store' : 'default',
  });
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';

  if (!response.ok) {
    throw new Error(await getApiErrorMessage(response, fallback));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  if (!isJsonContentType(contentType)) {
    const body = await readTextSafely(response.clone());
    throw new Error(getNonJsonApiMessage(response, body, fallback));
  }

  // 先读文本再解析，而不是 response.json()：json() 一旦失败就把 body 消费掉了，
  // 之后拿不到原文、拼不出「接口返回了非 JSON 内容（…）」这类带摘要的中文提示。
  const rawBody = await readTextSafely(response);
  try {
    return JSON.parse(rawBody) as T;
  } catch {
    // content-type 声称是 JSON，但 body 解析不了（边缘函数被截断、回源超时、
    // KV 读到半截 body）。原先抛的是 `${fallback}: invalid JSON response`，
    // 英文尾巴会被 getErrorMessage 原样弹到中文界面上。与同文件其它分支
    // （非 JSON content-type / HTML / 非 2xx）保持同一口径，全中文。
    throw new Error(getNonJsonApiMessage(response, rawBody, fallback));
  }
}
