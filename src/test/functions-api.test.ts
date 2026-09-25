import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getRecentStatsDateKeys, getStatsDateKey, handler, resetRuntimeCaches } from "../../edge-functions-src/api/[[default]]";
import { MAX_TRACKED_DAILY_KEYS } from "../../edge-functions-src/lib/types";
import { canonicalizeImageUrl } from "@/lib/helpers";

type Store = Record<string, Map<string, string>>;
type TestKv = {
  get(key: string): Promise<string | undefined>;
  put(key: string, value: string | ArrayBuffer | ReadableStream): Promise<void>;
  delete?: (key: string) => Promise<boolean>;
};

const store: Store = {};
/** 记录每次 KV put 的目标，用于断言「有没有发生写」 */
const putLog: string[] = [];
const ADMIN_TOKEN = "test-admin-token";

class MockEdgeKV {
  private namespace: string;

  constructor(options: { namespace: string }) {
    this.namespace = options.namespace;
    store[this.namespace] ??= new Map();
  }

  get(key: string) {
    return Promise.resolve(store[this.namespace].get(key));
  }

  put(key: string, value: string | ArrayBuffer | ReadableStream) {
    if (typeof value !== "string") {
      throw new Error("MockEdgeKV only supports string values");
    }

    putLog.push(`${this.namespace}:${key}`);
    store[this.namespace].set(key, value);
    return Promise.resolve();
  }

  delete(key: string) {
    return Promise.resolve(store[this.namespace].delete(key));
  }
}

function request(path: string, init?: RequestInit) {
  return handler.fetch(new Request(`https://example.test${path}`, init));
}

function requestWithEnv(path: string, init: RequestInit | undefined, env: Record<string, string | TestKv>) {
  return handler.fetch(new Request(`https://example.test${path}`, init), env);
}

function edgeOneKv(namespace: string, options: { delete?: boolean } = {}) {
  store[namespace] ??= new Map();

  const kv = {
    get(key: string) {
      return Promise.resolve(store[namespace].get(key));
    },
    put(key: string, value: string | ArrayBuffer | ReadableStream) {
      if (typeof value !== "string") {
        throw new Error("MockEdgeOneKV only supports string values");
      }

      store[namespace].set(key, value);
      return Promise.resolve();
    },
    ...(options.delete === false ? {} : {
      delete(key: string) {
        return Promise.resolve(store[namespace].delete(key));
      },
    }),
  };

  return kv;
}

function adminHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${ADMIN_TOKEN}`,
  };
}

async function json(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe("functions api", () => {
  beforeEach(() => {
    // 保证 images / stats 两个命名空间一定存在。
    // 只清空 Object.keys(store) 是不够的：store 初始是 {}，命名空间由
    // MockEdgeKV 构造时才惰性创建，于是「直接往 store.images 里塞数据」的
    // 用例在**单独运行**时会炸在 undefined.set 上（全量跑却因为前面的用例
    // 恰好建过该命名空间而通过）—— 这种「只有并发/全量跑才对」的测试
    // 既没法单独调试，失败信息也指向错的地方。
    putLog.length = 0;
    store.images ??= new Map();
    store.stats ??= new Map();
    for (const namespace of Object.keys(store)) {
      store[namespace].clear();
    }

    resetRuntimeCaches();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("EdgeKV", MockEdgeKV);
    vi.stubGlobal("ADMIN_TOKEN", ADMIN_TOKEN);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects malformed JSON bodies", async () => {
    const response = await request("/api/create", {
      method: "POST",
      headers: adminHeaders(),
      body: "{bad json",
    });

    expect(response.status).toBe(400);
    await expect(json(response)).resolves.toMatchObject({
      error: "Request body must be a valid JSON object",
    });
  });

  it("rejects empty request bodies", async () => {
    // 空体走的是 JSON.parse('') 抛 SyntaxError 这条分支（旧实现靠 !body 早退，
    // 重构成 readJsonBody 后这条路径换了形状）。结果必须仍是 400 + 格式文案：
    // "" 是**格式问题**，不是体积问题 —— 不能因为新加了 413 就把它归错类。
    const response = await request("/api/create", {
      method: "POST",
      headers: adminHeaders(),
      body: "",
    });

    expect(response.status).toBe(400);
    await expect(json(response)).resolves.toMatchObject({
      error: "Request body must be a valid JSON object",
    });
  });

  it("requires an admin token for write APIs", async () => {
    const response = await request("/api/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://cdn.example.test/blocked.jpg" }),
    });

    expect(response.status).toBe(401);
    await expect(json(response)).resolves.toMatchObject({
      error: "Admin token required",
    });
  });

  it("rejects invalid admin tokens for write APIs", async () => {
    const response = await request("/api/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer wrong-token",
      },
      body: JSON.stringify({ url: "https://cdn.example.test/blocked.jpg" }),
    });

    expect(response.status).toBe(403);
    await expect(json(response)).resolves.toMatchObject({
      error: "Invalid admin token",
    });
  });

  it("disables write APIs when no admin token is configured", async () => {
    vi.stubGlobal("ADMIN_TOKEN", undefined);
    vi.stubGlobal("ADMIN_TOKEN_SHA256", undefined);

    const response = await request("/api/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer any-token",
      },
      body: JSON.stringify({ url: "https://cdn.example.test/blocked.jpg" }),
    });

    expect(response.status).toBe(503);
    await expect(json(response)).resolves.toMatchObject({
      error: "Admin token is not configured",
    });
  });

  it("keeps read APIs public", async () => {
    const response = await request("/api/stats");

    expect(response.status).toBe(200);
  });

  it("exposes a health endpoint for deployment checks", async () => {
    vi.stubGlobal("EdgeKV", undefined);

    const response = await requestWithEnv("/api/health", undefined, {
      images_kv: edgeOneKv("health-images"),
      stats_kv: edgeOneKv("health-stats"),
    });

    expect(response.status).toBe(200);
    await expect(json(response)).resolves.toMatchObject({
      ok: true,
      runtime: "edgeone-pages",
      buildId: "edgeone-js-kv-safe-2026-04-29",
      kv: {
        imagesBound: true,
        statsBound: true,
      },
    });
  });

  it("does not expose internal error messages", async () => {
    vi.stubGlobal("EdgeKV", undefined);

    const response = await requestWithEnv("/api/list?page=1", undefined, {
      images_kv: {
        get() {
          throw new Error("sensitive kv failure");
        },
        put() {
          throw new Error("unused");
        },
      },
      stats_kv: edgeOneKv("safe-error-stats"),
    });

    expect(response.status).toBe(500);
    await expect(json(response)).resolves.toEqual({
      error: "Internal Server Error",
      buildId: "edgeone-js-kv-safe-2026-04-29",
    });
  });

  it("verifies admin tokens without mutating data", async () => {
    const response = await request("/api/admin/verify", {
      headers: {
        Authorization: `Bearer ${ADMIN_TOKEN}`,
      },
    });

    expect(response.status).toBe(200);
    await expect(json(response)).resolves.toMatchObject({
      ok: true,
    });
  });

  it("reads admin tokens from runtime env parameters", async () => {
    vi.stubGlobal("ADMIN_TOKEN", undefined);

    const response = await requestWithEnv("/api/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer runtime-secret",
      },
      body: JSON.stringify({ url: "https://cdn.example.test/runtime-env.jpg" }),
    }, {
      ADMIN_TOKEN: "runtime-secret",
    });

    expect(response.status).toBe(201);
  });

  it("uses EdgeOne Pages KV bindings from runtime env", async () => {
    vi.stubGlobal("EdgeKV", undefined);

    const env = {
      ADMIN_TOKEN,
      images_kv: edgeOneKv("edgeone-images"),
      stats_kv: edgeOneKv("edgeone-stats"),
    };

    const create = await requestWithEnv("/api/create", {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({ url: "https://cdn.example.test/edgeone-kv.jpg", tags: ["edgeone"] }),
    }, env);

    expect(create.status).toBe(201);
    expect(store["edgeone-images"].get("all")).toContain("edgeone-kv.jpg");

    const random = await requestWithEnv("/api/random?tag=edgeone&format=json", undefined, env);
    expect(random.status).toBe(200);
    await expect(json(random)).resolves.toMatchObject({
      url: "https://cdn.example.test/edgeone-kv.jpg",
    });
    expect(store["edgeone-stats"].get("data")).toContain("\"totalRequests\":1");
  });

  it("accepts EdgeOne KV bindings without a delete method", async () => {
    vi.stubGlobal("EdgeKV", undefined);

    const env = {
      ADMIN_TOKEN,
      images_kv: edgeOneKv("edgeone-images-no-delete", { delete: false }),
      stats_kv: edgeOneKv("edgeone-stats-no-delete", { delete: false }),
    };

    const create = await requestWithEnv("/api/create", {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({ url: "https://cdn.example.test/no-delete.jpg" }),
    }, env);

    expect(create.status).toBe(201);

    const list = await requestWithEnv("/api/list", undefined, env);
    expect(list.status).toBe(200);
    const listBody = await json(list);
    expect(Array.isArray(listBody)).toBe(true);
    expect(listBody).toHaveLength(1);
  });

  it("reads admin token hashes from KV without exposing the original token", async () => {
    vi.stubGlobal("ADMIN_TOKEN", undefined);
    vi.stubGlobal("ADMIN_TOKEN_SHA256", undefined);

    store.stats.set("admin_config", JSON.stringify({
      tokenSha256: "dad71b15942cd6eda584c5b3c4dfa25fa06ef7a0da8619ff9a6ec460c6121a8e",
      updatedAt: "2026-04-29T00:00:00.000Z",
    }));

    const verify = await request("/api/admin/verify", {
      headers: {
        Authorization: "Bearer kv-secret",
      },
    });

    expect(verify.status).toBe(200);
    await expect(json(verify)).resolves.toMatchObject({
      ok: true,
    });

    const wrong = await request("/api/admin/verify", {
      headers: {
        Authorization: "Bearer wrong-secret",
      },
    });

    expect(wrong.status).toBe(403);

    expect(store.stats.get("admin_config")).not.toContain("kv-secret");
  });

  it("does not expose a public admin bootstrap endpoint", async () => {
    vi.stubGlobal("ADMIN_TOKEN", undefined);
    vi.stubGlobal("ADMIN_TOKEN_SHA256", undefined);

    const response = await request("/api/admin/bootstrap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "kv-secret" }),
    });

    expect(response.status).toBe(404);
  });

  it("marks admin and error JSON responses as non-cacheable", async () => {
    const verify = await request("/api/admin/verify", {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });

    expect(verify.status).toBe(200);
    expect(verify.headers.get("Cache-Control")).toContain("no-store");
    expect(verify.headers.get("CDN-Cache-Control")).toBe("no-store");
    expect(verify.headers.get("Surrogate-Control")).toBe("no-store");
    expect(verify.headers.get("Pragma")).toBe("no-cache");
    expect(verify.headers.get("Expires")).toBe("0");

    const notFound = await request("/api/nope");
    expect(notFound.status).toBe(404);
    expect(notFound.headers.get("Cache-Control")).toContain("no-store");
  });

  it("serves stats and paginated lists with a short edge cache, legacy bare list without", async () => {
    const stats = await request("/api/stats");
    expect(stats.headers.get("Cache-Control")).toContain("s-maxage=10");
    expect(stats.headers.get("Cache-Control")).toContain("stale-while-revalidate=30");
    expect(stats.headers.get("CDN-Cache-Control")).toContain("s-maxage=10");
    expect(stats.headers.get("Surrogate-Control")).toBeNull();

    const page = await request("/api/list?page=1");
    expect(page.headers.get("Cache-Control")).toContain("s-maxage=10");

    const legacy = await request("/api/list");
    expect(legacy.headers.get("Cache-Control")).toContain("no-store");
  });

  it("throttles repeated admin auth failures per client ip", async () => {
    for (let index = 0; index < 20; index += 1) {
      const attempt = await request("/api/admin/verify", {
        headers: { Authorization: "Bearer wrong-token", "x-forwarded-for": "203.0.113.7" },
      });
      expect(attempt.status).toBe(403);
    }

    const blocked = await request("/api/admin/verify", {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}`, "x-forwarded-for": "203.0.113.7" },
    });
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThanOrEqual(1);

    const otherClient = await request("/api/admin/verify", {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}`, "x-forwarded-for": "198.51.100.4" },
    });
    expect(otherClient.status).toBe(200);
  });

  it("keeps stored meta aligned with the image list under concurrent writes", async () => {
    vi.stubGlobal("EdgeKV", undefined);
    const namespace = edgeOneKv("race-images");
    // 每个请求给 'all' / 'meta' 配不同的落库时延：未序列化时两把锁的
    // 完成顺序会交错，最终 'all' 与 'meta' 来自不同快照 → 计数错位
    const delays: Record<string, [number, number]> = {
      a: [25, 2],
      b: [5, 18],
      c: [20, 4],
      d: [2, 12],
    };
    const slowKv = {
      get: (key: string) => namespace.get(key),
      async put(key: string, value: string | ArrayBuffer | ReadableStream) {
        const text = typeof value === "string" ? value : "";
        const name = text.match(/race-([a-d])/)?.[1];
        const delay = name ? (delays[name]?.[key === "all" ? 0 : 1] ?? 1) : 1;
        await new Promise((resolve) => setTimeout(resolve, delay));
        return namespace.put(key, value);
      },
    };
    const env = { images_kv: slowKv, stats_kv: edgeOneKv("race-stats") };

    const results = await Promise.all(
      ["a", "b", "c", "d"].map((name) =>
        requestWithEnv("/api/create", {
          method: "POST",
          headers: adminHeaders(),
          body: JSON.stringify({
            url: `https://cdn.example.test/race-${name}.jpg`,
            title: `Race ${name}`,
            tags: [name],
          }),
        }, env),
      ),
    );
    expect(results.every((response) => response.status === 201)).toBe(true);

    const storedAll: Array<{ tags: string[] }> = JSON.parse((await namespace.get("all")) ?? "[]");
    const storedMeta = JSON.parse((await namespace.get("meta")) ?? "{}");
    expect(storedMeta.totalImages).toBe(storedAll.length);
    expect(storedMeta.tags).toEqual([...new Set(storedAll.flatMap((image) => image.tags))].sort());
  });

  it("keeps stats consistent under concurrent random requests (no lost updates)", async () => {
    // 与上面 images 的并发写测试同族：updateRequestStats 是「读快照 → 本地自增
    // → 写回」，读写之间让出控制权就会丢更新。/api/random 是热路径，并发必发生。
    vi.stubGlobal("EdgeKV", undefined);
    const namespace = edgeOneKv("stats-race-stats");
    // 真实 KV 的读发生在请求发出那一刻、响应稍后才回来：这里同步捕获快照、
    // 延迟 30ms 才解析。串行化缺失时，5 个并发 getStats 在首个 saveStats 落库前
    // 全部捕获同一份旧快照，各自 +1 互相覆盖 → 累计只剩 1，丢失 4 次累加。
    const racingStatsKv: TestKv = {
      get(key) {
        const snapshot = namespace.get(key);
        return new Promise<string | undefined>((resolve) => {
          setTimeout(() => resolve(snapshot), 30);
        });
      },
      put(key, value) {
        return namespace.put(key, value);
      },
    };
    const env = {
      ADMIN_TOKEN,
      images_kv: edgeOneKv("stats-race-images"),
      stats_kv: racingStatsKv,
    };

    const create = await requestWithEnv("/api/create", {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({ url: "https://cdn.example.test/stats-race.jpg", tags: ["stats-race"] }),
    }, env);
    expect(create.status).toBe(201);

    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        requestWithEnv("/api/random?tag=stats-race&format=json", undefined, env),
      ),
    );
    expect(responses.every((response) => response.status === 200)).toBe(true);

    const stats = await requestWithEnv("/api/stats", undefined, env);
    const body = await json(stats);
    expect(body.totalRequests).toBe(5);
    expect((body.dailyRequests as Record<string, number>)[getStatsDateKey()]).toBe(5);
  });

  it("热路径不保留无界的 dailyRequests 历史（与 sites 的 prune 对称）", async () => {
    // dailyRequests 每天新增一个键、只增不减：stats.ts 的写路径是
    // stats.dailyRequests[today] = (… ?? 0) + 1，读回（getStats）与写回
    // （saveStats）都不带窗口。而它被 /api/random —— 全站热路径 —— 每个请求
    // 全量 JSON.stringify 重写一次。sites 有 pruneSites 钉在 MAX_TRACKED_SITES，
    // dailyRequests 没有任何等价收口，于是 value 随运行天数线性长（粗估 10 年 ~68KB）。
    // /api/stats 的响应确实只回最近 7 天，但**存储**里的历史是全量。
    const oldKeys: Record<string, number> = {};
    for (let back = 400; back >= 1; back--) {
      const day = new Date();
      day.setUTCDate(day.getUTCDate() - back);
      oldKeys[getStatsDateKey(day)] = 1;
    }
    store.stats.set("data", JSON.stringify({
      totalRequests: 1,
      lastRequestAt: "2026-04-29T00:00:00.000Z",
      dailyRequests: oldKeys,
      sites: {},
    }));
    await request("/api/create", {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({ url: "https://cdn.example.test/prune-daily.jpg", tags: ["prune"] }),
    });

    // 触发一次热路径写（随机接口本身就会 updateRequestStats）
    const random = await request("/api/random?tag=prune&format=json");
    expect(random.status).toBe(200);

    const stored = JSON.parse(store.stats.get("data") ?? "{}");
    const kept = Object.keys(stored.dailyRequests as Record<string, number>);
    // +1：本次热路径刚写入的「今天」那个键不在被裁剪的旧键里
    expect(
      kept.length,
      `dailyRequests 保留了 ${kept.length} 天历史（上限 ${MAX_TRACKED_DAILY_KEYS}，超期旧键未清理）`,
    ).toBeLessThanOrEqual(MAX_TRACKED_DAILY_KEYS + 1);
    // 最近的时间窗必须还在：裁剪只能丢「最旧」的键，不能把排障要用的近期数据也削掉
    const recent = new Date();
    recent.setUTCDate(recent.getUTCDate() - 5);
    expect(kept).toContain(getStatsDateKey(recent));
    expect(kept).toContain(getStatsDateKey());
  });

  it("keeps gallery writes consistent under concurrent create requests (no lost updates)", async () => {
    // 与上面 stats 的并发读改写同族：/api/create 是「读全量 → 追加一条 → 写回」，
    // P38 只把两次 put 排了队，但读与写之间仍让出控制权。多个管理员/多次并发导入
    // 各自读到同一份旧快照、各自追加后互相覆盖，图库静默丢条目（比 stats 更致命）。
    vi.stubGlobal("EdgeKV", undefined);
    const namespace = edgeOneKv("create-race-images");
    // 真实 KV 的读在请求发出即捕获快照、延迟 30ms 才返回。未把整段 RMW 串行化时，
    // 5 个并发 create 在首个写落库前全部读到空库快照，各自追加 1 条互相覆盖 →
    // 最终只剩 1 条，丢失其余 4 条。
    const racingImagesKv: TestKv = {
      get(key) {
        const snapshot = namespace.get(key);
        return new Promise<string | undefined>((resolve) => {
          setTimeout(() => resolve(snapshot), 30);
        });
      },
      put(key, value) {
        return namespace.put(key, value);
      },
    };
    const env = {
      ADMIN_TOKEN,
      images_kv: racingImagesKv,
      stats_kv: edgeOneKv("create-race-stats"),
    };

    const created = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        requestWithEnv(
          "/api/create",
          {
            method: "POST",
            headers: adminHeaders(),
            body: JSON.stringify({
              url: `https://cdn.example.test/create-race-${index}.jpg`,
              title: `Race ${index}`,
              tags: ["create-race"],
            }),
          },
          env,
        ),
      ),
    );
    expect(created.every((response) => response.status === 201)).toBe(true);

    const stored = JSON.parse((await namespace.get("all")) ?? "[]") as Array<{ url: string }>;
    expect(stored).toHaveLength(5);
    expect(new Set(stored.map((image) => image.url)).size).toBe(5);
  });

  it("rejects image URLs beyond the 2048-char storage cap", async () => {
    const longUrl = `https://cdn.example.test/${"z".repeat(2100)}.jpg`;

    const create = await request("/api/create", {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({ url: longUrl }),
    });
    expect(create.status).toBe(400);
    await expect(json(create)).resolves.toMatchObject({
      error: "url must be a valid http(s) URL",
    });

    const batch = await request("/api/batch", {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({
        images: [{ url: longUrl }, { url: "https://cdn.example.test/short.jpg" }],
      }),
    });
    expect(batch.status).toBe(201);
    const batchBody = await json(batch);
    const results = batchBody.results as Array<Record<string, unknown>>;
    expect(results[0]).toMatchObject({ success: false, error: "URL must be a valid http(s) URL" });
    expect(results[1]).toMatchObject({ success: true });
  });

  it("truncates the echoed tag in random 404 responses", async () => {
    await request("/api/create", {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({ url: "https://cdn.example.test/echo.jpg", tags: ["echo"] }),
    });

    const response = await request(`/api/random?tag=${"x".repeat(300)}&format=json`);
    expect(response.status).toBe(404);
    const body = await json(response);
    expect(String(body.error).length).toBeLessThanOrEqual("No images found with tag: ".length + 40);
  });

  it("truncates random tags to the storage cap before the index lookup", async () => {
    const cappedTag = "a".repeat(40);
    await request("/api/create", {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({ url: "https://cdn.example.test/cap.jpg", tags: [cappedTag] }),
    });

    // 超出 40 字的部分在查索引前就被截掉：前 40 字与库内标签全等 → 命中，
    // 与 /api/list 的 tag 截断规则保持同一契约
    const response = await request(`/api/random?tag=${cappedTag}${"y".repeat(20)}&format=json`);
    expect(response.status).toBe(200);
    const body = await json(response);
    expect(body).toMatchObject({ url: "https://cdn.example.test/cap.jpg" });
  });

  it("marks random redirects as non-cacheable", async () => {
    await request("/api/create", {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({ url: "https://cdn.example.test/no-cache.jpg", tags: ["cache"] }),
    });

    const response = await request("/api/random?tag=cache");

    expect(response.status).toBe(302);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("CDN-Cache-Control")).toBe("no-store");
    expect(response.headers.get("Surrogate-Control")).toBe("no-store");
    expect(response.headers.get("Pragma")).toBe("no-cache");
    expect(response.headers.get("Expires")).toBe("0");
  });

  it("rejects non-http image URLs", async () => {
    const response = await request("/api/create", {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({ url: "javascript:alert(1)", title: "bad" }),
    });

    expect(response.status).toBe(400);
    await expect(json(response)).resolves.toMatchObject({
      error: "url must be a valid http(s) URL",
    });
  });

  it("rejects image URLs with embedded credentials", async () => {
    const response = await request("/api/create", {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({ url: "https://user:pass@cdn.example.test/private.jpg" }),
    });

    expect(response.status).toBe(400);
    await expect(json(response)).resolves.toMatchObject({
      error: "url must be a valid http(s) URL",
    });
  });

  it("rejects oversized JSON bodies before parsing（413 而非 400：体积不是格式问题）", async () => {
    // 这条原先断言 400 + 'Request body must be a valid JSON object'，
    // 但 body 就是 JSON.stringify 的输出 —— **本来就是合法 JSON**，
    // 那句话对这份输入是假的。超限的报文必须说「太大」，不能报成格式错误。
    const oversizedTitle = "x".repeat(256 * 1024);
    const body = JSON.stringify({
      url: "https://cdn.example.test/oversized.jpg",
      title: oversizedTitle,
    });
    // 前提：这份 body 确实是合法 JSON，拒它只能是因为体积
    expect(() => JSON.parse(body)).not.toThrow();

    const response = await request("/api/create", {
      method: "POST",
      headers: adminHeaders(),
      body,
    });

    expect(response.status).toBe(413);
    await expect(json(response)).resolves.toMatchObject({
      error: expect.stringContaining("exceeds"),
    });
  });

  it("normalizes title and deduplicates tags when creating images", async () => {
    const response = await request("/api/create", {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({
        url: " https://cdn.example.test/image.jpg ",
        title: "  风景图  ",
        tags: ["风景", " 自然 ", "风景", ""],
      }),
    });

    expect(response.status).toBe(201);
    await expect(json(response)).resolves.toMatchObject({
      url: "https://cdn.example.test/image.jpg",
      title: "风景图",
      tags: ["风景", "自然"],
    });
  });

  it("rejects invalid image ids on mutating routes", async () => {
    const update = await request("/api/update/bad%2Fid", {
      method: "PUT",
      headers: adminHeaders(),
      body: JSON.stringify({ title: "bad" }),
    });
    const remove = await request("/api/delete/%E0%A4%A", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });

    expect(update.status).toBe(400);
    await expect(json(update)).resolves.toMatchObject({
      error: "Invalid image id",
    });
    expect(remove.status).toBe(400);
    await expect(json(remove)).resolves.toMatchObject({
      error: "Invalid image id",
    });
  });

  it("rejects duplicate URLs on update while allowing the current image URL", async () => {
    const first = await request("/api/create", {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({ url: "https://cdn.example.test/a.jpg" }),
    });
    const second = await request("/api/create", {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({ url: "https://cdn.example.test/b.jpg" }),
    });

    const firstBody = await json(first);
    const secondBody = await json(second);

    const noChange = await request(`/api/update/${secondBody.id}`, {
      method: "PUT",
      headers: adminHeaders(),
      body: JSON.stringify({ url: "https://cdn.example.test/b.jpg", title: "same url" }),
    });
    expect(noChange.status).toBe(200);

    const duplicate = await request(`/api/update/${secondBody.id}`, {
      method: "PUT",
      headers: adminHeaders(),
      body: JSON.stringify({ url: firstBody.url }),
    });

    expect(duplicate.status).toBe(409);
    await expect(json(duplicate)).resolves.toMatchObject({
      error: "Image URL already exists",
    });
  });

  it("sorts stats tags for stable UI output", async () => {
    await request("/api/batch", {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({
        images: [
          { url: "https://cdn.example.test/a.jpg", tags: ["自然"] },
          { url: "https://cdn.example.test/b.jpg", tags: ["AI", "风景"] },
        ],
      }),
    });

    const response = await request("/api/stats");

    expect(response.status).toBe(200);
    await expect(json(response)).resolves.toMatchObject({
      totalImages: 2,
      tags: ["AI", "风景", "自然"],
    });
  });

  it("重复 id 的损坏数据不会让 /api/random 变成持续 500", async () => {
    // 正常路径下 id 由 crypto.randomUUID 生成，不会重复。
    // 但存储被手工改过 / 数据损坏时可能出现重复 id：此时若 exclude 恰好
    // 覆盖全部候选，pool 会过滤成空数组，pool[NaN] 是 undefined，
    // 紧接着的 selected.id 抛异常 -> 该 tag 永久 500。
    // 存储属于信任边界之外，这里必须自己兜住。
    const dup = {
      id: "img-duplicate",
      url: "https://cdn.example.test/dup.jpg",
      title: "重复 id",
      tags: ["broken"],
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    store.images.set("all", JSON.stringify([dup, { ...dup }]));

    // 不排除任何 id：正常返回
    const okRes = await request("/api/random?tag=broken&format=json");
    expect(okRes.status).toBe(200);

    // 排除掉这个（重复的）id：过滤后为空，必须回退而不是 500
    const res = await request("/api/random?tag=broken&format=json&exclude=img-duplicate");
    expect(res.status, "空池未兜底：selected 为 undefined 会抛异常").toBe(200);
    const body = (await json(res)) as { id: string };
    expect(body.id).toBe("img-duplicate");
  });

  it("serves stats from stored metadata without reading the full image list", async () => {
    store.images.set("meta", JSON.stringify({
      totalImages: 3,
      tags: ["beta", "alpha"],
      updatedAt: "2026-04-29T00:00:00.000Z",
    }));
    store.stats.set("data", JSON.stringify({
      totalRequests: 7,
      lastRequestAt: "2026-04-29T01:02:03.000Z",
      dailyRequests: {
        [getStatsDateKey()]: 4,
      },
      sites: {
        "example.test": 2,
      },
    }));

    const response = await request("/api/stats");

    expect(response.status).toBe(200);
    await expect(json(response)).resolves.toMatchObject({
      totalRequests: 7,
      totalImages: 3,
      totalSites: 1,
      tags: ["alpha", "beta"],
    });
  });

  it("读回存量 meta 时同样合并大小写变体（老数据不必等下一次写才修好）", async () => {
    // 修复只落在写入路径（buildImagesMeta）上还不够：KV 里已经存下的 meta
    // 仍带着修复前写进去的大小写变体。getImagesMeta 的 sanitize 是唯一的
    // 读回关卡，它若按原样去重，老数据就会一直吐重复 chip 直到图库被写一次。
    store.images.set("meta", JSON.stringify({
      totalImages: 3,
      tags: ["ACG", "acg", "壁纸"],
      updatedAt: "2026-04-29T00:00:00.000Z",
    }));

    const response = await request("/api/stats");

    expect(response.status).toBe(200);
    const stats = await json(response);
    const acgVariants = (stats.tags as string[]).filter((tag) => tag.toLowerCase() === "acg");
    expect(acgVariants, `存量 meta 的大小写变体未合并：${JSON.stringify(stats.tags)}`).toHaveLength(1);
    expect(stats.tags).toEqual(["ACG", "壁纸"]);
  });

  it("keeps legacy list responses as arrays when no pagination params are provided", async () => {
    await request("/api/create", {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({ url: "https://cdn.example.test/legacy-list.jpg", tags: ["list"] }),
    });

    const response = await request("/api/list");

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);
  });

  it("ignores malformed image records from KV", async () => {
    store.images.set("all", JSON.stringify([
      { id: "bad-url", url: "javascript:alert(1)", title: "bad", tags: ["x"] },
      { id: "bad-tags", url: "https://cdn.example.test/bad-tags.jpg", tags: "x" },
      { id: "valid", url: "https://cdn.example.test/valid.jpg", title: "valid", tags: ["ok"] },
    ]));

    const response = await request("/api/list?page=1&pageSize=10");

    expect(response.status).toBe(200);
    await expect(json(response)).resolves.toMatchObject({
      total: 1,
      items: [
        expect.objectContaining({
          id: "valid",
          url: "https://cdn.example.test/valid.jpg",
          tags: ["ok"],
        }),
      ],
    });
  });

  it("paginates list responses with search and tag filters", async () => {
    await request("/api/batch", {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({
        images: Array.from({ length: 5 }, (_, index) => ({
          url: `https://cdn.example.test/list-${index}.jpg`,
          title: index % 2 === 0 ? `ACG image ${index}` : `Other image ${index}`,
          tags: index % 2 === 0 ? ["acg"] : ["other"],
        })),
      }),
    });

    const response = await request("/api/list?page=2&pageSize=2&tag=acg&search=image");

    expect(response.status).toBe(200);
    await expect(json(response)).resolves.toMatchObject({
      page: 2,
      pageSize: 2,
      total: 3,
      totalPages: 2,
      hasPrevPage: true,
      hasNextPage: false,
      items: [
        expect.objectContaining({
          title: "ACG image 4",
          tags: ["acg"],
        }),
      ],
    });
  });

  it("clamps paginated list requests to the last page", async () => {
    await request("/api/batch", {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({
        images: Array.from({ length: 3 }, (_, index) => ({
          url: `https://cdn.example.test/clamped-${index}.jpg`,
          title: `Clamped image ${index}`,
        })),
      }),
    });

    const response = await request("/api/list?page=99&pageSize=2");

    expect(response.status).toBe(200);
    await expect(json(response)).resolves.toMatchObject({
      page: 2,
      pageSize: 2,
      total: 3,
      totalPages: 2,
      hasPrevPage: true,
      hasNextPage: false,
      items: [
        expect.objectContaining({
          title: "Clamped image 2",
        }),
      ],
    });
  });

  /**
   * 同一批里重复的 URL 只能入库一次。
   *
   * handleBatchCreateImages 在循环里每成功一条就把 url 加进 existingUrls，
   * 下一条重复时会被这句挡下（success:false / reason: duplicate）。
   * 这条不变式以前只有「读代码看得出来」，没有测试 —— 一旦有人把
   * existingUrls.add() 去掉（它看起来像是多余的，因为入参集合已经建好了），
   * 一次性粘贴两遍同一批地址就会把图库写成双份，而且没有任何测试会失败。
   */
  it("同一批内的重复 URL 只入库一次", async () => {
    const dup = "https://cdn.example.test/in-batch-dup.jpg";
    const response = await request("/api/batch", {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({
        images: [
          { url: dup, title: "首次", tags: ["dup"] },
          { url: dup, title: "第二次", tags: ["dup"] },
          { url: "https://cdn.example.test/in-batch-uniq.jpg", tags: ["dup"] },
        ],
      }),
    });

    expect(response.status).toBe(201);
    const body = (await json(response)) as { total: number; success: number; failed: number };
    expect(body.total).toBe(3);
    expect(body.success).toBe(2);
    expect(body.failed).toBe(1);

    // 列表接口核对：重复的那条只应存在一次
    const list = (await json(await request("/api/list?page=1&pageSize=100"))) as {
      items: Array<{ url: string }>;
    };
    const stored = list.items.filter((item) => item.url === dup);
    expect(stored, "同一批里的重复 URL 被写入了多次").toHaveLength(1);
  });

  it("全部失败的批量导入不写库（不做无谓的全量重写）", async () => {
    // handleBatchCreateImages 原先无条件 await saveAllImages(...)，
    // 而 saveAllImages 每次都是两次 KV put（all + meta）并重建整份 meta。
    // 全是非法 URL 时一条都不会入 images，却照样重写整个图库。
    // 对照 handleBatchUpdateImageTags —— 那边有 `if (successCount > 0)` 守卫。
    //
    // 注意：不能靠比较 store.images.get('all') 的前后「值」来判断有没有写 ——
    // 全失败时 payload 恰好不变（都是空的），两次 JSON.stringify 得到的是
    // 内容相同的字符串，toBe 照样通过，会给出「没写」的假结论。
    // 必须直接数 KV 的 put 次数。
    const response = await request("/api/batch", {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({
        images: ["not-a-url", "ftp://bad.example/x", "  "].map((url) => ({ url })),
      }),
    });

    expect(response.status).toBe(201);
    await expect(json(response)).resolves.toMatchObject({ total: 3, success: 0, failed: 3 });
    expect(putLog, "全部失败却仍然写了 KV").toEqual([]);
  });


  it("allows larger batch imports up to 500 images", async () => {
    const images = Array.from({ length: 51 }, (_, index) => ({
      url: `https://cdn.example.test/batch-${index}.jpg`,
      tags: ["batch"],
    }));

    const response = await request("/api/batch", {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({ images }),
    });

    expect(response.status).toBe(201);
    await expect(json(response)).resolves.toMatchObject({
      total: 51,
      success: 51,
      failed: 0,
    });
  });

  it("批请求超体积时回 413 并说明是体积问题，而不是报「不是合法 JSON」", async () => {
    // MAX_BATCH_SIZE(500) × MAX_IMAGE_URL_LENGTH(2048) 与 MAX_JSON_BODY_BYTES(256KB)
    // 之间有一条从未被守过的隐含约束：500 条 2048 字符的合法 URL 序列化后约 1MB，
    // 是请求体上限的近 4 倍 —— 两个各自合法的上限**没法同时满足**。
    // （要让它恒成立，cap 得提到 ~5.68MB：每个 URL 字符 2048 × UTF-8 最坏 4 字节。）
    //
    // 修复前 readJsonObject 超限返回 null，于是回 400
    // 'Request body must be a valid JSON object' —— 报文里没有「太大」这个信息，
    // translateServerError 也没有对应模式，英文原文直出。用户按提示逐条检查 URL，
    // 永远找不到问题，而且 500 还在客户端声明的上限之内。
    const longUrl = (index: number) =>
      `https://cdn.example.test/long/${index}.jpg?token=${"a".repeat(1900)}`;

    // 前提：这些 URL 本身都是合法且不超 2048 的（所以拒的原因只可能是体积）
    for (const url of [longUrl(0), longUrl(499)]) {
      expect(canonicalizeImageUrl(url), "用例前提：URL 必须合法且不超 2048").not.toBeNull();
    }

    const images = Array.from({ length: 500 }, (_, index) => ({
      url: longUrl(index),
      title: `图片 ${index + 1}`,
      tags: ["batch"],
    }));
    const body = JSON.stringify({ images });
    expect(new TextEncoder().encode(body).byteLength).toBeGreaterThan(256 * 1024);

    const response = await request("/api/batch", {
      method: "POST",
      headers: adminHeaders(),
      body,
    });

    // 413 而非 400：问题在体积不在格式
    expect(response.status).toBe(413);
    const errorBody = await json(response);
    expect(errorBody).toMatchObject({ error: expect.stringContaining("exceeds") });
    // 不能再是那句会把人带偏的「不是合法 JSON」
    expect(errorBody.error).not.toBe("Request body must be a valid JSON object");
  });

  it("客户端预检的字节数与服务端判的是同一件事（500 条短 URL 仍可导入）", async () => {
    // 体积上限不该把正常批导入也拦掉：短 URL 时 500 条完全装得下。
    // 这条同时钉住「条数上限本身仍然有效」——预检放宽不能顺手把 500 也废掉。
    const images = Array.from({ length: 500 }, (_, index) => ({
      url: `https://cdn.example.test/ok-${index}.jpg`,
      tags: ["batch"],
    }));
    const body = JSON.stringify({ images });
    expect(new TextEncoder().encode(body).byteLength).toBeLessThan(256 * 1024);

    const response = await request("/api/batch", {
      method: "POST",
      headers: adminHeaders(),
      body,
    });

    expect(response.status).toBe(201);
    await expect(json(response)).resolves.toMatchObject({ total: 500, success: 500, failed: 0 });
  });

  it("rejects batch imports above 500 images", async () => {
    const images = Array.from({ length: 501 }, (_, index) => ({
      url: `https://cdn.example.test/too-many-${index}.jpg`,
      tags: ["batch"],
    }));

    const response = await request("/api/batch", {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({ images }),
    });

    expect(response.status).toBe(400);
    await expect(json(response)).resolves.toMatchObject({
      error: "Maximum 500 images per batch request",
    });
  });

  it("applies add/remove tags across many images in one batch-update", async () => {
    const created = await Promise.all([
      request("/api/create", {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({ url: "https://cdn.example.test/bu-a.jpg", tags: ["旧"] }),
      }),
      request("/api/create", {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({ url: "https://cdn.example.test/bu-b.jpg", tags: ["旧"] }),
      }),
      request("/api/create", {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({ url: "https://cdn.example.test/bu-c.jpg", tags: ["保留"] }),
      }),
    ]);
    const ids = await Promise.all(created.map(async (response) => (await json(response)).id as string));

    const response = await request("/api/batch-update", {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({ ids: ids.slice(0, 2), addTags: ["新标签"], removeTags: ["旧"] }),
    });
    expect(response.status).toBe(200);
    await expect(json(response)).resolves.toMatchObject({ total: 2, success: 2, failed: 0 });

    const stored = await request("/api/list");
    const images = (await stored.json()) as Array<{ id: string; tags: string[] }>;
    const byId = new Map(images.map((image) => [image.id, image.tags]));
    expect(byId.get(ids[0])).toEqual(["新标签"]);
    expect(byId.get(ids[1])).toEqual(["新标签"]);
    expect(byId.get(ids[2])).toEqual(["保留"]);

    // meta 标签索引必须由 saveAllImages 一并重建：旧标签全库消失、新标签登场
    const stats = await json(await request("/api/stats"));
    expect(stats.tags).toContain("新标签");
    expect(stats.tags).toContain("保留");
    expect(stats.tags).not.toContain("旧");
  });

  it("stats tags 对大小写变体只留一个（与 byTag 桶、筛选结果集一一对应）", async () => {
    // 标签检索全站是大小写不敏感的（见下一条用例）：byTag 按 toLowerCase 建桶，
    // 所以 "ACG"/"acg"/"Acg" 是**同一个**筛选结果集。若 sortedTags 按原样去重，
    // 筛选条会多出几张 chip，点下去命中的却是同一批图 —— 用户以为它们是不同标签。
    for (const [url, tags] of [
      ["https://cdn.example.test/case-a.jpg", ["ACG", "壁纸"]],
      ["https://cdn.example.test/case-b.jpg", ["acg"]],
      ["https://cdn.example.test/case-c.jpg", ["Acg", "插画"]],
    ] as Array<[string, string[]]>) {
      const response = await request("/api/create", {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({ url, tags }),
      });
      expect(response.status).toBe(201);
    }

    const stats = await json(await request("/api/stats"));
    const tags = stats.tags as string[];

    // 三个大小写变体只能留下一个（保留首次出现的原样写法）
    const acgVariants = tags.filter((tag) => tag.toLowerCase() === "acg");
    expect(acgVariants, `大小写变体未合并：${JSON.stringify(tags)}`).toHaveLength(1);
    expect(acgVariants[0]).toBe("ACG");

    // 其它标签不受影响
    expect(tags).toContain("壁纸");
    expect(tags).toContain("插画");
    expect(tags).toHaveLength(3);
  });

  it("removes tags case-insensitively and stays idempotent on repeated ids", async () => {
    const created = await json(
      await request("/api/create", {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({ url: "https://cdn.example.test/bu-case.jpg", tags: ["ACG"] }),
      }),
    );
    const id = created.id as string;

    // 检索全站大小写不敏感，移除若区分大小写就删不掉存储里的「ACG」；
    // 同一 id 出现两次也应幂等（第二次在已合并结果上再合并，落库仍是单条）
    const response = await request("/api/batch-update", {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({ ids: [id, id], removeTags: ["acg"] }),
    });
    expect(response.status).toBe(200);
    const body = await json(response);
    expect(body).toMatchObject({ total: 2, success: 2, failed: 0 });

    const stored = await request("/api/list");
    const images = (await stored.json()) as Array<{ id: string; tags: string[] }>;
    expect(images.find((image) => image.id === id)?.tags).toEqual([]);
  });

  it("does not rewrite the gallery when no requested image matched", async () => {
    const created = await json(
      await request("/api/create", {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({ url: "https://cdn.example.test/bu-intact.jpg", tags: ["keep"] }),
      }),
    );

    const response = await request("/api/batch-update", {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({ ids: ["img-does-not-exist", "非法 id!"], addTags: ["x"] }),
    });
    expect(response.status).toBe(200);
    const body = await json(response);
    expect(body).toMatchObject({ total: 2, success: 0, failed: 2 });

    const stored = await request("/api/list");
    const images = (await stored.json()) as Array<{ id: string; tags: string[] }>;
    expect(images).toHaveLength(1);
    // 用 create 返回的 id 断言，而不是「images[0]」这种位置假设 ——
    // 顺带把原先声明了却没使用的 created 用起来（tsc 一直在报 TS6133）。
    expect(images[0].id).toBe((created as { id: string }).id);
    expect(images[0].tags).toEqual(["keep"]);
    expect((await json(await request("/api/stats"))).tags).toEqual(["keep"]);
  });

  it("validates batch-update payloads and requires admin auth", async () => {
    await expect(
      request("/api/batch-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: ["img-1"], addTags: ["a"] }),
      }),
    ).resolves.toMatchObject({ status: 401 });

    const invalid = [
      { body: {}, error: "ids array is required and must not be empty" },
      { body: { ids: [] }, error: "ids array is required and must not be empty" },
      { body: { ids: ["img-1"] }, error: "addTags or removeTags must contain at least one tag" },
      { body: { ids: ["img-1"], addTags: "a" }, error: "addTags/removeTags must be arrays of strings" },
      { body: { ids: Array.from({ length: 501 }, (_, i) => `img-${i}`), addTags: ["a"] }, error: "Maximum 500 images per batch request" },
    ];
    for (const { body, error } of invalid) {
      const response = await request("/api/batch-update", {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(400);
      await expect(json(response)).resolves.toMatchObject({ error });
    }
  });

  it("redirects random image requests by default", async () => {
    await request("/api/create", {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({ url: "https://cdn.example.test/random.jpg", tags: ["风景"] }),
    });

    const response = await request("/api/random?tag=风景");

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("https://cdn.example.test/random.jpg");
  });

  it("returns JSON only when explicitly requested", async () => {
    await request("/api/create", {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({ url: "https://cdn.example.test/json.jpg", title: "JSON image", tags: ["acg"] }),
    });

    const response = await request("/api/random?tag=acg&format=json");

    expect(response.status).toBe(200);
    await expect(json(response)).resolves.toMatchObject({
      url: "https://cdn.example.test/json.jpg",
      title: "JSON image",
      tags: ["acg"],
    });
  });

  it("honors exclude on random requests when other candidates remain", async () => {
    const first = await request("/api/create", {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({ url: "https://cdn.example.test/exclude-a.jpg", tags: ["exclude"] }),
    });
    await request("/api/create", {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({ url: "https://cdn.example.test/exclude-b.jpg", tags: ["exclude"] }),
    });
    const firstId = (await json(first)).id as string;

    // 候选池里有两张图，排除其一后另一张就是唯一解 —— 与 Math.random 无关，结果确定
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await request(`/api/random?tag=exclude&exclude=${firstId}&format=json`);
      expect(response.status).toBe(200);
      const body = await json(response);
      expect(body.id).not.toBe(firstId);
      expect(body.url).toBe("https://cdn.example.test/exclude-b.jpg");
    }
  });

  it("still returns an image when exclude would empty the candidate pool", async () => {
    const created = await request("/api/create", {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({ url: "https://cdn.example.test/exclude-only.jpg", tags: ["only"] }),
    });
    const onlyId = (await json(created)).id as string;

    // 图库（或该标签下）只剩一张时，exclude 兜底失效仍返回它 ——
    // 调用方「跳过上一张」是愿望而不是硬约束，返回 404 会让站点随机当场报错
    const response = await request(`/api/random?tag=only&exclude=${onlyId}&format=json`);
    expect(response.status).toBe(200);
    await expect(json(response)).resolves.toMatchObject({ id: onlyId });

    const redirect = await request(`/api/random?exclude=${onlyId}`);
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get("Location")).toBe("https://cdn.example.test/exclude-only.jpg");
  });

  it("increments total and daily stats when random images are requested", async () => {
    await request("/api/create", {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({ url: "https://cdn.example.test/random.jpg", tags: ["风景"] }),
    });

    const first = await request("/api/random?type=风景&format=json");
    const second = await request("/api/random?tag=风景&format=json");
    const stats = await request("/api/stats");
    const statsBody = await json(stats);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(statsBody).toMatchObject({
      totalRequests: 2,
      todayRequests: 2,
    });
    expect(statsBody).toMatchObject({
      dailyRequests: expect.objectContaining({
        [getStatsDateKey()]: 2,
      }),
    });
  });

  it("tracks unique integration sites from random image request origins", async () => {
    await request("/api/create", {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({ url: "https://cdn.example.test/site-stats.jpg", tags: ["site"] }),
    });

    await request("/api/random?tag=site&format=json", {
      headers: { Origin: "https://example-a.test" },
    });
    await request("/api/random?tag=site&format=json", {
      headers: { Referer: "https://example-b.test/docs/page" },
    });
    await request("/api/random?tag=site&format=json", {
      headers: { Origin: "https://example-a.test" },
    });
    await request("/api/random?tag=site&format=json", {
      headers: { Origin: "data:text/plain,bad" },
    });

    const stats = await request("/api/stats");

    expect(stats.status).toBe(200);
    await expect(json(stats)).resolves.toMatchObject({
      totalRequests: 4,
      totalSites: 2,
    });
  });

  it("uses Asia/Shanghai date keys for daily stats", () => {
    expect(getStatsDateKey(new Date("2026-04-28T16:30:00.000Z"))).toBe("2026-04-29");
  });

  it("returns recent Asia/Shanghai stats date keys in ascending order", () => {
    expect(getRecentStatsDateKeys(3, new Date("2026-04-28T16:30:00.000Z"))).toEqual([
      "2026-04-27",
      "2026-04-28",
      "2026-04-29",
    ]);
  });

  it("still returns 302 when stats persistence fails on the hot path", async () => {
    vi.stubGlobal("EdgeKV", undefined);

    const imagesKv = edgeOneKv("hot-path-images");
    const workingStatsKv = edgeOneKv("hot-path-stats");
    const env = { ADMIN_TOKEN, images_kv: imagesKv, stats_kv: workingStatsKv };

    const create = await requestWithEnv("/api/create", {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({ url: "https://cdn.example.test/hot-path.jpg", tags: ["hot"] }),
    }, env);
    expect(create.status).toBe(201);

    const failingStatsKv = {
      get() {
        return Promise.resolve(undefined);
      },
      put() {
        return Promise.reject(new Error("stats KV down"));
      },
    };
    const failingEnv = { ADMIN_TOKEN, images_kv: imagesKv, stats_kv: failingStatsKv };

    const response = await requestWithEnv("/api/random?tag=hot", undefined, failingEnv);
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("https://cdn.example.test/hot-path.jpg");
  });

  it("does not block random responses on stats writes without waitUntil", async () => {
    vi.stubGlobal("EdgeKV", undefined);

    const imagesKv = edgeOneKv("bounded-images");
    const slowStatsKv: TestKv = {
      get() {
        return Promise.resolve(undefined);
      },
      put() {
        // 故意慢 5 秒：随机接口的热路径不应该等统计写入完成
        return new Promise<void>((resolve) => {
          setTimeout(resolve, 5000);
        });
      },
    };
    const env = { ADMIN_TOKEN, images_kv: imagesKv, stats_kv: slowStatsKv };

    const create = await requestWithEnv("/api/create", {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({ url: "https://cdn.example.test/bounded.jpg", tags: ["bounded"] }),
    }, env);
    expect(create.status).toBe(201);

    const startedAt = Date.now();
    const response = await requestWithEnv("/api/random?tag=bounded&format=json", undefined, env);
    const elapsedMs = Date.now() - startedAt;

    expect(response.status).toBe(200);
    // Bounded wait: slow stats KV must not stall the hot path for seconds.
    expect(elapsedMs).toBeLessThan(3000);
  });

  /**
   * 反映型输入的 XSS 纵深防御。
   *
   * /api/random 在找不到 tag 时会把调用方传入的 tag 原样写进错误文案：
   *   GET /api/random?tag=<script>alert(1)</script>
   *   -> {"error":"No images found with tag: <script>alert(1)</script>"}
   * 回显内容是**未转义**的。
   *
   * 靠 application/json 本身不足以自保：老浏览器可能对顶层导航做 MIME 嗅探，
   * 把这份 JSON 当 HTML 解析，回显的脚本就会执行（JSON hijacking 的同族问题）。
   * 关键防线是 X-Content-Type-Options: nosniff。
   *
   * 线上这份 nosniff 目前只来自 edgeone.json 的 /* 规则；函数自己此前并不设置它。
   * 一旦那条规则被改窄，这些接口会同时失去这层保护且无人察觉。
   * 所以函数现在自己声明，本测试钉住「无论走哪个分支都带上」。
   */
  describe('API 响应自带 nosniff（不依赖 CDN 规则）', () => {
    it('回显调用方输入的 404 响应带 nosniff', async () => {
      const response = await handler.fetch(
        new Request('https://example.test/api/random?tag=' + encodeURIComponent('<script>alert(1)</script>')),
      );
      expect(response.status).toBe(404);
      expect(response.headers.get('content-type')).toContain('application/json');
      expect(
        response.headers.get('x-content-type-options'),
        '反映型 JSON 缺少 nosniff：老浏览器可能把它当 HTML 解析',
      ).toBe('nosniff');
    });

    it('可缓存分支（/api/stats）同样带 nosniff', async () => {
      const response = await handler.fetch(new Request('https://example.test/api/stats'));
      expect(response.status).toBe(200);
      expect(
        response.headers.get('x-content-type-options'),
        '可缓存分支漏了 nosniff —— 这类遗漏最难被发现',
      ).toBe('nosniff');
    });
  });
