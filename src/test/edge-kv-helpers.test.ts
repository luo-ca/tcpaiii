import { describe, expect, it } from "vitest";

import { buildImageIndex, parseStoredJson } from "../../edge-functions-src/lib/kv";
import type { ImageRecord } from "../../edge-functions-src/lib/types";

/**
 * KV 读路径上的两个纯函数。
 *
 * `parseStoredJson` 是「KV 里存的到底是什么」的唯一解释入口：可能是字符串
 * （正常写入）、可能已经是对象（某些绑定会替我们解析）、也可能是被截断的
 * 半截 body。它必须在这三种情况下都给出可用的值而不是抛错。
 *
 * `buildImageIndex` 决定标签检索的键口径：全站大小写不敏感，`ACG`/`acg`/`Acg`
 * 是**同一个**桶、筛选出同一批图。若这里按原样建桶，/api/stats 会多出几张
 * chip，点下去命中同一批 —— 用户以为它们是不同标签。
 */

function image(overrides: Partial<ImageRecord> & Pick<ImageRecord, "id" | "url">): ImageRecord {
  return {
    id: overrides.id,
    url: overrides.url,
    title: overrides.title ?? "t",
    tags: overrides.tags ?? [],
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
  };
}

describe("parseStoredJson", () => {
  it("字符串按 JSON 解析", () => {
    expect(parseStoredJson('{"a":1}', null)).toEqual({ a: 1 });
    expect(parseStoredJson("[1,2]", [])).toEqual([1, 2]);
  });

  it("解析失败时回退（KV 里的半截 body 不该让读路径抛错）", () => {
    expect(parseStoredJson("{broken", "fb")).toBe("fb");
    expect(parseStoredJson("", "fb")).toBe("fb");
  });

  it("非字符串原样返回：undefined 才用回退，其余（含 null）视为已是值", () => {
    const value = { a: 1 };
    expect(parseStoredJson(value, "fb")).toBe(value);
    expect(parseStoredJson(null, "fb")).toBeNull();
    expect(parseStoredJson(undefined, "fb")).toBe("fb");
  });
});

describe("buildImageIndex", () => {
  it("按小写建桶，同一标签的大小写变体落进同一个桶", () => {
    const images = [
      image({ id: "1", url: "https://a.test/1.jpg", tags: ["ACG"] }),
      image({ id: "2", url: "https://a.test/2.jpg", tags: ["acg"] }),
      image({ id: "3", url: "https://a.test/3.jpg", tags: ["Acg"] }),
    ];
    const index = buildImageIndex(images);
    expect([...index.byTag.keys()]).toEqual(["acg"]);
    expect(index.byTag.get("acg")).toHaveLength(3);
  });

  it("sortedTags 按小写去重，保留首次出现的原样写法", () => {
    const images = [
      image({ id: "1", url: "https://a.test/1.jpg", tags: ["ACG", "壁纸"] }),
      image({ id: "2", url: "https://a.test/2.jpg", tags: ["acg", "风景"] }),
    ];
    const index = buildImageIndex(images);
    // 存储按原样保留（首次出现的 ACG），检索按小写合并
    expect(index.sortedTags).toEqual(["ACG", "壁纸", "风景"]);
  });

  it("urlSet 收集全部规范化后的地址", () => {
    const index = buildImageIndex([
      image({ id: "1", url: "https://a.test/1.jpg" }),
      image({ id: "2", url: "https://a.test/2.jpg" }),
    ]);
    expect(index.urlSet).toEqual(new Set(["https://a.test/1.jpg", "https://a.test/2.jpg"]));
  });

  it("空图库给出空索引（不抛错）", () => {
    const index = buildImageIndex([]);
    expect(index.byTag.size).toBe(0);
    expect(index.sortedTags).toEqual([]);
    expect(index.urlSet.size).toBe(0);
  });

  it("一张图带多个标签时各自进桶，且都指向同一张图", () => {
    const images = [
      image({ id: "1", url: "https://a.test/1.jpg", tags: ["acg", "壁纸"] }),
    ];
    const index = buildImageIndex(images);
    expect([...index.byTag.keys()]).toEqual(["acg", "壁纸"]);
    expect(index.byTag.get("acg")?.[0].id).toBe("1");
    expect(index.byTag.get("壁纸")?.[0].id).toBe("1");
    expect(index.sortedTags).toEqual(["acg", "壁纸"]);
  });
});
