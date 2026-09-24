import { describe, expect, it } from "vitest";
import { readGalleryQuery } from "@/lib/url";
import { MAX_SEARCH_LENGTH, MAX_TAG_LENGTH } from "@/lib/constants";

/**
 * readGalleryQuery 必须按后端同一上限截断（P132）。
 *
 * 输入框上的 maxLength 只限制**打字**，管不到从地址栏读进来的初值：
 *
 *   const [{ search: initialSearch, tag: initialTag }] =
 *     useState(() => readGalleryQuery(window.location.search));
 *
 * 于是任何手工构造或他人分享的超长链接都会把超长值直接送进状态：
 *   · selectedTag 变成 500 字的串 → 标签筛选条没有任何 chip 处于选中态
 *     （列表里的 tag 都是短串），界面看起来像「全部」，但请求确实带了 tag；
 *   · /api/list 的服务端会把 search 截到 100、tag 截到 40
 *     （edge-functions-src/lib/types.ts 的 MAX_LIST_FILTER_LENGTH / MAX_TAG_LENGTH），
 *     于是**实际生效的筛选条件与地址栏里的不是同一个** ——
 *     「分享这个链接」复现不出用户看到的结果。
 *
 * 修法：读入时就用前端同名的两个上限截断，让地址栏与请求条件始终一致。
 */

describe("readGalleryQuery · 长度收口（P132）", () => {
  it("超长 tag 截到 MAX_TAG_LENGTH", () => {
    const long = "x".repeat(500);
    const { tag } = readGalleryQuery(`?tag=${long}`);
    expect(tag).not.toBeNull();
    expect(tag!.length).toBe(MAX_TAG_LENGTH);
    expect(tag).toBe(long.slice(0, MAX_TAG_LENGTH));
  });

  it("超长 q 截到 MAX_SEARCH_LENGTH", () => {
    const long = "y".repeat(500);
    const { search } = readGalleryQuery(`?q=${long}`);
    expect(search.length).toBe(MAX_SEARCH_LENGTH);
  });

  it("截断规则与后端一致（trim 后 slice），分享链接才能复现同样结果", () => {
    // 后端 edge-functions-src/lib/images.ts 的规则是：
    //   search = param.trim().toLowerCase().slice(0, MAX_LIST_FILTER_LENGTH)
    //   tag    = param.trim().slice(0, MAX_TAG_LENGTH)
    // 前端只要用同一套（trim → slice）就能保证「地址栏里的条件 == 请求条件」。
    // 这条钉的是规则一致，而不是某种字符切法 —— 两边同样是 UTF-16 slice，
    // 遇到 emoji 边界时的行为也一致，这正是可分享的前提。
    const raw = "  风景".repeat(30) + "  ";
    const { tag } = readGalleryQuery(`?tag=${encodeURIComponent(raw)}`);
    expect(tag).toBe(raw.trim().slice(0, MAX_TAG_LENGTH));

    const rawSearch = "  keyword".repeat(30);
    const { search } = readGalleryQuery(`?q=${encodeURIComponent(rawSearch)}`);
    expect(search).toBe(rawSearch.trim().slice(0, MAX_SEARCH_LENGTH));
  });

  it("正常长度不受影响（回归闸）", () => {
    expect(readGalleryQuery("?q=%E7%8C%AB&tag=%E9%A3%8E%E6%99%AF")).toEqual({
      search: "猫",
      tag: "风景",
    });
  });

  it("截断在 trim 之后（先裁空白再截，不浪费额度）", () => {
    const padded = `  ${"z".repeat(300)}  `;
    const { search } = readGalleryQuery(`?q=${encodeURIComponent(padded)}`);
    expect(search).toBe("z".repeat(MAX_SEARCH_LENGTH));
  });
});