import { describe, expect, it } from "vitest";
import { readGalleryQuery, writeGalleryQuery } from "@/lib/url";

/**
 * 图库筛选状态 <-> 地址栏。
 *
 * 这两条是「分享筛选结果」功能里唯一容易悄悄出错的逻辑：
 * 写回时如果重建查询串而不是增删，EdgeOne 预览用的 eo_token / eo_time 会被抹掉，
 * 预览链接当场失效 —— 而这类错误在本地直接打开页面时是看不出来的。
 */
describe("readGalleryQuery", () => {
  it("读得回 q 与 tag", () => {
    expect(readGalleryQuery("?q=%E7%8C%AB&tag=%E9%A3%8E%E6%99%AF")).toEqual({
      search: "猫",
      tag: "风景",
    });
  });

  it("没有筛选参数时给空值", () => {
    expect(readGalleryQuery("")).toEqual({ search: "", tag: null });
    expect(readGalleryQuery("?eo_token=abc&eo_time=123")).toEqual({ search: "", tag: null });
  });

  it("纯空白等于没筛选", () => {
    expect(readGalleryQuery("?q=%20%20&tag=%20")).toEqual({ search: "", tag: null });
  });

  it("前后空白会被裁掉", () => {
    expect(readGalleryQuery("?q=%20%E7%8C%AB%20")).toEqual({ search: "猫", tag: null });
  });
});

describe("writeGalleryQuery", () => {
  it("写入筛选条件", () => {
    expect(writeGalleryQuery("", { search: "猫", tag: "风景" })).toBe(
      "q=%E7%8C%AB&tag=%E9%A3%8E%E6%99%AF",
    );
  });

  it("保留 eo_token / eo_time 等未知参数", () => {
    const result = writeGalleryQuery("eo_token=abc&eo_time=123", { search: "猫", tag: null });
    const params = new URLSearchParams(result);
    expect(params.get("eo_token")).toBe("abc");
    expect(params.get("eo_time")).toBe("123");
    expect(params.get("q")).toBe("猫");
    expect(params.has("tag")).toBe(false);
  });

  it("清空筛选时把参数删掉，未知参数仍在", () => {
    const result = writeGalleryQuery("q=%E7%8C%AB&tag=%E9%A3%8E%E6%99%AF&eo_token=abc", {
      search: "",
      tag: null,
    });
    expect(result).toBe("eo_token=abc");
  });

  it("已是最新状态时输出稳定 —— 调用方靠它判断「无需改动地址栏」", () => {
    const once = writeGalleryQuery("", { search: "猫", tag: null });
    const twice = writeGalleryQuery(once, { search: "猫", tag: null });
    expect(twice).toBe(once);
  });

  it("两端空白不会写进地址栏", () => {
    const params = new URLSearchParams(writeGalleryQuery("", { search: "  猫  ", tag: null }));
    expect(params.get("q")).toBe("猫");
  });
});
