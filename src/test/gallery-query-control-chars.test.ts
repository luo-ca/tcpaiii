import { describe, expect, it } from "vitest";
import { readGalleryQuery } from "@/lib/url";

/**
 * 地址栏筛选必须剔除控制字符（P149）。
 *
 * 触发路径很现实：粘贴/分享的链接里带上 `%00`（NUL）或其它 C0 控制字符。
 * 实测 readGalleryQuery(`?tag=%00%00`) 返回 tag = "\u0000\u0000"：
 *
 *   · 标签筛选条会渲染出一个**文字为空的胶囊**（控制字符零宽），
 *     但它是「已选中」态，还带着「看更多」的可点击区域；
 *   · 选中后地址栏写回 %00，分享出去别人同样中招；
 *   · 请求确实带上它做筛选，后端 toLowerCase 不崩但永远匹配不到；
 *   · 搜索词含控制字符时更隐蔽：输入框看着是空的，页面却是「无结果」——
 *     用户完全找不到自己设的条件在哪。
 *
 * 修法：读入时剔掉 C0/C1 控制字符与 DEL，并重新 trim
 *（剔完可能露出首尾空白）。不做更激进的过滤（如只留字母数字）——
 * 标签本身允许中文、emoji、空格等，过度过滤会砍掉合法内容。
 */

describe("readGalleryQuery · 控制字符收口（P149）", () => {
  it("tag 里的 NUL 被剔除，不再生成空胶囊", () => {
    const { tag } = readGalleryQuery("?tag=%00%00");
    expect(tag, "tag 只剩控制字符时应视为无效").toBeNull();
  });

  it("q 里的 NUL 被剔除，不再出现「看不见筛选条件」的空结果", () => {
    const { search } = readGalleryQuery("?q=%00");
    expect(search).toBe("");
  });

  it("控制字符夹在正常文字中时只剔控制字符，保留文字", () => {
    const { tag } = readGalleryQuery("?tag=" + encodeURIComponent("风\u0000景"));
    expect(tag).toBe("风景");
  });

  it("剔除后重新 trim：控制字符挡在空白外侧时也要收干净", () => {
    const { tag } = readGalleryQuery("?tag=" + encodeURIComponent("\u0000 风景 \u0000"));
    expect(tag).toBe("风景");
  });

  it("正常值不受影响（回归闸）", () => {
    expect(readGalleryQuery("?q=%E7%8C%AB&tag=%E9%A3%8E%E6%99%AF")).toEqual({
      search: "猫",
      tag: "风景",
    });
  });

  it("emoji 与多语言标签不被误伤", () => {
    const { tag } = readGalleryQuery("?tag=" + encodeURIComponent("壁纸🎨"));
    expect(tag).toBe("壁纸🎨");
  });
});