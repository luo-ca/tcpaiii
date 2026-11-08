import { describe, expect, it } from "vitest";

import { canonicalizeImageUrlWithReason } from "@/lib/helpers";
import { normalizeImageUrlWithReason } from "../../edge-functions-src/lib/validation";

/**
 * 前端与后端的 URL 规范化必须逐例同结果。
 *
 * 两处各写一遍（前端 `src/lib/helpers.ts`、后端 `edge-functions-src/lib/validation.ts`），
 * 因为边缘函数不能 import 前端代码。它们的输出是**去重集合的键**：
 *   · 批量导入预检用前端那份判断「库里是否已有」；
 *   · /api/create、/api/batch 用后端那份判断「是否重复」。
 * 两份一旦漂移，症状是静默的 —— 预检说「全新」，服务端却回 `URL already exists`，
 * 用户看到的是一屏失败，且完全猜不到原因。
 *
 * 这里用同一组输入同时打两边，逐条比对 `{ ok, url }` / `{ ok, reason }`。
 */

const CASES = [
  // 正常形态
  "https://a.test/x.jpg",
  "  https://a.test/x.jpg  ",
  "http://a.test/x.jpg",
  // 大小写与默认端口
  "HTTPS://A.TEST/X.JPG",
  "https://a.test:443/x",
  "http://a.test:80/x",
  "https://a.test:8443/x",
  // 百分号转义与 Unicode
  "https://a.test/a b.jpg",
  "https://a.test/中.jpg",
  "https://a.test/%E4%B8%AD.jpg",
  // 路径 / 查询 / 片段
  "https://a.test",
  "https://a.test?q=1",
  "https://a.test/x.jpg#frag",
  "https://a.test/x.jpg?a=1&b=2",
  // 非法：协议、凭据、相对地址
  "ftp://a.test/x.jpg",
  "javascript:alert(1)",
  "data:image/png;base64,AAAA",
  "https://user:pass@a.test/x.jpg",
  "https://user@a.test/x.jpg",
  "//a.test/x.jpg",
  "example.com/x.jpg",
  "https:",
  "",
  "   ",
];

describe("前后端 URL 规范化一致性", () => {
  it("同一输入在两侧给出相同的 ok 与 url", () => {
    for (const input of CASES) {
      const fe = canonicalizeImageUrlWithReason(input);
      const be = normalizeImageUrlWithReason(input);
      expect(be, `输入 ${JSON.stringify(input)} 两侧结果不一致`).toEqual(fe);
    }
  });

  it("超长判定两侧一致（都是 too-long，不是 invalid）", () => {
    const longUrl = `https://a.test/${"z".repeat(2100)}.jpg`;
    expect(canonicalizeImageUrlWithReason(longUrl)).toEqual({ ok: false, reason: "too-long" });
    expect(normalizeImageUrlWithReason(longUrl)).toEqual({ ok: false, reason: "too-long" });
  });

  it("非字符串输入两侧都判 invalid（后端签名接受 unknown）", () => {
    for (const value of [null, undefined, 42, {}, []]) {
      expect(normalizeImageUrlWithReason(value)).toEqual({ ok: false, reason: "invalid" });
    }
  });

  it("规范化后的地址是幂等的（二次规范化不再变化）", () => {
    for (const input of CASES) {
      const once = canonicalizeImageUrlWithReason(input);
      if (!once.ok) continue;
      const twice = canonicalizeImageUrlWithReason(once.url);
      expect(twice, `${input} 二次规范化后变了：去重会漏`).toEqual({ ok: true, url: once.url });
    }
  });
});
