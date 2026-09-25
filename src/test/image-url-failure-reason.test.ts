import { describe, expect, it } from "vitest";
import {
  canonicalizeImageUrl,
  canonicalizeImageUrlWithReason,
  imageUrlErrorMessage,
  parseBatchUrls,
} from "@/lib/helpers";
import { MAX_IMAGE_URL_LENGTH } from "@/lib/constants";

/**
 * 「超长」与「格式不对」必须能分辨（P189）。
 *
 * canonicalizeImageUrl 原先用单一 null 表示 6 种失败，调用方只好一律报
 * 「图片地址必须是有效的 http(s) URL」。对其中一种是**假**的：
 * 超长的地址本身是合法 http(s) 地址（浏览器能打开），只是太长。
 *
 * 最阴的一条是「规范化后超长」：输入 ≤ 2048（界面允许），
 * 但 new URL().toString() 做百分号转义后变长（一个空格 -> %20），
 * 于是被判无效 —— 用户看不出任何异常，也就不知道要缩短 URL。
 */

describe("图片地址失败原因的区分（P189）", () => {
  it("超长带 'too-long' 原因，格式错误带 'invalid'", () => {
    expect(
      canonicalizeImageUrlWithReason("https://a.test/" + "z".repeat(MAX_IMAGE_URL_LENGTH)),
    ).toMatchObject({ ok: false, reason: "too-long" });
    for (const bad of ["ftp://a.test/x.jpg", "javascript:alert(1)", "example.com/x.jpg", ""]) {
      expect(canonicalizeImageUrlWithReason(bad), `"${bad}" 应是 invalid`).toMatchObject({
        ok: false,
        reason: "invalid",
      });
    }
  });

  it("输入 ≤ 上限、但规范化后超长时也算 'too-long'（用户看不出异常的那种）", () => {
    const base = "https://a.test/img.jpg?q=";
    // 每个空格经 new URL() 转义成 %20：字符数变 3 倍
    const raw = base + " ".repeat(20) + "a".repeat(MAX_IMAGE_URL_LENGTH - base.length - 20);
    expect(raw.length).toBeLessThanOrEqual(MAX_IMAGE_URL_LENGTH);
    // 前提：它确实是个能解析的 http(s) 地址
    expect(new URL(raw).protocol).toBe("https:");

    const result = canonicalizeImageUrlWithReason(raw);
    expect(result, "规范化后 2088 字符，应判 too-long 而非 invalid").toMatchObject({
      ok: false,
      reason: "too-long",
    });
  });

  it("两种原因的提示不同，且都不是英文", () => {
    const tooLong = imageUrlErrorMessage("too-long");
    const invalid = imageUrlErrorMessage("invalid");
    expect(tooLong).not.toBe(invalid);
    expect(tooLong).toContain("太长");
    expect(invalid).toContain("必须是有效的");
    for (const msg of [tooLong, invalid]) expect(msg).toMatch(/[\u4e00-\u9fa5]/);
  });

  it("parseBatchUrls 把超长行同时列进 invalid 和 tooLong", () => {
    const tooLongUrl = `https://a.test/${"z".repeat(MAX_IMAGE_URL_LENGTH)}.jpg`;
    const parsed = parseBatchUrls([tooLongUrl, "ftp://a.test/x.jpg", "https://a.test/ok.jpg"].join("\n"));

    // invalid 仍是「不能导入的全部」（既有消费方按原语义继续工作）
    expect(parsed.invalid).toHaveLength(2);
    // tooLong 是其中的子集，只含超长那条
    expect(parsed.tooLong).toEqual([tooLongUrl]);
    expect(parsed.tooLong).not.toContain("ftp://a.test/x.jpg");
    expect(parsed.validNew).toEqual(["https://a.test/ok.jpg"]);
  });

  it("原 canonicalizeImageUrl 的返回值语义不变（调用方无需改）", () => {
    expect(canonicalizeImageUrl("https://a.test/ok.jpg")).toBe("https://a.test/ok.jpg");
    expect(canonicalizeImageUrl("ftp://a.test/x.jpg")).toBeNull();
    expect(canonicalizeImageUrl("https://a.test/" + "z".repeat(MAX_IMAGE_URL_LENGTH))).toBeNull();
  });
});
