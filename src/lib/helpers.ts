import { toast } from 'sonner';
import { MAX_IMAGE_URL_LENGTH, MAX_TAG_LENGTH, MAX_TAGS_PER_IMAGE } from './constants';
import { stripControlChars } from './text';
import { copyToClipboard } from './utils';

/**
 * Copy text to clipboard with toast feedback.
 */
export async function copyText(text: string, successMessage = '已复制到剪贴板'): Promise<boolean> {
  try {
    await copyToClipboard(text);
    toast.success(successMessage);
    return true;
  } catch (err) {
    toast.error(getErrorMessage(err, '复制失败，请手动复制'));
    return false;
  }
}

/**
 * 浏览器原生网络错误的已知文案。
 *
 * fetch 在网络层失败（断网 / 接口未部署 / CORS 预检失败 / 预览链接过期）时
 * 抛的是各浏览器自己的英文 TypeError，不是我们接口的错误体：
 *   Chrome/Edge : Failed to fetch
 *   Firefox     : NetworkError when attempting to fetch resource.
 *   Safari      : Load failed / The Internet connection appears to be offline.
 * 这些文案会经 getErrorMessage 原样弹给用户（「获取随机图片失败: Failed to fetch」）。
 * 只映射网络类原文：其余错误一律原样透传，不吞信息。
 */
const NETWORK_ERROR_ZH =
  '网络请求未能送达接口（连接中断或服务不可达），请检查网络后重试';

/** 请求超时（api-client 的 AbortSignal.timeout）走单独文案：与「送不达」是两回事 */
const TIMEOUT_ERROR_ZH = '接口响应超时，请稍后重试';

function isNativeNetworkError(error: unknown): boolean {
  // 只认 TypeError / DOMException 这类原生网络异常的文案，
  // 避免把接口返回的同名文本（比如某个业务错误正好写了 Load failed）也改写。
  if (!(error instanceof TypeError) && !(error instanceof DOMException)) return false;
  const message = error.message;
  return (
    /^failed to fetch$/i.test(message) ||
    /^networkerror/i.test(message) ||
    /^load failed$/i.test(message) ||
    /internet connection appears to be offline/i.test(message)
  );
}

/**
 * 是否为「请求被超时中断」。
 *
 * api-client 用 AbortSignal.timeout 给所有请求加 15s 兜底。它触发时抛的
 * DOMException 与「用户主动取消」是**同一个族**，历史上有测试明确要求
 * AbortError 不得被译成网络故障（那是主动取消，不该谎报故障）。
 *
 * 两者的可靠区分点是 name：
 *   · AbortSignal.timeout()      → name === 'TimeoutError'（规范规定的专用名）
 *   · AbortController.abort()    → name === 'AbortError'
 * 所以只认 TimeoutError，绝不按 message 里的 "aborted"/"timed out" 猜 ——
 * 那会把用户主动取消也一并误报成超时。
 *
 * （兼容考量：个别旧实现只给 'AbortError'。但宁可漏译这一支，也不能把
 * 主动取消误译 —— 漏译只是文案不完美，误译是给用户错误的因果。）
 */
function isTimeoutError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'TimeoutError';
}

/**
 * Extract a user-friendly message from an unknown error.
 * 原生网络错误统一译成中文，其余原样透传。
 */