describe("KV 基础设施故障（get 直接 reject）", () => {
    /**
     * 设计契约：KV 读失败必须**抛错**，由 dispatcher 统一兜底成 500。
     *
     * 反模式是「吞掉错误、返回空数组」—— 那会把基础设施故障伪装成业务空态：
     *   · /api/list 返回 200 + 空 items → 前端显示「图库还是空的」
     *   · /api/random 返回 404 no images available → 调用方以为图库真没图
     * 调用方无法区分「服务故障」与「确实没有数据」，排查时会被误导。
     *
     * 当前实现（getImagesState 不 catch，直接冒泡）是**有意的**：
     * 让 dispatcher 的 catch 统一返回 500 Internal Server Error，
     * 语义上明确「这是服务端故障」。
     *
     * 这条测试此前不存在 —— 现有用例覆盖的是「数据损坏」（能读到但内容脏），
     * 而「KV 本身读不动」这条路径没有任何护栏。
     */
    function failingKv(namespace: string) {
      return {
        get() {
          return Promise.reject(new Error(`KV ${namespace} unavailable`));
        },
        put() {
          return Promise.reject(new Error(`KV ${namespace} unavailable`));
        },
        delete() {
          return Promise.reject(new Error(`KV ${namespace} unavailable`));
        },
      };
    }

    it("/api/list 在 KV 读失败时返回 500，而不是伪装成空图库", async () => {
      const response = await requestWithEnv("/api/list?page=1&pageSize=24", undefined, {
        images_kv: failingKv("images"),
        stats_kv: failingKv("stats"),
      });
      expect(response.status, "KV 故障被伪装成了成功响应").toBe(500);
      const body = await json(response);
      expect(body.error).toBe("Internal Server Error");
      // 关键：不能返回 200 + 空列表（那会被前端当成「图库是空的」）
      expect(body, "不该返回空 items 让前端误判为空库").not.toHaveProperty("items");
    });

    it("/api/random 在 KV 读失败时返回 500，而不是 404 无图", async () => {
      const response = await requestWithEnv("/api/random", undefined, {
        images_kv: failingKv("images"),
        stats_kv: failingKv("stats"),
      });
      expect(
        response.status,
        "404 会让调用方以为「图库确实没图」，掩盖 KV 故障",
      ).toBe(500);
    });

    it("/api/stats 在 KV 读失败时返回 500（不返回全 0 的假统计）", async () => {
      const response = await requestWithEnv("/api/stats", undefined, {
        images_kv: failingKv("images"),
        stats_kv: failingKv("stats"),
      });
      expect(response.status, "返回全 0 统计会让用户以为站点没有流量").toBe(500);
    });

    it("500 响应带 buildId，便于线上定位是哪个版本", async () => {
      const response = await requestWithEnv("/api/list?page=1", undefined, {
        images_kv: failingKv("images"),
        stats_kv: failingKv("stats"),
      });
      const body = await json(response);
      expect(typeof body.buildId, "缺 buildId 会让线上故障无法对版本").toBe("string");
      expect(String(body.buildId).length).toBeGreaterThan(0);
    });
  });
