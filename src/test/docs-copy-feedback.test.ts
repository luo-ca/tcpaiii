import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * /docs 的复制按钮要有「点了哪个只有哪个变」的就地反馈（P146）。
 *
 * 现状：ApiDocsSection 有 6 个复制按钮（URL / HTML / Markdown / 分类 / 排除 /
 * JSON），全部只有 sonner toast，按钮自身没有任何状态变化。而全站其它复制
 * 按钮（OnlinePreview ×2、image-lightbox ×1）都是「已复制 ✓」就地切换 ——
 * 同一个「复制」动作在站内有两套体验。
 *
 * 这里的坑是：**不能** 让 6 个按钮共用一个 useCopyFeedback。那个 hook 返回单个
 * 布尔，共用会让点任意一个就把 6 个按钮全部切到「已复制」—— 视觉上像是六个
 * 都复制成功了。必须按按钮区分（记录「刚复制的是哪一个」）。
 */

const DOCS = readFileSync(resolve(process.cwd(), "src/components/sections/ApiDocsSection.tsx"), "utf8");

describe("/docs 复制反馈（P146）", () => {
  it("按钮有就地状态反馈，而不是只靠 toast", () => {
    expect(DOCS, "复制按钮仍无自身状态变化").toMatch(/已复制|Check/);
  });

  it("反馈按按钮区分，不能 6 个共用一个布尔", () => {
    // 必须记录「哪个 key 被复制了」，而不是单个 copied 布尔
    expect(
      DOCS,
      "缺少「刚复制的是哪一个」的区分机制：6 个按钮会同时显示已复制",
    ).toMatch(/copiedKey|activeKey|copiedId/);
    // 不应出现裸的单布尔用法（如 const { copied } = useCopyFeedback()）
    expect(DOCS, "不该直接解构单个 copied 布尔给所有按钮共用").not.toMatch(
      /const\s*\{\s*copied\s*\}\s*=\s*useCopyFeedback/,
    );
  });

  it("6 个入口各自传 key，并把「是否已复制」按 key 判定后传给按钮", () => {
    const onCopyCount = (DOCS.match(/onCopy=/g) || []).length;
    expect(onCopyCount, "复制入口数量异常").toBeGreaterThanOrEqual(6);
    // 每个入口的 copyCode 都要带自己的 key。
    // 不用 `copyCode\([^)]*key\)` 这种正则：有一条调用的参数是模板字符串、
    // 内部含括号，字符类会被中途截断而漏数。直接数 copyCode 调用数与
    // 「逗号 + 引号 key + 右括号」后缀数，两者必须相等且 >= 6。
    const calls = (DOCS.match(/copyCode\(/g) || []).length;
    const keyed = (DOCS.match(/,\s*'[a-z]+'\)/g) || []).length;
    expect(calls, "复制入口数量异常").toBeGreaterThanOrEqual(6);
    expect(keyed, `有 ${calls - keyed} 个入口没带 key，点它会点亮错误的按钮`).toBe(calls);
    // CodeRow 要接收并按条判定 copied
    expect(DOCS).toMatch(/copied=\{copiedKey === '[a-z]+'\}/);
  });
});