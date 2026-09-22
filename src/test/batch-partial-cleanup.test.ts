import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalizeImageUrl } from "@/lib/helpers";

/**
 * 批量导入「部分成功」后，成功的那几行必须从输入框里清掉。
 *
 * 场景：一次粘贴 10 条，后端 7 成功 3 失败。此时弹窗**不会关闭**
 * （只有 failed === 0 才 setOpen(false)），而 textarea 里仍是原封不动的一整批。
 * 用户顺手再点一次「导入」——刚加成功的 7 条会被后端判为 'URL already exists'
 * （见 handleBatchCreateImages 的 existingUrls.has 分支），
 * 于是一屏红字报错，报的却全是已经成功的工作。
 *
 * 关键细节：两边必须**都规范化**再比。服务端回显的是 new URL().toString()，
 * 而 textarea 里是用户原样粘贴的那一行：
 *   https://cdn.example.test        -> 服务端补成 .../
 *   HTTPS://CDN.Example.Test/a.jpg  -> 服务端转小写
 *   .../a b.jpg                     -> 服务端转义成 %20
 * 直接拿 trimmed 原文 Set.has 会漏删这些行，上面的问题原样复现。
 */

const src = readFileSync(
  resolve(process.cwd(), "src/features/admin/add-image-dialog.tsx"),
  "utf8",
);

describe("批量导入 · 部分成功后清理输入框", () => {
  it("只关闭弹窗的条件仍是「零失败」", () => {
    expect(src).toMatch(/if \(result\.failed === 0\) \{\s*setOpen\(false\);/);
  });

  it("部分成功时会把输入框里成功的行去掉", () => {
    expect(src, "缺少 setBatchUrls 的清理").toMatch(/setBatchUrls\(\(current\) =>/);
    const i = src.indexOf("setBatchUrls((current) =>");
    const around = src.slice(i, i + 700);
    expect(around, "清理应发生在部分成功分支里").toContain("succeededUrls");
  });

  it("成功集合经过规范化，不是直接拿回显原文", () => {
    expect(src).toMatch(/\.map\(\(item\) => canonicalizeImageUrl\(item\.url\)\)/);
  });

  it("textarea 的每一行也经规范化后再比", () => {
    // 只断言「文里出现过 canonicalizeImageUrl」不够，但组件是 .tsx 且内部函数
    // 未导出，本仓库不挂载 DOM（无 jsdom）。所以这里诚实地分成两层：
    //   1) 源码层：断言过滤条件**确实用了**规范化结果，而不只是文里出现该词；
    //   2) 行为层：单独验证 canonicalizeImageUrl 把已知的差异用例抹平
    //      （见下一条），证明第 1 层依赖的规范化能力成立。
    // 这样至少能挡住「把过滤改回 trimmed 原文比较」这类回退。
    const i = src.indexOf("setBatchUrls((current) =>");
    const around = src.slice(i, i + 900);
    expect(around, "未在过滤条件里使用规范化结果").toMatch(
      /const canonical = canonicalizeImageUrl\(trimmed\);[\s\S]{0,80}return !\(canonical && succeededUrls\.has\(canonical\)\)/,
    );
    // 反向：不允许退回「拿 trim 后的原文去比」
    expect(around, "退回成原文比较，会漏删大小写/转义不同的成功行").not.toMatch(
      /return !succeededUrls\.has\(trimmed\);/,
    );
  });

  it("规范化行为符合预期（上面那几个差异用例）", () => {
    // 与上面注释里列的三种差异对齐，确保 helper 真的把它们抹平
    expect(canonicalizeImageUrl("https://cdn.example.test")).toBe(
      "https://cdn.example.test/",
    );
    expect(canonicalizeImageUrl("HTTPS://CDN.Example.Test/a.jpg")).toBe(
      "https://cdn.example.test/a.jpg",
    );
    expect(canonicalizeImageUrl("https://cdn.example.test/a b.jpg")).toBe(
      "https://cdn.example.test/a%20b.jpg",
    );
  });
});
