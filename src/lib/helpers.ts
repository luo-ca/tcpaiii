import { toast } from 'sonner';
import { MAX_IMAGE_URL_LENGTH, MAX_TAG_LENGTH, MAX_TAGS_PER_IMAGE } from './constants';
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
 * Extract a user-friendly message from an unknown error.
 */
export function getErrorMessage(error: unknown, fallback: string): string {
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
  return [...new Set(value.split(/[,，]/).map(tag => tag.trim().slice(0, MAX_TAG_LENGTH)).filter(Boolean))]
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
  const raws = input.split(BATCH_SPLIT_PATTERN).map(part => part.trim()).filter(Boolean);
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
