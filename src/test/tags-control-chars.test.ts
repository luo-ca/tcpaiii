import { describe, expect, it } from "vitest";
import { parseTagsInput, parseBatchUrls } from "@/lib/helpers";

/**
 * 标签输入也要剔控制字符（P150）。
 *
 * parseTagsInput 是三个表单（单张添加 / 编辑 / 批量导入）共用的标签解析器，
 * 结果直接随请求落库。实测当前行为：
 *
 *   parseTagsInput("\u0000")        => ["\u0000"]   ← 纯 NUL 被当成合法标签
 *   parseTagsInput("风\u0000景")     => ["风\u0000景"]
 *
 * 为什么 filter(Boolean) 挡不住：单个 NUL 是非空字符串，Boolean 为真。
 * 而 trim() 只去空白（含 \t\n\r 等），不去 NUL/其它 C0 控制符。
 *
 * 后果：
 *   · 标签列表里出现一个**看不见的标签**（零宽），点它筛不出任何结果；
 *   · 它会进 KV、进 /api/stats 的 tags 数组，被前端当普通标签渲染成空胶囊；
 *   · 删除它需要重新打开编辑框、肉眼找不到那个标签 —— 只能整张图重存。
 *
 * 修法：parseTagsInput 先剔控制字符再 trim、切分、去重。
 * 只剔控制符，不用「只留字母数字」那种激进过滤（会砍掉中文/emoji/空格）。
 */

describe("parseTagsInput · 控制字符收口（P150）", () => {
  it("纯 NUL 不再被当成合法标签", () => {
    expect(parseTagsInput("\u0000")).toEqual([]);
  });

  it("夹在文字中的控制字符被剔除，文字保留", () => {
    expect(parseTagsInput("风\u0000景")).toEqual(["风景"]);
    expect(parseTagsInput("正常\u0001标签")).toEqual(["正常标签"]);
  });

  it("DEL 与 C1 控制符同样剔除", () => {
    expect(parseTagsInput("a\u007fb")).toEqual(["ab"]);
    expect(parseTagsInput("a\u0085b")).toEqual(["ab"]);
  });

  it("正常标签完全不受影响（回归闸）", () => {
    expect(parseTagsInput("风景, acg，壁纸")).toEqual(["风景", "acg", "壁纸"]);
    expect(parseTagsInput("壁纸🎨")).toEqual(["壁纸🎨"]);
  });

  it("含控制字符的重复标签仍能正确去重", () => {
    // 两个只有控制字符不同的「风景」应视为同一个
    expect(parseTagsInput("风景,风\u0000景")).toEqual(["风景"]);
  });

  it("批量导入的 URL 解析也要剔控制字符（同一入口族）", () => {
    // URL 里混入 NUL 会让 canonicalizeImageUrl 解析失败——那是正确行为；
    // 但纯控制字符不该被当成一行「无效地址」报给用户。
    const r = parseBatchUrls("\u0000\nhttps://ok.example.com/a.jpg");
    expect(r.invalid, "纯控制字符行不该算作无效地址").toEqual([]);
    expect(r.validNew).toHaveLength(1);
  });
it("多行粘贴不被粘连（先切分隔符再剔控制字符的顺序契约）", () => {
    // 这条是 P150 实测踩到的回归：把 stripControlChars 放在 split **之前**，
    // 会连 \n / \t 这些分隔符一起剔掉，三行 URL 被粘成一条，
    // 结果是「粘贴三行、只导入一条且多半失败」。
    const input = "https://a.test/1.jpg\nhttps://a.test/2.jpg\nhttps://a.test/3.jpg";
    const r = parseBatchUrls(input);
    expect(r.validNew, "多行粘贴被粘连了").toHaveLength(3);
    expect(r.validNew[0]).toBe("https://a.test/1.jpg");

    // 制表符同样要当分隔符
    const tabbed = "https://a.test/1.jpg\thttps://a.test/2.jpg";
    expect(parseBatchUrls(tabbed).validNew).toHaveLength(2);
  });
});