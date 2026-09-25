import { describe, expect, it } from "vitest";
import { batchPayloadBytes, buildBatchImagesPayload } from "@/lib/helpers";
import { MAX_JSON_BODY_BYTES } from "@/lib/constants";

/**
 * 批量导入的**体积**预检（P188）。
 *
 * 条数上限(MAX_BATCH_IMAGE_COUNT = 500) 与每条 URL 上限(MAX_IMAGE_URL_LENGTH = 2048)
 * 是乘法关系：500 条 2048 字符的 URL 序列化后约 1MB，是服务端请求体上限
 * (MAX_JSON_BODY_BYTES = 256KB) 的 ~4 倍 —— 两个各自合法的上限**没法同时满足**。
 *
 * 只查条数的前端会让用户按「最多 500 张」的提示贴满一屏长 URL，然后被服务端以
 * 体积超限拒掉（修复前报的还是「不是合法 JSON」，把人引向逐条检查 URL）。
 *
 * 这里钉住预检本身：它算的必须是**真正要发出去的那个 body** 的 UTF-8 字节数。
 */

const longUrl = (index: number, pad = 1900) =>
  `https://cdn.example.test/long/${index}.jpg?token=${"a".repeat(pad)}`;

describe("批量导入体积预检（P188）", () => {
  it("预检的字节数与实际发出的 body 完全一致（不是估算）", () => {
    const urls = [longUrl(0, 50), longUrl(1, 80)];
    const tagsRaw = "acg, 壁纸";

    // 复刻 batchCreateImages 实际发出的 body
    const actual = new TextEncoder().encode(
      JSON.stringify({ images: buildBatchImagesPayload(urls, tagsRaw) }),
    ).byteLength;

    expect(batchPayloadBytes(urls, tagsRaw)).toBe(actual);
  });

  it("500 条短 URL 在体积上限内（预检不能把正常批导入也拦掉）", () => {
    const urls = Array.from({ length: 500 }, (_, i) => `https://cdn.example.test/ok-${i}.jpg`);
    expect(batchPayloadBytes(urls, "acg")).toBeLessThanOrEqual(MAX_JSON_BODY_BYTES);
  });

  it("500 条长 URL 超体积上限（这正是原先静默失败的那批）", () => {
    const urls = Array.from({ length: 500 }, (_, i) => longUrl(i));
    // 每条 URL 都在 2048 上限内 —— 拒它的只能是体积，不是单条长度
    for (const url of urls) expect(url.length).toBeLessThanOrEqual(2048);
    expect(batchPayloadBytes(urls, "acg")).toBeGreaterThan(MAX_JSON_BODY_BYTES);
  });

  it("按字节而非字符计：中文 URL 的体量远大于同长度的 ASCII", () => {
    const ascii = ["https://a.test/" + "a".repeat(600)];
    const cjk = ["https://a.test/" + "图".repeat(600)];
    // 字符数相同，但 UTF-8 字节数不同 —— 只数字符会低估体量
    expect(ascii[0].length).toBe(cjk[0].length);
    expect(batchPayloadBytes(cjk, "acg")).toBeGreaterThan(batchPayloadBytes(ascii, "acg"));
  });
});
