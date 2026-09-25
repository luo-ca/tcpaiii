import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { createServer, type Server } from "node:http";
import { resolve } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * check:api 必须**真的**在接口坏掉时退出非零（P182）。
 *
 * 上一条测试（check-api-coverage）只解析源码，验证「脚本里出现了 /api/xxx」与
 * 「代码里写了 process.exitCode = 1」—— 但两者都不证明它会**真的触发**。
 *
 * 实测的真实盲区：assertJsonResponse 只查 content-type 与「是不是 HTML」，
 * **不查 HTTP 状态码**。于是「500 + application/json + {"error":"..."}」形如合法响应：
 *   /api/stats 恒 500、其余接口全部正常时
 *     修复前 → 脚本打印 "stats: 500"，最终 **退出码 0**（首页实时统计整块坏掉却报绿）
 *     修复后 → 退出码 1
 * 这与 P155 修的「首屏坏了不再假绿」是同一类问题，只是漏了状态码这一维。
 *
 * 这里起真桩、跑真脚本、断言真退出码 —— 只有这种测法能挡住那一类盲区。
 */

/** 起一个桩服务，按 routes 决定每个 /api 路径的响应 */
async function startStub(routes: Record<string, { status?: number; body: unknown; html?: boolean }>): Promise<{ server: Server; base: string }> {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const path = url.pathname;
    const route = routes[path];
    if (!route) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
      return;
    }
    const status = route.status ?? 200;
    // /api/random 的 302 形态单独处理
    if (path === "/api/random" && !url.searchParams.has("format")) {
      res.writeHead(302, { location: "https://example.test/a.jpg" });
      res.end();
      return;
    }
    if (route.html) {
      res.writeHead(status, { "content-type": "text/html" });
      res.end("<!doctype html><html><body>edge function missing</body></html>");
      return;
    }
    const text = JSON.stringify(route.body);
    res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(text) });
    res.end(text);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  return { server, base: `http://127.0.0.1:${port}` };
}

const HEALTHY = {
  "/api/stats": { body: { totalRequests: 1, todayRequests: 1, lastRequestAt: null, totalImages: 1, totalSites: 1, dailyRequests: {}, tags: ["acg"] } },
  "/api/random": { body: { id: "img-1", url: "https://example.test/a.jpg", title: "A", tags: ["acg"] } },
  "/api/health": { body: { ok: true, runtime: "stub", buildId: "b1", timestamp: "2026-09-25T00:00:00.000Z", kv: { imagesBound: true, statsBound: true } } },
  "/api/list": { body: { items: [], page: 1, pageSize: 1, total: 0, totalPages: 1, hasPrevPage: false, hasNextPage: false } },
};

async function runScript(base: string): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await run(process.execPath, [resolve(process.cwd(), "scripts/check-api.mjs")], {
      env: { ...process.env, API_BASE_URL: base },
      timeout: 30_000,
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const e = error as { code?: number; stdout?: string; stderr?: string };
    return { code: typeof e.code === "number" ? e.code : 1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
}

describe("check:api · 真跑脚本，断言退出码（P182）", () => {
  it("全部接口正常时退出码为 0", async () => {
    const { server, base } = await startStub(HEALTHY);
    try {
      const r = await runScript(base);
      expect(r.code, `接口全正常却退出非零。stdout=${r.stdout.slice(-300)} stderr=${r.stderr.slice(-300)}`).toBe(0);
    } finally {
      server.close();
    }
  });

  it("某个读接口返回 500 时必须退出非零（修复前这里会假绿）", async () => {
    const { server, base } = await startStub({
      ...HEALTHY,
      // 关键：500 + application/json —— content-type 合法、body 不是 HTML，
      // 旧实现的三项检查（content-type / 非 HTML / 能 parse）全部通过。
      "/api/stats": { status: 500, body: { error: "Internal Server Error" } },
    });
    try {
      const r = await runScript(base);
      expect(
        r.code,
        "500 的 JSON 响应被当成成功 —— 首页实时统计坏掉而体检报绿",
      ).not.toBe(0);
    } finally {
      server.close();
    }
  });

  it("接口返回 HTML（Functions 未命中）时退出非零", async () => {
    const { server, base } = await startStub({
      ...HEALTHY,
      "/api/list": { status: 200, body: null, html: true },
    });
    try {
      const r = await runScript(base);
      expect(r.code, "HTML 响应未被识别").not.toBe(0);
    } finally {
      server.close();
    }
  });

  it("random 缺 url 时退出非零（图库为空导致的 404 形状合法但不可用）", async () => {
    const { server, base } = await startStub({
      ...HEALTHY,
      "/api/random": { status: 404, body: { error: "No images available" } },
    });
    try {
      const r = await runScript(base);
      expect(r.code, "random 不可用却仍报成功").not.toBe(0);
    } finally {
      server.close();
    }
  });

  it("health.ok 为 false 时退出非零", async () => {
    const { server, base } = await startStub({
      ...HEALTHY,
      "/api/health": { body: { ok: false, runtime: "stub", buildId: "b1", timestamp: "2026-09-25T00:00:00.000Z", kv: { imagesBound: false, statsBound: false } } },
    });
    try {
      const r = await runScript(base);
      expect(r.code, "health.ok=false 未被识别").not.toBe(0);
    } finally {
      server.close();
    }
  });
});