export function getErrorMessage(error: unknown, fallback: string): string {
  if (isTimeoutError(error)) return TIMEOUT_ERROR_ZH;
  if (isNativeNetworkError(error)) return NETWORK_ERROR_ZH;
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * 用户是否要求减弱动效。JS 显式传的 `behavior: 'smooth'` 不受 CSS 的
 * reduced-motion 媒体查询约束，所以所有编程式滚动都要先过这个闸门。
 */
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Format "2025-06-15" → "6/15".
 */
export function formatShortDate(value: string): string {
  const [, month, day] = value.split('-');
  return month && day ? `${Number(month)}/${Number(day)}` : value;
}

/**
 * Format a number using zh-CN locale (thousands separator).
 */
const zhNumberFormatter = new Intl.NumberFormat('zh-CN');

export function formatNumber(value: number): string {
  return zhNumberFormatter.format(value);
}

/**
 * Parse a comma-separated tag string into a deduplicated, trimmed array.
 * 按后端同一契约封顶（每张 20 个、单个 40 字，超出静默截断），
 * 保证「提交什么就存什么」，不靠后端兜底。
 */
export function parseTagsInput(value: string): string[] {
  return [...new Set(stripControlChars(value).split(/[,，]/).map(tag => tag.trim().slice(0, MAX_TAG_LENGTH)).filter(Boolean))]
    .slice(0, MAX_TAGS_PER_IMAGE);
}

/**
 * 批量导入这批 URL 序列化后的真实字节数。
 *
 * 必须与 batchCreateImages 实际发出的 body **同形**（`{ images: [...] }`、
 * title 是 `图片 N`、tags 共用同一份），否则预检的数字和真正发出去的不是一回事，
 * 就又退化成拦不住。按 UTF-8 字节算 —— 服务端判的是字节不是字符数，
 * 一个中文 URL 字符占 3 字节。
 *
 * 存在的理由：条数上限(500) × 每条 URL 上限(2048) 序列化后约 1MB，
 * 是服务端请求体上限(256KB) 的 ~4 倍 —— 两个各自合法的上限没法同时满足，
 * 只查条数会让用户贴满后被服务端以体积超限拒掉。
 */
export function batchPayloadBytes(urls: string[], tagsRaw: string): number {
  return new TextEncoder().encode(JSON.stringify({ images: buildBatchImagesPayload(urls, tagsRaw) })).byteLength;
}

/**
 * 批量导入的 body.images。预检与实际发送共用，避免两处各写一份而漂移。
 */
export function buildBatchImagesPayload(urls: string[], tagsRaw: string) {
  const tags = parseTagsInput(tagsRaw);
  return urls.map((url, index) => ({ url, title: `图片 ${index + 1}`, tags }));
}

/**
 * 图片地址规范化的结果。
 *
 * 区分 'too-long' 与 'invalid'，因为两者该给用户**不同**的报错：
 * 超长的地址本身是合法的 http(s) 地址（浏览器能打开），只是太长。
 * 把它混进「不是有效的 http(s) 地址」里，用户会去逐字检查格式，
 * 而真正该做的是换一条短一点的地址 —— 提示指错了方向。
 */
export type CanonicalImageUrl =
  | { ok: true; url: string }
  | { ok: false; reason: 'too-long' | 'invalid' };

/**
 * Canonicalize an image URL the same way the backend does (`new URL().toString()`).
 * 失败时带上原因。
 */
export function canonicalizeImageUrlWithReason(value: string): CanonicalImageUrl {
  const trimmed = value.trim();
  if (!trimmed) return { ok: false, reason: 'invalid' };
  if (trimmed.length > MAX_IMAGE_URL_LENGTH) return { ok: false, reason: 'too-long' };
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return { ok: false, reason: 'invalid' };
    if (parsed.username || parsed.password) return { ok: false, reason: 'invalid' };
    const canonical = parsed.toString();
    // 百分号转义会让规范化结果比原串更长：输入明明 ≤ 上限，却在这里被判超长。
    return canonical.length <= MAX_IMAGE_URL_LENGTH
      ? { ok: true, url: canonical }
      : { ok: false, reason: 'too-long' };
  } catch {
    return { ok: false, reason: 'invalid' };
  }
}

/**
 * 只关心「能不能拿到规范化地址」时用这个（构建去重集合、清洗服务端返回值等）。
 * 面向用户的校验请用 canonicalizeImageUrlWithReason，它带得上失败原因。
 */
