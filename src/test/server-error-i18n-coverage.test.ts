import { afterEach, describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { apiRequest } from "@/lib/api-client";

/**
 * 服务端**全部**英文错误文案都必须有中文映射（P133）。
 *
 * SERVER_ERROR_ZH 是一张手工维护的表。以往每加一条服务端错误文案，都要靠人记得
 * 同步补映射 —— 漏掉就又是「中文界面里冒英文」（本类问题已出现过 4 次：
 * Invalid admin token / Method Not Allowed / Internal Server Error / 带标签 404）。
 *
 * 这条测试把「同步」变成可验证的：直接扫 edge-functions-src 里所有
 * `error: '...'` / `error: \`...\`` 字面量，逐个打一遍 apiRequest，
 * 断言返回文案不再含成句英文。新加服务端文案却忘了补映射时，这条会红。
 *
 * 例外：品牌/技术术语（如 URL、ID、JSON、TAG）保留在中文文案里是既有约定，
 * 因此断言的是「整体是否仍是英文句子」，而不是「不含任何拉丁字母」。
 */

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (p.endsWith(".ts")) acc.push(p);
  }
  return acc;
}

function collectServerMessages(): string[] {
  const found = new Set<string>();
  for (const file of walk("edge-functions-src")) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/error:\s*'([^']+)'/g)) found.add(m[1]);
    for (const m of src.matchAll(/error:\s*`([^`]+)`/g)) found.add(m[1]);
  }
  // 去掉明显不是文案的片段（多行拼接残留），并把模板占位符换成真实形态的值。
  // 占位符统一换成 "1" 而不是 "X"：服务端现有带占位符的模板都是
  // `${MAX_BATCH_SIZE}`（数字）与 `${tag}`（用户输入），换成 "X" 会让
  // /^maximum \d+ images per batch/i 这类数字型映射假性失配。
  return [...found]
    .map((s) => s.trim())
    .filter((s) => s && !s.includes("\n") && /^[A-Za-z]/.test(s))
    .map((s) => s.replace(/\$\{[^}]*\}/g, "1"));
}

function stubWindow() {
  vi.stubGlobal("window", {
    location: { origin: "https://t.example.test", pathname: "/admin", search: "", hash: "" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

async function messageFor(serverError: string): Promise<string> {
  stubWindow();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify({ error: serverError }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    ),
  );
  try {
    await apiRequest("/api/x", undefined, "操作失败");
    return "（未抛错）";
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

/** 判断一句文案是否「基本还是英文」：连续 3 个以上纯 ASCII 单词即视为英文句子 */
function looksEnglish(text: string): boolean {
  const stripped = text.replace(/\b(URL|ID|JSON|GET|POST|PUT|DELETE|API|KV|ESA|ADMIN_TOKEN)\b/g, "");
  return /(?:[A-Za-z][A-Za-z'’-]*\s+){2,}[A-Za-z][A-Za-z'’-]*/.test(stripped);
}

describe("服务端错误文案 · 全量中文化（P133）", () => {
  it("扫到的服务端文案不为空（防止扫描逻辑失效导致空跑）", () => {
    const msgs = collectServerMessages();
    expect(msgs.length).toBeGreaterThan(8);
  });

  it("每条都命中中文映射，不再漏英文句子", async () => {
    const msgs = collectServerMessages();
    const leaked: Array<{ server: string; shown: string }> = [];
    for (const server of msgs) {
      const shown = await messageFor(server);
      if (looksEnglish(shown)) leaked.push({ server, shown });
    }
    expect(leaked, "以下服务端文案没有中文映射：\n" + JSON.stringify(leaked, null, 2)).toEqual([]);
  });
});