import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * README 的接口清单必须覆盖 dispatcher 实现的路由（P153）。
 *
 * README 是接手者了解「这个项目有哪些接口」的第一入口。它此前漏了
 * `/api/batch-update`（批量增删标签，dispatcher 里已实现、前端后台在用）——
 * 而这条恰好是「单事务、比逐张 PUT 少 N-1 次全库读改写」的那个性能接口，
 * 漏文档的代价是后来者不知道它、重新写一遍逐张 PUT。
 *
 * 断言方式：从 dispatcher 源码里抽取所有已实现路由，逐个查 README 是否提到。
 * 新增路由却忘了写文档时这条会红 —— 反向也成立（README 提到的路由必须真实存在）。
 *
 * 为什么只查 README 不查 /docs 页面：/docs 面向**公开 API 使用者**，
 * 管理类接口需要密钥、不是给普通接入者的，刻意不列（见 ApiDocsSection 的实现）。
 * README 面向**项目维护者**，管理接口必须列全。
 */

const README = readFileSync(resolve(process.cwd(), "README.md"), "utf8");
const DISPATCH = readFileSync(
  resolve(process.cwd(), "edge-functions-src/api/[[default]].ts"),
  "utf8",
);

/** dispatcher 里精确匹配的路由（pathname === '/api/xxx'） */
function implementedExactRoutes(): string[] {
  return [...DISPATCH.matchAll(/pathname === '(\/api\/[^']+)'/g)].map((m) => m[1]);
}

/** dispatcher 里正则匹配的路由（pathname.match(/^\/api\/xxx/...)） */
function implementedRegexRoutes(): string[] {
  return [...DISPATCH.matchAll(/pathname\.match\(\/\^\\\/(api\\\/[a-z-]+)/gi)].map((m) =>
    "/" + m[1].replace(/\\\//g, "/"),
  );
}

describe("README 接口清单完整性（P153）", () => {
  it("能解析出 dispatcher 的路由（防止解析失效导致空跑）", () => {
    const routes = implementedExactRoutes();
    expect(routes.length, "一条路由都没解析到，说明正则失效了").toBeGreaterThanOrEqual(5);
    expect(routes).toContain("/api/random");
    expect(routes).toContain("/api/list");
  });

  it("每个已实现路由都在 README 里出现", () => {
    const missing = implementedExactRoutes().filter((p) => !README.includes(p));
    expect(
      missing,
      "以下路由已实现但 README 未提及 —— 接手者会不知道它们存在：\n" + missing.join("\n"),
    ).toEqual([]);
  });

  it("带路径参数的路由也要有文档（update / delete）", () => {
    const regexRoutes = implementedRegexRoutes();
    expect(regexRoutes.length, "没解析到带参数的路由").toBeGreaterThanOrEqual(2);
    for (const base of regexRoutes) {
      expect(README, `${base}/:id 未在 README 中提及`).toContain(base);
    }
  });

  it("README 提到的 /api 路径都真实存在（反向：不写幽灵接口）", () => {
    // 匹配完整路径：/api/admin/verify 要整体取到，不能被截成 /api/admin
    const docPaths = [...new Set([...README.matchAll(/(\/api\/[a-z][a-z0-9-]*(?:\/[a-z][a-z0-9-]*)*)/g)].map((m) => m[1]))];
    const impl = new Set(implementedExactRoutes());
    const regexRoutes = implementedRegexRoutes();
    const ghosts = docPaths.filter(
      (p) => !impl.has(p) && !regexRoutes.some((r) => p.startsWith(r)),
    );
    expect(ghosts, "README 提到了并不存在的接口：\n" + ghosts.join("\n")).toEqual([]);
  });
});