export function canonicalizeImageUrl(value: string): string | null {
  const result = canonicalizeImageUrlWithReason(value);
  return result.ok ? result.url : null;
}

/** 超长/无效两种失败对应的中文提示（前端各处共用，避免文案各写一份）。 */
export function imageUrlErrorMessage(reason: 'too-long' | 'invalid'): string {
  return reason === 'too-long'
    ? `图片地址太长（上限 ${MAX_IMAGE_URL_LENGTH} 字符），请换一条短一点的地址`
    : '图片地址必须是有效的 http(s) URL';
}

export interface ParsedBatchUrls {
  /** Canonical URLs that are valid and not seen before (ready to import). */
  validNew: string[];
  /** Canonical URLs duplicated within this paste (2nd+ occurrences). */
  duplicatesInBatch: string[];
  /** Canonical URLs already present in the gallery. */
  alreadyExists: string[];
  /** Raw lines that are not valid http(s) URLs. */
  invalid: string[];
  /**
   * Raw lines rejected specifically for being too long.
   *
   * 与 `invalid` 分开列，因为给用户的说法不同：超长的地址是**合法**的 http(s)
   * 地址，只是太长。混进 `invalid` 里，界面只能说「不是有效的 http(s) 地址」，
   * 用户便去逐字检查格式，而该做的是换条短地址。
   * 注意这些行**同时也在** `invalid` 里（invalid 仍是「不能导入的全部」，
   * 既有消费方按原语义继续工作），tooLong 只是其中的一个子集。
   */
  tooLong: string[];
}

const BATCH_SPLIT_PATTERN = /[\s,，;；\n\r]+/;

/**
 * Split pasted text (newlines, spaces, commas all accepted), canonicalize each
 * URL, and classify into valid-new / in-batch duplicates / already-in-gallery / invalid.
 * Comparison semantics match the backend `normalizeImageUrl` + `urlSet` check.
 */
export function parseBatchUrls(input: string, existingCanonicalUrls?: Set<string>): ParsedBatchUrls {
  // 顺序很关键：**先按分隔符切，再逐项剔控制字符**。
  // 反过来（先剔再切）会把 \n / \t 这些**分隔符本身**剔掉，
  // 多行粘贴的 URL 会被粘成一条 —— 实测三行粘贴变成
  // ["https://a/1.jpghttps://a/2.jpghttps://a/3.jpg"]，全部导入失败。
  const raws = input
    .split(BATCH_SPLIT_PATTERN)
    .map(part => stripControlChars(part).trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const validNew: string[] = [];
  const duplicatesInBatch: string[] = [];
  const alreadyExists: string[] = [];
  const invalid: string[] = [];
  const tooLong: string[] = [];

  for (const raw of raws) {
    const canonical = canonicalizeImageUrlWithReason(raw);
    if (!canonical.ok) {
      if (!invalid.includes(raw)) invalid.push(raw);
      // 超长单独记一份，让界面能给出「太长」而不是「格式不对」
      if (canonical.reason === 'too-long' && !tooLong.includes(raw)) tooLong.push(raw);
      continue;
    }
    if (seen.has(canonical.url)) {
      if (!duplicatesInBatch.includes(canonical.url)) duplicatesInBatch.push(canonical.url);
      continue;
    }
    seen.add(canonical.url);
    if (existingCanonicalUrls?.has(canonical.url)) {
      alreadyExists.push(canonical.url);
    } else {
      validNew.push(canonical.url);
    }
  }

  return { validNew, duplicatesInBatch, alreadyExists, invalid, tooLong };
}

/**
 * Clamp a number between min and max.
 */
export function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Compute visible page numbers for a pagination control.
 */
export function getVisiblePages(currentPage: number, totalPages: number): number[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const middle = clampNumber(currentPage, 3, totalPages - 2);
  const pages = new Set([1, middle - 1, middle, middle + 1, totalPages]);
  return [...pages].sort((a, b) => a - b);
}
