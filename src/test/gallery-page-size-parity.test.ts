import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `GALLERY_PAGE_SIZE` ↔ `DEFAULT_LIST_PAGE_SIZE` 必须登记进 constants-parity 的 PAIRS。
 *
 * 值的相等与否已由 constants-parity 的 `it.each(PAIRS)` 覆盖，这里只钉**登记本身**：
 * 那对常量此前从未进表，于是两侧各自漂移没有任何测试会红。
 * 「已登记」不能靠值比对证明 —— 只要有人把 PAIRS 里的那一行删掉，
 * 值比对会连同断言一起消失，静默退化成不检查（该文件自己有一条
 * 「防止改名后这条测试空跑」的用例，正是同一个道理）。
 *
 * 背景：客户端请求带的是前端那份值，而服务端在请求**未带** pageSize 时
 * 用的是后端那份默认值（首页预览就不传 pageSize）。两者漂移时，
 * 首页预览与图库页的每页张数会悄悄不同 —— 不报错，只是分页粒度分裂。
 */
describe("图库每页张数常量必须被一致性护栏登记", () => {
  const PARITY = readFileSync(
    resolve(process.cwd(), "src/test/constants-parity.test.ts"),
    "utf8",
  );
  const FE = readFileSync(resolve(process.cwd(), "src/lib/constants.ts"), "utf8");
  const BE = readFileSync(resolve(process.cwd(), "edge-functions-src/lib/types.ts"), "utf8");

  it("两侧确实各自定义了这个常量（防正则匹配到空气）", () => {
    expect(FE).toMatch(/export const GALLERY_PAGE_SIZE\s*=\s*\d/);
    expect(BE).toMatch(/export const DEFAULT_LIST_PAGE_SIZE\s*=\s*\d/);
  });

  it("PAIRS 中登记了 GALLERY_PAGE_SIZE ↔ DEFAULT_LIST_PAGE_SIZE", () => {
    expect(
      PARITY,
      "未登记：删掉 PAIRS 里那一行不会让任何测试变红，两侧可悄悄漂移",
    ).toMatch(/GALLERY_PAGE_SIZE[\s\S]{0,120}DEFAULT_LIST_PAGE_SIZE/);
  });
});
