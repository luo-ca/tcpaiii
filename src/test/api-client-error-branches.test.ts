import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest, getApiErrorMessage } from "@/lib/api-client";
import { API_HTML_FALLBACK_MESSAGE } from "@/lib/constants";

/**
 * apiRequest 的「非 2xx / 非 JSON」分支。
 *
 * 这些分支的错误文案会经 getErrorMessage 原样弹给用户，所以每一条都必须
 * 是中文且能说明发生了什么。原先的覆盖只集中在「服务端英文错误映射」
 * （server-error-i18n）与「畸形 JSON」（api-client-malformed-json），
 * HTML 响应、纯文本响应、204 空响应这三条从未被直接驱动过。
 */

function stubWindow() {
  vi.stubGlobal("window", {
    location: { origin: "https://t.example.test", pathname: "/status", search: "", hash: "" },
  });
}

function stubResponse(response: Response) {
  stubWindow();
  vi.stubGlobal("fetch", vi.fn(async () => response));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

async function messageOf(response: Response): Promise<string> {
  stubResponse(response);
  try {
    await apiRequest("/api/x", undefined, "操作失败");
    throw new Error("should have thrown");
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

describe("apiRequest · 非 JSON 响应", () => {
  it("HTML 响应（Functions 未命中）给部署提示，而不是回显整段 HTML", async () => {
    const message = await messageOf(
      new Response("<!DOCTYPE html><html><head><title>404</title></head><body>not found</body></html>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
    );
    expect(message).toBe(API_HTML_FALLBACK_MESSAGE);
    expect(message).not.toContain("<");
  });

  it("content-type 撒谎（声称 JSON）但 body 是 HTML 时同样识别为 HTML", async () => {
    const message = await messageOf(
      new Response("<html><head></head><body>x</body></html>", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    expect(message).toBe(API_HTML_FALLBACK_MESSAGE);
  });

  it("纯文本响应带上调用方 fallback 与内容摘要", async () => {
    const message = await messageOf(
      new Response("upstream gateway   timeout", {
        status: 502,
        headers: { "content-type": "text/plain" },
      }),
    );
    expect(message).toContain("操作失败");
    expect(message).toContain("非 JSON");
    // 摘要里的连续空白被压成一个空格，方便一行展示
    expect(message).toContain("upstream gateway timeout");
  });

  it("空 body 的非 JSON 响应不拼出空的括号", async () => {
    const message = await messageOf(
      new Response("", { status: 500, headers: { "content-type": "text/plain" } }),
    );
    expect(message).toBe("操作失败：接口返回了非 JSON 内容");
  });

  it("错误文案全部为中文（不含成句英文）", async () => {
    const messages = [
      await messageOf(new Response("<html><body>x</body></html>", { status: 200 })),
      await messageOf(new Response("oops", { status: 500, headers: { "content-type": "text/plain" } })),
    ];
    for (const message of messages) {
      expect(message).toMatch(/[\u4e00-\u9fa5]/);
      expect(message).not.toMatch(/\binvalid JSON response\b/);
    }
  });
});

describe("apiRequest · 204 与成功分支", () => {
  it("204 无内容直接返回 undefined（不尝试解析 JSON）", async () => {
    stubResponse(new Response(null, { status: 204 }));
    await expect(apiRequest("/api/x", { method: "DELETE" }, "删除失败")).resolves.toBeUndefined();
  });

  it("application/json 之外的 +json 子类型也被接受", async () => {
    stubResponse(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/vnd.api+json" },
      }),
    );
    await expect(apiRequest("/api/x", undefined, "操作失败")).resolves.toEqual({ ok: true });
  });
});

describe("getApiErrorMessage", () => {
  it("优先取 JSON 的 error 字段并中文化", async () => {
    const message = await getApiErrorMessage(
      new Response(JSON.stringify({ error: "Image not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      }),
      "操作失败",
    );
    expect(message).toContain("图片不存在");
  });

  it("没有 error 时用 message 字段", async () => {
    const message = await getApiErrorMessage(
      new Response(JSON.stringify({ message: "Too Many Requests" }), {
        status: 429,
        headers: { "content-type": "application/json" },
      }),
      "操作失败",
    );
    expect(message).toContain("频繁");
  });

  it("JSON 里两个字段都没有时回退到调用方 fallback", async () => {
    const message = await getApiErrorMessage(
      new Response(JSON.stringify({ other: 1 }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
      "操作失败",
    );
    expect(message).toBe("操作失败");
  });

  it("非 JSON body 时不会抛错（坏报文不该盖住原始错误）", async () => {
    const message = await getApiErrorMessage(
      new Response("{broken", { status: 500, headers: { "content-type": "application/json" } }),
      "操作失败",
    );
    expect(message).toContain("操作失败");
    expect(message).toContain("非 JSON");
  });

  it("可重复读取同一个 Response（内部必须 clone，不能消费原 body）", async () => {
    const response = new Response(JSON.stringify({ error: "Image not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
    await getApiErrorMessage(response, "操作失败");
    // 原响应仍可读 —— 若实现直接 response.json() 会在这里抛 "body already read"
    await expect(response.json()).resolves.toEqual({ error: "Image not found" });
  });

  it("error / message 不是字符串时回退到 fallback，而不是误报「非 JSON 内容」", async () => {
    // 合法 JSON 只是字段类型不对：说成「接口返回了非 JSON 内容」会把排查引向错误方向。
    const payloads: unknown[] = [{ error: 42 }, { error: null }, { message: {} }, { error: {} }];
    for (const payload of payloads) {
      const message = await getApiErrorMessage(
        new Response(JSON.stringify(payload), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
        "操作失败",
      );
      expect(message, JSON.stringify(payload)).toBe("操作失败");
      expect(message, JSON.stringify(payload)).not.toContain("非 JSON");
    }
  });

  it("error 不是字符串时不会连带丢掉合法的 message", async () => {
    // 数字 42 是真值，`payload.error || payload.message` 会取到它、类型不符后
    // 整条回退 fallback，把服务端真正想说的那句一起吞掉。
    const payloads: unknown[] = [
      { error: 42, message: "标签数量超出上限" },
      { error: null, message: "标签数量超出上限" },
      { error: "", message: "标签数量超出上限" },
      { error: {}, message: "标签数量超出上限" },
    ];
    for (const payload of payloads) {
      const message = await getApiErrorMessage(
        new Response(JSON.stringify(payload), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
        "操作失败",
      );
      expect(message, JSON.stringify(payload)).toBe("标签数量超出上限");
    }
  });

  it("error 与 message 都是空白串时回退到 fallback", async () => {
    const message = await getApiErrorMessage(
      new Response(JSON.stringify({ error: "   ", message: "" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
      "操作失败",
    );
    expect(message).toBe("操作失败");
  });
});
