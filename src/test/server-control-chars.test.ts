import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { normalizeTitle, normalizeTags, stripControlChars } from "../../edge-functions-src/lib/validation";

/**
 * 服务端也必须剔除控制字符（P179）。
 *
 * 前端有 stripControlChars（src/lib/text.ts），用了 9 处 —— 但**全在输入路径**
 * （搜索框、标签框、标题框、URL 解析），一处都没用在服务端。
 * 而服务端连等价函数都没有：normalizeTitle / normalizeTags 只 trim + 截长度。
 *
 * 于是有一个直调就能踩的缺口：
 *   实测往 /api/create 传 title "\u0000带控制字符\u0000"，服务端原样入库
 *   （trim 不会去掉 NUL —— 它不是空白）。入库后：
 *     · 界面渲染出零宽字符，肉眼看不出任何异常；
 *     · aria-label 里带上 NUL，读屏软件可能提前截断或整段跳过 ——
 *       用户听到的是残缺甚至空白的标题，而肉眼排查时什么都看不到。
 *
 * 为什么不能只靠前端那道：/api/create 与 /api/batch 是**可被直接调用**的公开接口，
 * 绕过表单就能写入；KV 也可能被手工改过、或存着更早没有校验时写入的记录。
 * 前端那层是「用户友好」，服务端这层才是「数据洁净」。
 *
 * 修法：服务端补一份同规则的 stripControlChars，在 normalizeTitle / normalizeTags 里应用。
 * URL 不需要 —— normalizeImageUrl 走 new URL()，控制字符会让它直接抛错返回 null。
 */

describe("服务端 · 控制字符收口", () => {
  it("title 里的 NUL 被剔除", () => {
    expect(normalizeTitle("\u0000带控制字符\u0000")).toBe("带控制字符");
  });

  it("整个 title 都是控制字符时回退到默认名（trim 挡不住 NUL）", () => {
    expect(normalizeTitle("\u0000")).toBe("未命名图片");
    expect(normalizeTitle("\u0009\u001f")).toBe("未命名图片");
    // 只含空白字符的也应该回退
    expect(normalizeTitle("   ")).toBe("未命名图片");
  });

  it("title 中间的控制字符被剔除而非截断", () => {
    expect(normalizeTitle("前\u0009中\u001f后")).toBe("前中后");
  });

  it("不误删中文、emoji 与空格（本站标签合法地包含这些）", () => {
    expect(normalizeTitle("🎨🖼️ 标题 带空格")).toBe("🎨🖼️ 标题 带空格");
    expect(normalizeTags(["风景 壁纸", "🎨", "中文标签"])).toEqual(["风景 壁纸", "🎨", "中文标签"]);
  });

  it("tags 逐项剔除控制字符", () => {
    expect(normalizeTags(["\u0000标签", "正\u0007常", ""])).toEqual(["标签", "正常"]);
  });

  it("纯控制字符的标签被过滤掉（filter(Boolean) 挡不住 NUL）", () => {
    expect(normalizeTags(["\u0000", "\u001f"])).toEqual([]);
  });

  it("stripControlChars 覆盖 C0/C1 与 DEL，保留普通字符", () => {
    expect(stripControlChars("a\u0000b\u001fc\u007fd")).toBe("abcd");
    expect(stripControlChars("a\u0080b\u009fc")).toBe("abc");
    expect(stripControlChars("abc-_.~:/?#[]@中文")).toBe("abc-_.~:/?#[]@中文");
  });

  it("前端与服务端的控制字符规则一致（两处各写一遍，不能漂移）", () => {
    const FE = readFileSync(resolve(process.cwd(), "src/lib/text.ts"), "utf8");
    const BE = readFileSync(resolve(process.cwd(), "edge-functions-src/lib/validation.ts"), "utf8");
    const re = /replace\(\/\[[^\]]*\]\/g/;
    const feRule = FE.match(re);
    const beRule = BE.match(re);
    expect(feRule, "前端 stripControlChars 的正则没找到").not.toBeNull();
    expect(beRule, "服务端 stripControlChars 的正则没找到").not.toBeNull();
    expect(beRule![0], "两端控制字符正则漂移了").toBe(feRule![0]);
  });
});
