import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalizeImageUrl } from "@/lib/helpers";


/**
 * 后台「单张添加」必须与批量模式同一把尺子校验 URL（P106）。
 *
 * 单张表单只写了 `type="url"` + `required`，靠浏览器原生校验兜底。但原生
 * 校验只要求「像 URL」，不管协议：
 *
 *   输入                         原生 checkValidity()   会打到 /api/create？
 *   ftp://example.com/a.jpg      true                  ✅ 会（服务端才拒）
 *   javascript:alert(1)          true                  ✅ 会（服务端才拒）
 *   http://                      false                 ❌ 不会
 *   example.com/a.jpg            false                 ❌ 不会
 *   https://ok.example.com/a.jpg true                  ✅ 正常
 *
 * 也就是 `ftp:` / `javascript:` 这类会被放行到服务端，而服务端 normalizeImageUrl
 * 只接受 http(s)，回的是英文 `url must be a valid http(s) URL` —— 管理员在
 * 中文界面里看到英文报错。批量模式早就走 canonicalizeImageUrl 前置拦下了，
 * 两处口径不一致。
 *
 * 修法：单张提交也用 canonicalizeImageUrl 前置校验，并把规范化结果提交给服务端
 * （与服务端 `new URL().toString()` 同一规范化，避免同址不同写法绕过去重）。
 */

const src = readFileSync(
  resolve(process.cwd(), "src/features/admin/add-image-dialog.tsx"),
  "utf8",
);

const editSrc = readFileSync(
  resolve(process.cwd(), "src/features/admin/edit-image-dialog.tsx"),
  "utf8",
);

describe("单张添加 · URL 前置校验与批量一致", () => {
  it("提交前调用 canonicalizeImageUrl", () => {
    const i = src.indexOf("const handleSingleSubmit");
    expect(i, "未能定位 handleSingleSubmit").toBeGreaterThan(-1);
    const block = src.slice(i, src.indexOf("return (", i));
    expect(block, "单张提交未做 URL 规范化校验").toContain("canonicalizeImageUrl(url)");
  });

  it("非法 URL 给中文提示并中止（不再打到服务端看英文报错）", () => {
    const i = src.indexOf("const handleSingleSubmit");
    const block = src.slice(i, src.indexOf("return (", i));
    expect(block, "缺中文提示").toContain("图片地址必须是有效的 http(s) URL");
    expect(block, "校验失败后没有 return，仍会发请求").toMatch(/toast\.error\([^)]*\);\s*\n\s*return;/);
  });

  it("提交的是规范化后的 URL（与服务端同一规范化）", () => {
    const i = src.indexOf("createImage(");
    expect(i, "未能定位 createImage 调用").toBeGreaterThan(-1);
    // 取到该语句结尾，而不是第一个 )
    const end = src.indexOf("adminToken", i);
    const call = src.slice(i, end > i ? end : i + 400);
    expect(call, "提交的是未规范化地址：同址不同写法会绕过服务端去重").toContain(
      "canonicalizeImageUrl(url)",
    );
  });

  it("canonicalizeImageUrl 本身确实拒掉这两类（钉住依赖的行为）", () => {
    expect(canonicalizeImageUrl("ftp://example.com/a.jpg")).toBeNull();
    expect(canonicalizeImageUrl("javascript:alert(1)")).toBeNull();
    expect(canonicalizeImageUrl("https://ok.example.com/a.jpg")).toBe(
      "https://ok.example.com/a.jpg",
    );
  });

  it("编辑弹窗同样做了 URL 前置校验（同一缺口，一并修掉）", () => {
    const i = editSrc.indexOf("const handleSubmit");
    expect(i, "未能定位编辑弹窗的 handleSubmit").toBeGreaterThan(-1);
    const block = editSrc.slice(i, editSrc.indexOf("return (", i));
    expect(block, "编辑弹窗未做 URL 校验：ftp: / javascript: 会打到服务端").toContain(
      "canonicalizeImageUrl(url)",
    );
    expect(block, "缺中文提示").toContain("图片地址必须是有效的 http(s) URL");
    expect(editSrc, "编辑弹窗提交了未规范化地址").toMatch(/url: canonicalizeImageUrl\(url\)/);
  });
});
