import { describe, expect, it } from "vitest";

import { translateServerError } from "@/lib/api-client";

/**
 * 服务端英文错误的翻译表本身。
 *
 * `server-error-i18n.test.ts` 走的是 apiRequest 全链路，
 * `server-error-i18n-coverage.test.ts` 扫源码确认「每条服务端文案都有映射」。
 * 这里补的是表自身的**语义**：锚定是否够紧、大小写是否不敏感、
 * 带捕获组的那条是否把用户输入回填、映射不到时是否原样透传（不吞信息）。
 *
 * 锚定太松会误伤：比如 /url already exists/ 不锚开头，就会把
 * 「some brand new server failure: url already exists」整句替换掉，
 * 用户丢失上下文。
 */

describe("translateServerError · 精确映射", () => {
  it("大小写不敏感", () => {
    expect(translateServerError("INVALID ADMIN TOKEN")).toBe("管理密钥错误");
    expect(translateServerError("invalid admin token")).toBe("管理密钥错误");
  });

  it("两端空白不影响匹配", () => {
    expect(translateServerError("  Image not found  ")).toBe("图片不存在（可能刚被删除）");
  });

  it("数字型上限用真实数值回填语义，不写死具体数字", () => {
    expect(translateServerError("Maximum 500 images per batch request")).toBe(
      "单次批量数量超出上限",
    );
    expect(translateServerError("Maximum 999 images per batch request")).toBe(
      "单次批量数量超出上限",
    );
    expect(translateServerError("Request body exceeds 262144 bytes")).toBe(
      "这批数据太大，超过了单次请求的体积上限，请分批提交",
    );
  });

  it("带标签的 404 保留用户输入的标签名", () => {
    expect(translateServerError("No images found with tag: acg")).toBe(
      "没有找到标签为「acg」的图片",
    );
    expect(translateServerError("No images found with tag: 风景 壁纸")).toBe(
      "没有找到标签为「风景 壁纸」的图片",
    );
  });

  it("超长与格式非法是两条不同文案（提示方向不同）", () => {
    const tooLong = translateServerError("URL exceeds 2048 characters");
    const invalid = translateServerError("url must be a valid http(s) URL");
    expect(tooLong).toContain("太长");
    expect(invalid).toContain("有效的 http(s) URL");
    expect(tooLong).not.toBe(invalid);
  });

  it("映射不到的文案原样返回（不吞信息、不截断）", () => {
    const unknown = "some brand new server failure: url already exists";
    expect(translateServerError(unknown)).toBe(unknown);
    expect(translateServerError("")).toBe("");
  });

  it("锚定够紧：前缀带别的内容时不误判", () => {
    // 若正则不锚开头，下面这些都会被整句替换，用户丢失上下文
    for (const message of [
      "upstream said: Invalid admin token",
      "wrapped error -> Image not found",
    ]) {
      expect(translateServerError(message), message).toBe(message);
    }
  });
});
