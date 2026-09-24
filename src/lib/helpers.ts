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
 * Canonicalize an image URL the same way the backend does (`new URL().toString()`).
 * Returns null for non-http(s) URLs, URLs with embedded credentials, URLs over
 * the backend's 2048-char cap (输入与规范化结果各查一遍), or unparsable input.
 */
export function canonicalizeImageUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_IMAGE_URL_LENGTH) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (parsed.username || parsed.password) return null;
    const canonical = parsed.toString();
    return canonical.length > MAX_IMAGE_URL_LENGTH ? null : canonical;
  } catch {
    return null;
  }
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

  for (const raw of raws) {
    const canonical = canonicalizeImageUrl(raw);
    if (!canonical) {
      if (!invalid.includes(raw)) invalid.push(raw);
      continue;
    }
    if (seen.has(canonical)) {
      if (!duplicatesInBatch.includes(canonical)) duplicatesInBatch.push(canonical);
      continue;
    }
    seen.add(canonical);
    if (existingCanonicalUrls?.has(canonical)) {
      alreadyExists.push(canonical);
    } else {
      validNew.push(canonical);
    }
  }

  return { validNew, duplicatesInBatch, alreadyExists, invalid };
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
