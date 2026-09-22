import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 后台的错误态也要保留页头。
 *
 * 原先 admin-page 的 imagesQuery.isError 分支是**提前 return** 一张错误卡：
 *   if (imagesQuery.isError) { return (<div …><ErrorState … /></div>); }
 * 而「管理后台 / 图片管理」这两个标题定义在它**之后**，于是加载失败时
 * 连同页面身份一起丢掉 —— 用户看到一张孤零零的报错卡，不知道自己在哪一页。
 *
 * 图库页（gallery-browse）的错误态是内联在版式里的，h1「二次元图库」始终在。
 * 两页行为不一致，这里对齐到「错误态保留 h1」。
 *
 * 源码层验证：错误分支的 return 之前必须已经出现 <h1>。
 */

const admin = readFileSync(
  resolve(process.cwd(), "src/features/admin-page.tsx"),
  "utf8",
);
const gallery = readFileSync(
  resolve(process.cwd(), "src/features/gallery-browse.tsx"),
  "utf8",
);

describe("后台错误态 · 保留页头", () => {
  /**
   * 精确切出错误分支（从 `if (imagesQuery.isError) {` 到该 if 的收尾 `  }`）。
   * 不能用「往后取 N 个字符」的宽松窗口 —— 加载骨架里也有 <h1>，
   * 窗口一大就会把骨架的 h1 算进来，于是删掉错误分支的 h1 后测试照样通过。
   * （第一版就是这么写的，实测漏判。）
   */
  function errorBranch(): string {
    const at = admin.indexOf("if (imagesQuery.isError)");
    if (at < 0) throw new Error("找不到错误分支");
    const rest = admin.slice(at);
    const end = rest.indexOf("\n  }\n");
    return end > 0 ? rest.slice(0, end + 4) : rest;
  }

  it("错误分支里渲染了 h1", () => {
    const branch = errorBranch();
    expect(branch.length, "错误分支切分为空").toBeGreaterThan(50);
    expect(branch, "错误卡仍把页头丢了").toContain("<h1");
    expect(branch).toContain("图片管理");
  });

  it("页头还带小标题，且确实在 ErrorState 之前", () => {
    const branch = errorBranch();
    expect(branch, "缺少「管理后台」小标题").toContain("管理后台");
    expect(branch.indexOf("<h1"), "页头应排在错误卡之前").toBeLessThan(
      branch.indexOf("ErrorState"),
    );
  });

  it("仍然渲染错误提示与重试", () => {
    const branch = errorBranch();
    expect(branch).toContain("ErrorState");
    expect(branch).toContain("onRetry");
  });

  it("与图库页保持一致：那边的 h1 也在错误分支之前", () => {
    const galleryErr = gallery.indexOf("imagesQuery.isError ?");
    expect(galleryErr).toBeGreaterThan(0);
    expect(gallery.slice(0, galleryErr), "图库页也丢了页头").toContain("<h1");
  });
});
