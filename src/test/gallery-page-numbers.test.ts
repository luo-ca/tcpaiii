import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchImagesPage } from "@/lib/api";

/**
 * fetchImagesPage 的数字字段也必须归一化（P127）。
 *
 * 之前四个数字字段只做了 `typeof === 'number'` 检查：
 *
 *   page:       typeof body?.page === 'number' ? body.page : params.page,
 *   pageSize:   typeof body?.pageSize === 'number' ? body.pageSize : params.pageSize,
 *   total:      typeof body?.total === 'number' ? body.total : items.length,
 *   totalPages: typeof body?.totalPages === 'number' ? body.totalPages : 1,
 *
 * `typeof NaN === 'number'`、`typeof 0 === 'number'`、负数与小数也全是 'number'，
 * 于是脏值一路进到 UI：
 *
 *   · totalPages 为 0 或负数 → 后台 `<Input max={totalPages}>` 的 max 非法，
 *     `goToPage` 的 clampNumber(1, 0) 得到 0，页码与「第 N / 0 页」自相矛盾；
 *   · totalPages 为小数 → getVisiblePages 的 Array.from({length: 2.5}) 得到
 *     两条页码（会截断成 2），越界判断与真实页数对不上；
 *   · page 为 NaN → imagesQuery.data.page !== page 恒真，后台无限 setPage；
 *   · total 为 NaN → 统计卡片显示「NaN 张」。
 *
 * 后端理论上不会这么返回，但 /api/list 的响应在边界处已被证明会漂
 * （见 gallery-response-shape / gallery-item-shape-guard 等测试），
 * 数字字段是同一批「只查 typeof」的漏网口子。
 */

const minimalImage = {
  id: "img-1",
  url: "https://cdn.example.test/a.jpg",
  title: "A",
  tags: ["x"],
  createdAt: "2026-01-01T00:00:00.000Z",
};

function stubFetchOnce(body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchImagesPage · 数字字段归一化（P127）", () => {
  it("totalPages 为 0/负数/小数时收成合法页数", async () => {
    for (const bad of [0, -1, 2.5, Number.NaN]) {
      stubFetchOnce({ items: [minimalImage], page: 1, pageSize: 24, total: 30, totalPages: bad });
      const page = await fetchImagesPage({ page: 1, pageSize: 24 });
      expect(
        Number.isInteger(page.totalPages) && page.totalPages >= 1,
        `totalPages=${String(bad)} 未被归一化：得到 ${page.totalPages}`,
      ).toBe(true);
    }
  });

  it("totalPages 至少 1（空库也不能是 0：UI 用 1 兜底页码）", async () => {
    stubFetchOnce({ items: [], page: 1, pageSize: 24, total: 0, totalPages: 0 });
    const page = await fetchImagesPage({ page: 1, pageSize: 24 });
    expect(page.totalPages).toBe(1);
  });

  it("page / pageSize 为脏值时回退到请求参数", async () => {
    // totalPages 给足，避免这条用例被页码夹取逻辑干扰（夹取单独测）
    stubFetchOnce({
      items: [minimalImage],
      page: Number.NaN,
      pageSize: -3,
      total: 100,
      totalPages: 10,
    });
    const page = await fetchImagesPage({ page: 4, pageSize: 48 });
    expect(page.page).toBe(4);
    expect(page.pageSize).toBe(48);
  });

  it("页码夹到 [1, totalPages]，与后端 normalizePositiveInt 同口径", async () => {
    stubFetchOnce({ items: [minimalImage], page: 999, pageSize: 24, total: 30, totalPages: 2 });
    const page = await fetchImagesPage({ page: 999, pageSize: 24 });
    expect(page.page).toBe(2);
  });

  it("total 为 NaN / 负数时不能漏给 UI", async () => {
    stubFetchOnce({ items: [minimalImage], page: 1, pageSize: 24, total: Number.NaN, totalPages: 1 });
    const page = await fetchImagesPage({ page: 1, pageSize: 24 });
    expect(Number.isFinite(page.total)).toBe(true);
    expect(page.total).toBeGreaterThanOrEqual(page.items.length);
  });
});