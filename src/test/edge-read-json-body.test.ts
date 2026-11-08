import { describe, expect, it } from "vitest";

import { readJsonBody } from "../../edge-functions-src/lib/validation";
import { MAX_JSON_BODY_BYTES } from "../../edge-functions-src/lib/types";

/**
 * `readJsonBody` 的三态返回。
 *
 * 它是全部写接口的唯一入口。三态必须分得清：
 *   · `too-large` —— 体积超限，回 413；
 *   · `invalid`   —— 空体 / 非法 JSON / 不是对象，回 400；
 *   · `ok`        —— 解析出对象。
 *
 * 混为一谈的代价是真实的：把「体积超限」报成「不是合法 JSON」会让用户
 * 逐条检查一堆本来就合法的 URL。这里把两种失败分别钉住。
 */

function post(body: string, headers: Record<string, string> = {}) {
  return new Request("https://t.paiii.cn/api/create", {
    method: "POST",
    body,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("readJsonBody · 成功", () => {
  it("解析出普通对象", async () => {
    await expect(readJsonBody(post('{"url":"https://a.test/x.jpg"}'))).resolves.toEqual({
      ok: true,
      body: { url: "https://a.test/x.jpg" },
    });
  });

  it("空对象也是合法对象", async () => {
    await expect(readJsonBody(post("{}"))).resolves.toEqual({ ok: true, body: {} });
  });
});

describe("readJsonBody · invalid", () => {
  it("空 body", async () => {
    await expect(readJsonBody(post(""))).resolves.toEqual({ ok: false, reason: "invalid" });
  });

  it("非法 JSON", async () => {
    await expect(readJsonBody(post("{broken"))).resolves.toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("JSON 但不是对象（数组 / 标量 / null）", async () => {
    for (const raw of ["[]", "[1,2]", "null", "42", '"text"']) {
      await expect(readJsonBody(post(raw)), `${raw} 被当成对象放行了`).resolves.toEqual({
        ok: false,
        reason: "invalid",
      });
    }
  });
});

describe("readJsonBody · too-large", () => {
  it("body 按 UTF-8 字节判，不是按字符数", async () => {
    // 字符数远小于上限，但每个中文字符 3 字节
    const big = JSON.stringify({ title: "图".repeat(Math.ceil(MAX_JSON_BODY_BYTES / 3) + 10) });
    expect(big.length, "用例前提：字符数本身没超限").toBeLessThan(MAX_JSON_BODY_BYTES);
    await expect(readJsonBody(post(big))).resolves.toEqual({ ok: false, reason: "too-large" });
  });

  it("content-length 撒谎（声称很小）时仍按真实字节判", async () => {
    const big = JSON.stringify({ title: "x".repeat(MAX_JSON_BODY_BYTES + 100) });
    await expect(
      readJsonBody(post(big, { "content-length": "10" })),
    ).resolves.toEqual({ ok: false, reason: "too-large" });
  });

  it("content-length 超限时提前拒绝（不必读完 body）", async () => {
    const request = post("{}", { "content-length": String(MAX_JSON_BODY_BYTES + 1) });
    await expect(readJsonBody(request)).resolves.toEqual({ ok: false, reason: "too-large" });
  });

  it("恰好等于上限时放行（边界不能误杀）", async () => {
    // 构造一个字节数正好为 MAX_JSON_BODY_BYTES 的合法 JSON 对象
    const prefix = '{"title":"';
    const suffix = '"}';
    const padding = MAX_JSON_BODY_BYTES - prefix.length - suffix.length;
    const raw = `${prefix}${"a".repeat(padding)}${suffix}`;
    expect(new TextEncoder().encode(raw).byteLength).toBe(MAX_JSON_BODY_BYTES);
    await expect(readJsonBody(post(raw))).resolves.toMatchObject({ ok: true });
  });
});
