import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * image-ratio 的容量上界。
 *
 * 这个模块给「服务端不返回宽高」的图库做 CLS 占位：图片 onLoad 时记下
 * naturalWidth/naturalHeight，下次渲染先用这个比例占好位。
 *
 * 它有两份存储：
 *   · 内存 Map `ratios` —— 渲染期查询用（语义上「本次会话见过多少张」）
 *   · localStorage      —— 跨访问复用
 *
 * 原实现里 MAX_ENTRIES(500) **只作用于写进 localStorage 的那一份**：
 *     const trimmed = entries.length > MAX_ENTRIES ? entries.slice(...) : entries;
 *     window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(trimmed)));
 * 内存那份从未裁剪 —— 而同一条注释写着「只保留最近 MAX_ENTRIES 条，避免无限增长」。
 * 于是长时间浏览（图库线上已 261 张且持续增长）后，内存 Map 会一路涨到
 * 「本次会话见过的图片总数」，没有上界；磁盘那份却是 500。两处不一致。
 *
 * 这里钉住「内存与磁盘同一口径」，并把注释承诺兑现。
 */

const STORAGE_KEY = "paiii:image-ratios";

/** 最小可用的 window/localStorage 替身 */
function stubBrowser() {
  const store = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  });
  return store;
}

async function freshModule() {
  vi.resetModules();
  return await import("@/lib/image-ratio");
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("image-ratio · 容量上界", () => {
  it("记住大量图片后，内存与 localStorage 都收敛到同一个上界", async () => {
    const store = stubBrowser();
    const mod = await freshModule();

    // 远超过上界（500）的数量
    const N = 1200;
    for (let i = 0; i < N; i++) {
      mod.rememberImageRatio(`https://cdn.test/img-${i}.jpg`, 1600, 900);
    }

    // 触发延迟持久化
    vi.runAllTimers();

    const raw = store.get(STORAGE_KEY);
    expect(raw, "没有写入 localStorage").toBeTruthy();
    const persisted = Object.keys(JSON.parse(raw!) as Record<string, number>).length;

    // 磁盘那份一直是 500；内存那份必须也是 500，否则两边口径不一致
    expect(persisted).toBeLessThanOrEqual(500);

    // 内存不能无界增长 —— 抽查总数应等于磁盘那份
    const keptCount = Array.from({ length: N }).filter(
      (_, i) => mod.getImageRatio(`https://cdn.test/img-${i}.jpg`) !== undefined,
    ).length;
    expect(
      keptCount,
      `内存保留了 ${keptCount} 条，localStorage 只存了 ${persisted} 条 —— 内存没有上界`,
    ).toBe(persisted);
  });

  it("裁剪时保留的是最近记录（防止把刚看过的图挤掉）", async () => {
    const store = stubBrowser();
    const mod = await freshModule();

    for (let i = 0; i < 700; i++) {
      mod.rememberImageRatio(`https://cdn.test/img-${i}.jpg`, 1600, 900);
    }
    vi.runAllTimers();

    // 最后一张一定还在
    expect(mod.getImageRatio("https://cdn.test/img-699.jpg")).toBeCloseTo(1600 / 900, 5);
    // 最早那张应已被裁掉
    expect(mod.getImageRatio("https://cdn.test/img-0.jpg")).toBeUndefined();

    const raw = store.get(STORAGE_KEY);
    expect(raw).toBeTruthy();
    expect(Object.keys(JSON.parse(raw!) as Record<string, number>).length).toBeLessThanOrEqual(500);
  });
});
