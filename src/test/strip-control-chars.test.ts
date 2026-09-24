import { describe, expect, it } from "vitest";
import { stripControlChars } from "@/lib/text";

/**
 * 共享清洗函数（P150）。
 *
 * 抽到 src/lib/text.ts 是因为地址栏解析（url.ts）与标签/批量导入解析
 * （helpers.ts）都需要它 —— 两份内联实现会漂移。
 *
 * 语义边界（刻意保守）：只剔 C0/C1 控制字符与 DEL，
 * 不用「只留字母数字」那种激进过滤 —— 本站标签合法地含中文、emoji、空格。
 */

describe("stripControlChars", () => {
  it("剔除 C0 控制字符（含 NUL / 制表 / 换行）", () => {
    expect(stripControlChars("a\u0000b")).toBe("ab");
    expect(stripControlChars("a\u0001\u0002b")).toBe("ab");
    expect(stripControlChars("a\u0009b")).toBe("ab");
    expect(stripControlChars("a\u000ab")).toBe("ab");
    expect(stripControlChars("a\u001fb")).toBe("ab");
  });

  it("剔除 DEL 与 C1 控制字符", () => {
    expect(stripControlChars("a\u007fb")).toBe("ab");
    expect(stripControlChars("a\u0085b")).toBe("ab");
    expect(stripControlChars("a\u009fb")).toBe("ab");
  });

  it("纯控制字符收成空串", () => {
    expect(stripControlChars("\u0000\u0000")).toBe("");
  });

  it("保留中文、emoji、空格与常见标点（不过度过滤）", () => {
    expect(stripControlChars("风景 acg-2025")).toBe("风景 acg-2025");
    expect(stripControlChars("壁纸🎨")).toBe("壁纸🎨");
    expect(stripControlChars("a/b?c=d&e")).toBe("a/b?c=d&e");
  });

  it("正常字符串原样返回（不是每次都新建语义）", () => {
    const normal = "https://cdn.example.com/a.jpg";
    expect(stripControlChars(normal)).toBe(normal);
  });
});