describe("写 KV 部分失败（第 1 次 put 成功、第 2 次失败）", () => {
    /**
     * saveAllImages 是**两次** put：
     *   await kv.put('all',  JSON.stringify(snapshot));
     *   await kv.put('meta', JSON.stringify(buildImagesMeta(snapshot)));
     *
     * 两次之间没有事务。若第 1 次成功、第 2 次失败：
     *   · KV 的 'all' 已是新数据（图真的加进去了）
     *   · KV 的 'meta' 仍是旧的（totalImages 少 1、缺新标签）
     *   · 调用方收到错误 → 管理员看到「添加失败」，但图其实已入库
     *
     * 更麻烦的是：旧 meta **形状完全合法**，sanitizeImagesMeta 会接受它，
     * 于是 /api/stats 长期返回过期的 totalImages 与 tags，
     * 直到下一次成功写入才自愈。
     *
     * 本测试钉住修复后的契约：第 2 次 put 失败时要**回滚第 1 次**（或至少
     * 让 meta 不残留过期数据），保证 'all' 与 'meta' 始终互相一致。
     */
    function kvFailingSecondPut(namespace: string, failKey: string) {
      let putCount = 0;
      return {
        get(key: string) {
          return Promise.resolve(store[namespace]?.get(key));
        },
        put(key: string, value: string) {
          putCount += 1;
          // 命中目标 key 就失败（模拟第二次 put 挂掉）
          if (key === failKey) {
            return Promise.reject(new Error(`KV put failed for ${key}`));
          }
          store[namespace] ??= new Map();
          store[namespace].set(key, value);
          return Promise.resolve();
        },
        delete(key: string) {
          return Promise.resolve(store[namespace]?.delete(key) ?? false);
        },
      };
    }

    it("meta 写失败时不留下与 all 不一致的过期 meta", async () => {
      // 先准备一份「旧图库」与旧 meta
      store.images = new Map([
        ["all", JSON.stringify([{ id: "img-old", url: "https://x.test/old.jpg", title: "旧图", tags: ["风景"], createdAt: "2026-01-01T00:00:00.000Z" }])],
        ["meta", JSON.stringify({ totalImages: 1, tags: ["风景"], updatedAt: "2026-01-01T00:00:00.000Z" })],
      ]);

      const env = {
        // 让 meta 的 put 失败
        images_kv: kvFailingSecondPut("images", "meta"),
        stats_kv: edgeOneKv("stats"),
      };

      // 尝试新增一张图：saveAllImages 会在第二次 put（meta）失败
      const response = await requestWithEnv(
        "/api/create",
        {
          method: "POST",
          headers: adminHeaders(),
          body: JSON.stringify({ url: "https://x.test/new.jpg", title: "新图", tags: ["新标签"] }),
        },
        env,
      );

      // 允许两种修复策略：整体失败（500）并回滚，或成功且两处一致。
      // 唯一不可接受的是：返回失败、但 all 已改而 meta 没改。
      const status = response.status;
      store.images ??= new Map();
      const allRaw = store.images.get("all");
      const metaRaw = store.images.get("meta");
      const allCount = allRaw ? JSON.parse(allRaw).length : 0;
      const metaCount = metaRaw ? JSON.parse(metaRaw).totalImages : -1;

      // 修复后的契约：meta 是**可重建的派生缓存**，写失败时清掉它，
      // 下次 getImagesMeta 会回退到 all 现场重建 —— 不再残留过期数字。
      // 不可接受的状态是「all=2 而 meta 仍是有值的 1」（旧实现在这里红）。
      expect(status).toBeGreaterThanOrEqual(500);
      expect(allCount, "all 已写入新数据（图确实入库了）").toBe(2);
      expect(
        metaCount,
        "meta 写失败后必须被清掉（-1 = 不存在），否则 stats 会长期读过期数字",
      ).toBe(-1);

      // 再验证自愈：下一次读 stats 时 meta 由 all 重建，数字正确
      resetRuntimeCaches();
      const statsRes = await requestWithEnv("/api/stats", undefined, env);
      const statsBody = await json(statsRes);
      expect(
        statsBody.totalImages,
        "meta 被清掉后 stats 必须从 all 重建出正确数量",
      ).toBe(2);
    });
  });
