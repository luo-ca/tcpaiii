import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 图库头部计数不能是「首次请求的快照」（P173）。
 *
 * 头部（约 L193）与页脚（约 L359）说的是同一件事 —— 「共 N 张」：
 *   头部：{total}       ← 原为 imagesQuery.data.pages[0].total
 *   页脚：{images.length} ← 去重后实际渲染的瓦片数
 *
 * pages[0] 是**第一次请求**的快照。只要图库在浏览期间被改动（管理员导入或删除，
 * 与 P171 记录的是同一个竞态），后面的翻页会带回新的 total，而头部仍钉在旧值上，
 * 于是同一屏出现两个互相矛盾的计数。
 *
 * 用真实分页算术实测（pageSize 24，只要 hasNextPage 就继续翻）：
 *   增张 30 → 50：翻 3 页、渲染 50 张，头部却写「共 30 张」，页脚写「共 50 张」；
 *   增张 30 → 90：翻 4 页、渲染 90 张，头部却写「共 30 张」；
 *   全程不变 50：头部 50 —— 一致（没暴露问题的常见路径）。
 * 后果是用户对着 50 张瓦片读到「共 30 张」，同屏两个「共 N 张」自相矛盾，
 * 且没有任何报错或控制台信号 —— 只能靠测试钉住。
 *
 * 修法：取**最后一页**的 total（服务端最新一次算出的值），而不是第一页的快照。
 *
 * 已知残留（本测试不覆盖，勿误以为已解决）：图库**缩小**时（30 → 20）仍有偏差 ——
 * 客户端已缓存第 1 次请求的 24 张，服务端此刻只剩 20 张，头部取最新 total 得 20、
 * 瓦片仍是 24，多出的是第 1 次请求时缓存下来、之后被删除的 4 张。根因是客户端
 * 累积了「删除前」的页缓存（P171 的去重只挡重复、不挡过期），与头部取哪一页无关。
 */

const SOURCE = readFileSync(resolve(process.cwd(), "src/features/gallery-browse.tsx"), "utf8");

describe("图库头部计数 · 不得使用首次请求的快照", () => {
  it("total 取最后一页而不是 pages[0]", () => {
    const i = SOURCE.indexOf("const total =");
    expect(i, "找不到 total 的推导").toBeGreaterThan(-1);
    // 取窗口而不是单行：这条语句可能被 prettier 折成多行，锁单行会把格式化当缺陷
    const stmt = SOURCE.slice(i, i + 200);
    expect(
      stmt,
      "total 仍取 pages[0] 的快照：浏览期间图库被增删后，头部会与实际瓦片数矛盾",
    ).not.toMatch(/pages\[0\]/);
    expect(stmt, "total 应取最后一页的最新值").toMatch(
      /pages\[\s*[\w.]*\.length - 1\s*\]|\.at\(-1\)/,
    );
  });

  it("头部与页脚必须同源：都基于最新数据推导", () => {
    // 头部用 pages[0].total、页脚用 images.length —— 两者一旦取不同快照就会互相矛盾。
    // 这里钉住不存在「取第 0 页」的写法。
    expect(SOURCE, "存在 pages[0] 取数的写法，快照会过期").not.toMatch(/pages\[0\]\?\.total/);
  });

  it("用真实分页算术复现「增张」矛盾与「缩张」残留（防止被误当已解决）", () => {
    const PS = 24;
    const server = (total: number, pageParam: number) => {
      const totalPages = Math.max(1, Math.ceil(total / PS));
      const page = Math.min(pageParam, totalPages);
      const start = (page - 1) * PS;
      return {
        items: Array.from({ length: total }, (_, i) => `img-${i + 1}`).slice(start, start + PS),
        page,
        total,
        totalPages,
        hasNextPage: page < totalPages,
      };
    };
    const crawl = (totalAt: (n: number) => number) => {
      let pageParam = 1;
      const pages = [];
      for (let n = 1; n <= 50; n++) {
        const r = server(totalAt(n), pageParam);
        pages.push(r);
        if (!r.hasNextPage) break;
        pageParam = r.page + 1;
      }
      const seen = new Set<string>();
      const images = pages
        .flatMap((p) => p.items)
        .filter((x) => (seen.has(x) ? false : (seen.add(x), true)));
      return { tiles: images.length, latestTotal: pages[pages.length - 1].total };
    };

    // 增张：修好后头部（取最新 total）与实际瓦片数一致
    const grown = crawl((n) => (n >= 2 ? 50 : 30));
    expect(grown.tiles, "增张后渲染的瓦片数").toBe(50);
    expect(grown.latestTotal, "增张后最新 total 应与瓦片数一致").toBe(50);

    // 缩张：仍不一致 —— 这是已知残留，钉住它以免被当成已解决
    const shrunk = crawl((n) => (n >= 2 ? 20 : 30));
    expect(shrunk.tiles, "缩张后仍残留 4 张已删除的缓存图").toBe(24);
    expect(shrunk.latestTotal, "缩张时最新 total 是 20").toBe(20);
    expect(
      shrunk.tiles,
      "缩张方向未修：客户端累积了删除前的页缓存（P171 去重只挡重复、不挡过期）",
    ).not.toBe(shrunk.latestTotal);
  });
});
