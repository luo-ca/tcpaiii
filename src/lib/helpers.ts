import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { toast } from 'sonner';
import { copyToClipboard } from './utils';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

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
 * Format "2025-06-15" → "6/15".
 */
export function formatShortDate(value: string): string {
  const [, month, day] = value.split('-');
  return month && day ? `${Number(month)}/${Number(day)}` : value;
}

/**
 * Format a number using zh-CN locale (thousands separator).
 */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat('zh-CN').format(value);
}

/**
 * Format a date-time string for display in zh-CN.
 */
export function formatDateTime(value: string | null): string {
  if (!value) return '暂无数据';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '时间无效';

  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Parse a comma-separated tag string into a deduplicated, trimmed array.
 */
export function parseTagsInput(value: string): string[] {
  return [...new Set(value.split(/[,，]/).map(tag => tag.trim()).filter(Boolean))];
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
