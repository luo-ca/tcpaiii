import { beforeEach, describe, expect, it, vi } from "vitest";

import { getRecentStatsDateKeys, getStatsDateKey, handler } from "../../functions/index";

type Store = Record<string, Map<string, string>>;

const store: Store = {};

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

async function json(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe("functions api", () => {
  beforeEach(() => {
    for (const namespace of Object.keys(store)) {
      store[namespace].clear();
    }

    vi.stubGlobal("EdgeKV", MockEdgeKV);
  });

  it("rejects malformed JSON bodies", async () => {
    const response = await request("/api/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{bad json",
    });

    expect(response.status).toBe(400);
    await expect(json(response)).resolves.toMatchObject({
      error: "Request body must be a valid JSON object",
    });
  });

  it("rejects non-http image URLs", async () => {
    const response = await request("/api/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
      headers: { "Content-Type": "application/json" },
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://cdn.example.test/a.jpg" }),
    });
    const second = await request("/api/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://cdn.example.test/b.jpg" }),
    });

    const firstBody = await json(first);
    const secondBody = await json(second);

    const noChange = await request(`/api/update/${secondBody.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://cdn.example.test/b.jpg", title: "same url" }),
    });
    expect(noChange.status).toBe(200);

    const duplicate = await request(`/api/update/${secondBody.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
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
      headers: { "Content-Type": "application/json" },
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

  it("allows larger batch imports up to 500 images", async () => {
    const images = Array.from({ length: 51 }, (_, index) => ({
      url: `https://cdn.example.test/batch-${index}.jpg`,
      tags: ["batch"],
    }));

    const response = await request("/api/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
      headers: { "Content-Type": "application/json" },
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://cdn.example.test/random.jpg", tags: ["风景"] }),
    });

    const response = await request("/api/random?tag=风景");

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("https://cdn.example.test/random.jpg");
  });

  it("returns JSON only when explicitly requested", async () => {
    await request("/api/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
      headers: { "Content-Type": "application/json" },
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
