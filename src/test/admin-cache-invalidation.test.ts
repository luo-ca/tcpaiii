import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 后台增删改后的缓存作废清单，必须覆盖首页所有 5 分钟级 /api/list 缓存消费者。
 *
 * 背景：/admin 的 refreshGallery 在添加/编辑/删除成功后作废一批查询。它已经
 * 覆盖了 ['hero-image']（注释理由：「删图后 hero 可能指向已不存在的地址」），
 * 但同族的 ['gallery-preview']（首页「最新收录」8 张，同样缓存 /api/list 第一页、
 * staleTime 5 分钟）被漏掉了。全站 refetchOnWindowFocus 是关的，管理页与首页
 * 又互斥挂载 —— 于是删掉最新 8 张里的任何一张后：
 *   · 「最新收录」继续展示已删除的图（瓦片「加载失败」，点灯箱原图 404），
 *   · 新导入的图最长 5 分钟上不了榜，
 *   两个表现都与 hero-image 已修复的那个坑一模一样 —— 只是清单漏项。
 *
 * 契约：消费方（HeroSection / GalleryPreview）里的每个 5 分钟级 queryKey，
 * 都必须出现在 refreshGallery 的 invalidateQueries 清单里；两侧任何一侧改名，
 * 本测试都会红。
 */

const ADMIN = readFileSync(
  resolve(process.cwd(), "src/features/admin-page.tsx"),
  "utf8",
);
const HERO = readFileSync(
  resolve(process.cwd(), "src/components/sections/HeroSection.tsx"),
  "utf8",
);
const PREVIEW = readFileSync(
  resolve(process.cwd(), "src/components/sections/GalleryPreview.tsx"),
  "utf8",
);

/** 从 marker 处起做括号配平，取出完整的回调定义文本。 */
function extractCallback(source: string, marker: string): string {
  const start = source.indexOf(marker);
  if (start === -1) return "";
  let depth = 0;
  for (let i = source.indexOf("(", start); i < source.length; i++) {
    const ch = source[i];
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return "";
}

const REFRESH_BLOCK = extractCallback(
  ADMIN,
  "const refreshGallery = useCallback(",
);
const INVALIDATED_KEYS = [
  ...REFRESH_BLOCK.matchAll(/invalidateQueries\(\{\s*queryKey:\s*(\[[^\]]+\])/g),
].map((match) => match[1]);

describe("后台增删改 → 首页列表缓存作废清单", () => {
  it("refreshGallery 提取成功，且作废清单覆盖全部 5 个缓存族", () => {
    expect(REFRESH_BLOCK).not.toBe("");
    expect(INVALIDATED_KEYS).toEqual(
      expect.arrayContaining([
        "['images']",
        "['stats']",
        "['hero-image']",
        "['all-image-urls']",
        "['gallery-preview']",
      ]),
    );
  });

  it("消费方与作废清单两侧 key 拼写一致（任何一侧改名都会红）", () => {
    expect(HERO).toContain("queryKey: ['hero-image']");
    expect(PREVIEW).toContain("queryKey: ['gallery-preview']");
  });

  it("前提守卫：两个首页消费者仍是 5 分钟 staleTime（若改小/移除，本契约需重估）", () => {
    expect(HERO).toContain("staleTime: 5 * 60_000");
    expect(PREVIEW).toContain("staleTime: 5 * 60_000");
  });
});
