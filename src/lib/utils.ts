import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 复制文本到剪贴板（兼容 iframe 等受限环境）
 * 优先使用 Clipboard API，被阻止时降级到 execCommand('copy')
 */
export async function copyToClipboard(text: string): Promise<void> {
  // 优先尝试 Clipboard API
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    // Clipboard API 被 permissions policy 阻止，继续降级
  }

  // 降级方案：使用 execCommand('copy')
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '-9999px';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    const copied = document.execCommand('copy');
    if (!copied) {
      throw new Error('浏览器拒绝了复制操作');
    }
  } finally {
    document.body.removeChild(textarea);
  }
}
