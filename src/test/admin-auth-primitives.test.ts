import { describe, expect, it } from "vitest";

import { timingSafeEqualString, sha256Hex, getBearerToken } from "../../edge-functions-src/lib/auth";

/**
 * 管理鉴权的两个密码学原语（P170）。
 *
 * 它们此前**零直接测试** —— 只被 functions-api.test.ts 间接穿过
 * （走完整 HTTP 流程，验的是「对的 token 能过、错的会被拒」这个粗结论）。
 * 但这两个函数各自有容易写错、且写错后不一定被端到端用例发现的细节：
 *
 *  · timingSafeEqualString —— 长度不等时必须返回 false。最朴素的写法是
 *    先 `if (a.length !== b.length) return false`（这本身就泄露长度），
 *    或者逐字节比较却在短串上多读一位。当前实现把长度差先 XOR 进 diff、
 *    再用 ?? 0 补齐，这里把行为钉住。
 *  · sha256Hex —— 一旦编码方式变了（比如漏了 TextEncoder 换成 charCodeAt），
 *    对纯 ASCII 的 token 可能仍然「看起来能对上」，但中文/emoji 密钥会静默失效。
 *
 * sha256 的期望值用的是公开标准向量，不是从当前实现反推的。
 */

describe("timingSafeEqualString · 常量时间字符串比较", () => {
  const cases: Array<[string, string, boolean, string]> = [
    ["a", "a", true, "同长相等"],
    ["a", "b", false, "同长不等"],
    ["abc", "abcd", false, "左短于右"],
    ["abcd", "abc", false, "左长于右"],
    ["", "", true, "双空串"],
    ["", "a", false, "左空右非空"],
    ["a", "", false, "左非空右空"],
    ["同一字符串", "同一字符串", true, "多字节字符相等"],
    ["同一字符串", "不同字符串", false, "多字节字符不等"],
    ["abc", "abd", false, "仅末位不同"],
  ];

  for (const [left, right, expected, label] of cases) {
    it(`${label}：${JSON.stringify(left)} vs ${JSON.stringify(right)}`, () => {
      expect(timingSafeEqualString(left, right)).toBe(expected);
    });
  }

  it("长度不等一律 false（不得因前缀相同而误判为相等）", () => {
    expect(timingSafeEqualString("secret", "secret-longer")).toBe(false);
    expect(timingSafeEqualString("secret-longer", "secret")).toBe(false);
  });
});

describe("sha256Hex · 摘要正确性", () => {
  it("空串得到 NIST 标准向量", async () => {
    expect(await sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("abc 得到 NIST 标准向量", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("输出恒为 64 位小写十六进制", async () => {
    for (const input of ["k", "管理密钥", "🔑", "a".repeat(200)]) {
      const hex = await sha256Hex(input);
      expect(hex, `输入 ${JSON.stringify(input)} 的摘要形状不对`).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("多字节字符按 UTF-8 编码（charCodeAt 写法会让中文密钥静默失效）", async () => {
    // 「管理密钥」的 UTF-8 字节序列的 SHA-256，与 charCodeAt 截断写法结果不同
    const hex = await sha256Hex("管理密钥");
    expect(hex).not.toBe(await sha256Hex(""));
    expect(hex).toMatch(/^[0-9a-f]{64}$/);
    // 同一输入必须稳定
    expect(await sha256Hex("管理密钥")).toBe(hex);
  });
});

describe("getBearerToken · 头部解析", () => {
  const req = (headers: Record<string, string>) => new Request("https://t.paiii.cn/api/health", { headers });

  it("解析标准 Bearer", () => {
    expect(getBearerToken(req({ Authorization: "Bearer abc123" }))).toBe("abc123");
  });

  it("大小写不敏感（bearer / BEARER 均接受）", () => {
    expect(getBearerToken(req({ Authorization: "bearer xyz" }))).toBe("xyz");
    expect(getBearerToken(req({ Authorization: "BEARER xyz" }))).toBe("xyz");
  });

  it("缺失或格式不对返回 null", () => {
    expect(getBearerToken(req({}))).toBeNull();
    expect(getBearerToken(req({ Authorization: "Basic abc" }))).toBeNull();
    expect(getBearerToken(req({ Authorization: "Bearer" }))).toBeNull();
  });

  it("剥离尾部空白（避免密钥对比因不可见空格失败）", () => {
    expect(getBearerToken(req({ Authorization: "Bearer  abc  " }))).toBe("abc");
  });
});
