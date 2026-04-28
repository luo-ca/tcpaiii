import { beforeEach, describe, expect, it, vi } from "vitest";

import { getRecentStatsDateKeys, getStatsDateKey, handler } from "../../functions/index";

type Store = Record<string, Map<string, string>>;

const store: Store = {};
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

function requestWithEnv(path: string, init: RequestInit | undefined, env: Record<string, string>) {
  return handler.fetch(new Request(`https://example.test${path}`, init), env);
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
    for (const namespace of Object.keys(store)) {
      store[namespace].clear();
    }

    vi.stubGlobal("EdgeKV", MockEdgeKV);
    vi.stubGlobal("ADMIN_TOKEN", ADMIN_TOKEN);
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

  it("bootstraps admin tokens into KV when no runtime token exists", async () => {
    vi.stubGlobal("ADMIN_TOKEN", undefined);
    vi.stubGlobal("ADMIN_TOKEN_SHA256", undefined);

    const bootstrap = await request("/api/admin/bootstrap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "kv-secret" }),
    });

    expect(bootstrap.status).toBe(201);

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

    expect(store.stats.get("admin-config")).not.toContain("kv-secret");
  });

  it("does not allow admin bootstrap after KV admin config exists", async () => {
    vi.stubGlobal("ADMIN_TOKEN", undefined);
    vi.stubGlobal("ADMIN_TOKEN_SHA256", undefined);

    await request("/api/admin/bootstrap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "first-secret" }),
    });

    const response = await request("/api/admin/bootstrap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "second-secret" }),
    });

    expect(response.status).toBe(409);
  });

  it("marks JSON API responses as non-cacheable", async () => {
    const response = await request("/api/stats");

    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("CDN-Cache-Control")).toBe("no-store");
    expect(response.headers.get("Surrogate-Control")).toBe("no-store");
    expect(response.headers.get("Pragma")).toBe("no-cache");
    expect(response.headers.get("Expires")).toBe("0");
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
});
