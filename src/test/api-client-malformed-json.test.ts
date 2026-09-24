import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "@/lib/api-client";

/**
 * 200 + application/json，但 body 不是合法 JSON 时报错不能漏英文（P125）。
 *
 * api-client.ts 原先是：
 *
 *   try { return (await response.json()) as T; }
 *   catch { throw new Error(`${fallback}: invalid JSON response`); }
 *
 * `invalid JSON response` 是英文，getErrorMessage 会原样弹给用户 ——
 * 中文界面上出现「获取统计数据失败: invalid JSON response」。
 *
 * 触发场景真实存在：边缘函数被截断、回源超时、KV 读到半截 body，
 * 只要 content-type 仍是 application/json 就会走到这条分支。
 * 这与同文件其它分支（非 JSON content-type / HTML / 非 2xx）都已中文化不一致。
 */

function stubWindow() {
  vi.stubGlobal("window", {
    location: { origin: "https://t.example.test", pathname: "/status", search: "", hash: "" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

async function messageOf(rawBody: string): Promise<string> {
  stubWindow();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(rawBody, { status: 200, headers: { "content-type": "application/json" } })),
  );
  try {
    await apiRequest("/api/stats", undefined, "获取统计数据失败");
    throw new Error("should have thrown");
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

describe("apiRequest · 畸形 JSON 的错误文案", () => {
  it("截断的 JSON 不再漏出 invalid JSON response", async () => {
    const message = await messageOf('{"totalImages": 3');
    expect(message).not.toContain("invalid JSON response");
    expect(message).toContain("获取统计数据失败");
  });

  it("纯空白 body 同样中文化", async () => {
    const message = await messageOf("");
    // JSON 作为技术术语可以保留（同文件其它分支也用），但不该漏出整句英文报错
    expect(message).not.toContain("invalid");
    expect(message).not.toContain("response");
    expect(message).toContain("获取统计数据失败");
  });
});