it("KV 没有 delete 方法时，meta 写失败也不会崩（可选链保护）", async () => {
      /**
       * P160 给 meta 写失败加了「删掉过期 meta」的自愈逻辑，用的是
       * `kv.delete?.(...)`。而 EdgeOne 的 KV 绑定**可能不提供 delete**
       * （已有用例 "accepts EdgeOne KV bindings without a delete method" 覆盖了成功路径）。
       *
       * 这里补的是组合场景：**没有 delete + meta 写失败**。
       * 若当初写成 `kv.delete(...)`，这条会抛 TypeError 掩盖原始的 put 错误，
       * 管理员看到的是「delete is not a function」而不是真正的写入失败原因。
       */
      store.images = new Map([
        ["all", JSON.stringify([{ id: "img-old", url: "https://x.test/old.jpg", title: "旧图", tags: ["风景"], createdAt: "2026-01-01T00:00:00.000Z" }])],
        ["meta", JSON.stringify({ totalImages: 1, tags: ["风景"], updatedAt: "2026-01-01T00:00:00.000Z" })],
      ]);

      const noDeleteKv = {
        get(key: string) {
          return Promise.resolve(store.images?.get(key));
        },
        put(key: string, value: string) {
          if (key === "meta") return Promise.reject(new Error("meta put failed"));
          store.images ??= new Map();
          store.images.set(key, value);
          return Promise.resolve();
        },
        // 刻意不提供 delete
      };

      const response = await requestWithEnv(
        "/api/create",
        {
          method: "POST",
          headers: adminHeaders(),
          body: JSON.stringify({ url: "https://x.test/new.jpg", title: "新图", tags: ["新标签"] }),
        },
        { images_kv: noDeleteKv, stats_kv: edgeOneKv("stats") },
      );

      // 关键：不能因为缺 delete 而崩出新错误类型；应是正常的 5xx 写入失败
      expect(response.status).toBeGreaterThanOrEqual(500);
      const body = await json(response);
      expect(
        String(body.error),
        "报错信息不该泄漏 delete is not a function 这类实现细节",
      ).toBe("Internal Server Error");
    });
});
