import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * image-ratio 的容量上界与取值边界。
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
 * 取值边界同样要紧：这个缓存直接决定瀑布流的占位高度，写入脏值会让整列
 * 塌缩或撑开 —— 宽或高为 0 / NaN（图未解码、SVG 无固有尺寸）得到 0 或 NaN，
 * 1×2000 的细线得到 0.0005 的极端比例。所以「不 sane 就不记」是刻意的，
 * 不是防御性冗余。读取侧同理：localStorage 可能存着旧版本写入的脏数据
 * 或被人手改过，必须逐条校验而不是整体信任。
 */

const STORAGE_KEY = "paiii:image-ratios";

/** 最小可用的 window/localStorage 替身；writes 记录 setItem 真正被调用了几次 */
function stubBrowser(seed?: string) {
  const store = new Map<string, string>();
  if (seed !== undefined) store.set(STORAGE_KEY, seed);
  const writes = { count: 0 };
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        writes.count += 1;
        store.set(k, v);
      },
      removeItem: (k: string) => void store.delete(k),
    },
  });
  return { store, writes };
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
    const { store } = stubBrowser();
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
    const { store } = stubBrowser();
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

describe("rememberImageRatio · 脏尺寸不写缓存", () => {
  it("宽或高为 0 / 非数时不记录", async () => {
    stubBrowser();
    const mod = await freshModule();
    mod.rememberImageRatio("https://cdn.test/zero.jpg", 0, 900);
    mod.rememberImageRatio("https://cdn.test/zero2.jpg", 1600, 0);
    mod.rememberImageRatio("https://cdn.test/nan.jpg", Number.NaN, 900);
    for (const url of ["zero", "zero2", "nan"]) {
      expect(mod.getImageRatio(`https://cdn.test/${url}.jpg`), url).toBeUndefined();
    }
  });

  it("超出 [0.05, 20] 的极端比例不记录", async () => {
    stubBrowser();
    const mod = await freshModule();
    // 1×2000 的细线：比例 0.0005
    mod.rememberImageRatio("https://cdn.test/thin.jpg", 1, 2000);
    // 2000×1 的横条：比例 2000
    mod.rememberImageRatio("https://cdn.test/wide.jpg", 2000, 1);
    expect(mod.getImageRatio("https://cdn.test/thin.jpg")).toBeUndefined();
    expect(mod.getImageRatio("https://cdn.test/wide.jpg")).toBeUndefined();
  });

  it("合法比例被记住，并写入 localStorage", async () => {
    const { store } = stubBrowser();
    const mod = await freshModule();
    mod.rememberImageRatio("https://cdn.test/ok.jpg", 1600, 900);
    expect(mod.getImageRatio("https://cdn.test/ok.jpg")).toBeCloseTo(1600 / 900, 10);
    vi.runAllTimers();
    const persisted = JSON.parse(store.get(STORAGE_KEY) ?? "{}") as Record<string, number>;
    expect(persisted["https://cdn.test/ok.jpg"]).toBeCloseTo(1600 / 900, 10);
  });

  it("已有记录时不覆盖（同一 URL 只写一次盘）", async () => {
    const { writes } = stubBrowser();
    const mod = await freshModule();
    mod.rememberImageRatio("https://cdn.test/a.jpg", 1600, 900);
    vi.runAllTimers();
    const writesAfterFirst = writes.count;
    expect(writesAfterFirst, "第一次记录没有写盘").toBe(1);

    mod.rememberImageRatio("https://cdn.test/a.jpg", 900, 1600);
    vi.runAllTimers();
    expect(mod.getImageRatio("https://cdn.test/a.jpg")).toBeCloseTo(1600 / 900, 10);
    expect(writes.count, "重复记录触发了额外的写盘").toBe(writesAfterFirst);
  });
});

describe("hydrate · 存量数据逐条校验", () => {
  it("加载时读回合法比例", async () => {
    stubBrowser(JSON.stringify({ "https://cdn.test/a.jpg": 1.5 }));
    const mod = await freshModule();
    expect(mod.getImageRatio("https://cdn.test/a.jpg")).toBe(1.5);
  });

  it("损坏的 JSON 不影响模块可用（只是没有占位比例）", async () => {
    stubBrowser("{broken");
    const mod = await freshModule();
    expect(mod.getImageRatio("https://cdn.test/a.jpg")).toBeUndefined();
    // 仍能继续记录新值
    mod.rememberImageRatio("https://cdn.test/b.jpg", 1000, 1000);
    expect(mod.getImageRatio("https://cdn.test/b.jpg")).toBe(1);
  });

  it("非对象 / 数组形态的存量数据被忽略", async () => {
    for (const seed of ["null", "[1,2,3]", '"text"', "42"]) {
      stubBrowser(seed);
      const mod = await freshModule();
      expect(mod.getImageRatio("0"), `seed=${seed}`).toBeUndefined();
    }
  });

  it("逐条丢弃非数字与越界比例，保留合法的那些", async () => {
    stubBrowser(
      JSON.stringify({
        "https://cdn.test/ok.jpg": 1.75,
        "https://cdn.test/str.jpg": "1.5",
        "https://cdn.test/zero.jpg": 0,
        "https://cdn.test/huge.jpg": 100,
        "https://cdn.test/null.jpg": null,
      }),
    );
    const mod = await freshModule();
    expect(mod.getImageRatio("https://cdn.test/ok.jpg")).toBe(1.75);
    for (const name of ["str", "zero", "huge", "null"]) {
      expect(mod.getImageRatio(`https://cdn.test/${name}.jpg`), name).toBeUndefined();
    }
  });

  it("localStorage 不可用时模块仍可工作（隐私模式）", async () => {
    vi.stubGlobal("window", {
      get localStorage() {
        throw new Error("SecurityError");
      },
    });
    const mod = await freshModule();
    expect(mod.getImageRatio("https://cdn.test/a.jpg")).toBeUndefined();
    mod.rememberImageRatio("https://cdn.test/b.jpg", 1000, 1000);
    expect(mod.getImageRatio("https://cdn.test/b.jpg")).toBe(1);
    // 延迟持久化时同样不抛
    expect(() => vi.runAllTimers()).not.toThrow();
  });
});
