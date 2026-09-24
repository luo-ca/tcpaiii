
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "@/lib/api-client";

/**
 * 服务端英文错误必须译成中文再给用户（P108）。
 *
 * Edge 函数返回的 error 字段是英文，而 getErrorMessage 直接把 error.message
 * 展示出来 —— 中文后台里会冒出纯英文报错。实测触发路径（都属正常操作）：
 *
 *   服务端文案                                      触发场景
 *   Invalid admin token                             密钥填错
 *   Admin token is not configured                   密钥未配置
 *   Too many failed admin attempts, try again later 连续试错
 *   Image URL already exists                        添加/编辑成重复地址
 *   URL already exists                              批量粘贴重复地址
 *   url must be a valid http(s) URL                 地址格式非法
 *   Image not found                                 编辑/删除刚被删的图
 *
 * 原先只有 admin-page 对 `not configured` 特判了一次，其余全部漏出。
 * 修法是在 apiRequest 的边界层统一映射（所有调用方自动受益）。
 */

// apiRequest 会走 buildApiPath，需要最小 window stub（与 api-client-preview.test 同做法）
function stubWindow() {
  vi.stubGlobal("window", {
    location: { origin: "https://t.example.test", pathname: "/admin", search: "", hash: "" },
  });
}

function stubError(status: number, body: unknown) {
  stubWindow();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    ),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

async function messageOf(status: number, body: unknown): Promise<string> {
  stubError(status, body);
  try {
    await apiRequest("/api/x", undefined, "操作失败");
    throw new Error("should have thrown");
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

describe("服务端错误 · 英译中", () => {
  it("密钥相关", async () => {
    expect(await messageOf(401, { error: "Invalid admin token" })).toBe("管理密钥错误");
    expect(await messageOf(401, { error: "Admin token required" })).toBe("请先填写管理密钥");
    expect(await messageOf(500, { error: "Admin token is not configured" })).toContain(
      "服务端未配置管理密钥",
    );
    expect(
      await messageOf(429, { error: "Too many failed admin attempts, try again later" }),
    ).toContain("尝试次数过多");
  });

  it("图片地址相关（添加/编辑/批量三个入口共用）", async () => {
    expect(await messageOf(409, { error: "Image URL already exists" })).toBe("该图片地址已存在");
    expect(await messageOf(409, { error: "URL already exists" })).toBe("该图片地址已存在");
    expect(await messageOf(400, { error: "url must be a valid http(s) URL" })).toContain(
      "http(s) URL",
    );
    expect(await messageOf(400, { error: "URL must be a valid http(s) URL" })).toContain(
      "http(s) URL",
    );
  });

  it("其它常见服务端错误", async () => {
    expect(await messageOf(404, { error: "Image not found" })).toContain("图片不存在");
    expect(await messageOf(404, { error: "No images available" })).toContain("没有可用的图片");
    expect(await messageOf(400, { error: "Invalid image payload" })).toContain("格式不正确");
    expect(await messageOf(429, { error: "Too Many Requests" })).toContain("频繁");
  });

  it("未收录的文案原样透传（不吞信息）", async () => {
    expect(await messageOf(500, { error: "some brand new server failure" })).toBe(
      "some brand new server failure",
    );
  });

  it("message 字段同样被映射（不只是 error）", async () => {
    expect(await messageOf(401, { message: "Invalid admin token" })).toBe("管理密钥错误");
  });

  it("响应体没有可用文案时用调用方 fallback", async () => {
    expect(await messageOf(500, {})).toBe("操作失败");
  });
});
