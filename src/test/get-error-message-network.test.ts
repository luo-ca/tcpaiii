import { describe, expect, it } from "vitest";
import { getErrorMessage } from "@/lib/helpers";

/**
 * getErrorMessage 必须把浏览器原生英文网络错误译成中文（P131）。
 *
 * 全站 10 处 catch 都经 getErrorMessage 展示文案。而 fetch 在网络层失败时抛的是
 * 浏览器原生英文 TypeError，各浏览器文案不同：
 *
 *   Chrome   : Failed to fetch
 *   Firefox  : NetworkError when attempting to fetch resource.
 *   Safari   : Load failed / The Internet connection appears to be offline.
 *   Edge     : Failed to fetch
 *
 * status-page 单独做过一次 TypeError 特判（测速那条路径），其余路径
 * （随机图预览、图库列表、后台增删改、批量导入/改标签、密钥校验）全部漏英文。
 *
 * 实测触发路径都是正常操作：断网、接口未部署、CORS 预检失败、
 * 预览链接过期 —— 用户看到的是「获取随机图片失败: Failed to fetch」这种半英文。
 *
 * 收口在 getErrorMessage 一层：调用方不必各写一份。注意只映射**已知的**
 * 网络类文案，其余错误原样透传（不吞信息）。
 */

describe("getErrorMessage · 原生网络错误中文化（P131）", () => {
  it("Chrome 的 Failed to fetch 译成中文", () => {
    const msg = getErrorMessage(new TypeError("Failed to fetch"), "获取随机图片失败");
    expect(msg).not.toContain("Failed to fetch");
    expect(msg).toContain("网络");
  });

  it("Firefox 的 NetworkError 文案译成中文", () => {
    const msg = getErrorMessage(
      new TypeError("NetworkError when attempting to fetch resource."),
      "请稍后重试",
    );
    expect(msg).not.toMatch(/NetworkError/i);
    expect(msg).toContain("网络");
  });

  it("Safari 的 Load failed 译成中文", () => {
    const msg = getErrorMessage(new TypeError("Load failed"), "请稍后重试");
    expect(msg).not.toContain("Load failed");
    expect(msg).toContain("网络");
  });

  it("网络中断提示（The Internet connection appears to be offline）译成中文", () => {
    const msg = getErrorMessage(
      new TypeError("The Internet connection appears to be offline."),
      "请稍后重试",
    );
    expect(msg).not.toContain("Internet connection");
    expect(msg).toContain("网络");
  });

  it("AbortError 不算网络故障，走 fallback/原文（不误报）", () => {
    const msg = getErrorMessage(new DOMException("The operation was aborted.", "AbortError"), "已取消");
    expect(msg).toBe("The operation was aborted.");
  });

  it("非网络类错误原样透传（不吞信息）", () => {
    expect(getErrorMessage(new Error("some brand new server failure"), "操作失败")).toBe(
      "some brand new server failure",
    );
  });

  it("没有 message 时仍用调用方 fallback", () => {
    expect(getErrorMessage(new Error(""), "操作失败")).toBe("操作失败");
    expect(getErrorMessage("plain string", "操作失败")).toBe("操作失败");
  });
});