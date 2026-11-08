import { describe, expect, it } from "vitest";

import {
  decodeRouteSegment,
  getRequestSite,
  isAscii,
  isJsonObject,
  isSha256Hex,
  isValidHostname,
  isValidImageId,
  isValidSiteKey,
  normalizePositiveInt,
  sortTags,
} from "../../edge-functions-src/lib/validation";
import { MAX_IMAGE_ID_LENGTH } from "../../edge-functions-src/lib/types";

/**
 * 边缘层的小型校验原语。
 *
 * 这些函数此前只有间接覆盖（经 functions-api.test.ts 的完整 HTTP 流程），
 * 各自的分支与边界没被直接钉住。它们决定「什么算合法 id / 主机名 / 来源站点」，
 * 写错的代价是静默的：要么放行脏数据入库，要么把正常请求判成非法。
 *
 * 断言全部从契约出发（RFC 形态、常量上限），不是从当前实现反推。
 */

describe("isValidImageId", () => {
  it("接受字母数字与 - _，长度 1..160", () => {
    expect(isValidImageId("img-1")).toBe(true);
    expect(isValidImageId("img_1")).toBe(true);
    expect(isValidImageId("a")).toBe(true);
    expect(isValidImageId("a".repeat(MAX_IMAGE_ID_LENGTH))).toBe(true);
  });

  it("超过长度上限、空串、含路径分隔符或空白一律拒绝", () => {
    expect(isValidImageId("a".repeat(MAX_IMAGE_ID_LENGTH + 1))).toBe(false);
    expect(isValidImageId("")).toBe(false);
    expect(isValidImageId("img/1")).toBe(false);
    expect(isValidImageId("img 1")).toBe(false);
    expect(isValidImageId("img.1")).toBe(false);
    expect(isValidImageId("中文")).toBe(false);
  });
});

describe("decodeRouteSegment", () => {
  it("解码百分号转义", () => {
    expect(decodeRouteSegment("a%2Fb")).toBe("a/b");
    expect(decodeRouteSegment("img-%E9%A3%8E")).toBe("img-风");
  });

  it("原样返回无需解码的片段", () => {
    expect(decodeRouteSegment("plain")).toBe("plain");
  });

  it("非法转义返回 null 而不是抛错（调用方据此回 400）", () => {
    expect(decodeRouteSegment("%E0%A4%A")).toBeNull();
    expect(decodeRouteSegment("%")).toBeNull();
  });
});

describe("isAscii", () => {
  it("只认 0x00-0x7F", () => {
    expect(isAscii("abc-123")).toBe(true);
    expect(isAscii("")).toBe(true);
    expect(isAscii("风景")).toBe(false);
    expect(isAscii("🎨")).toBe(false);
    expect(isAscii("aé")).toBe(false);
  });
});

describe("sortTags", () => {
  it("把 ASCII 标签排在非 ASCII 之前，组内按 zh-CN 排序", () => {
    expect(sortTags(["自然", "AI", "风景"])).toEqual(["AI", "风景", "自然"]);
    expect(sortTags(["风景", "acg", "壁纸"])).toEqual(["acg", "壁纸", "风景"]);
  });

  it("排序结果稳定且保留全部元素", () => {
    const input = ["壁纸", "zzz", "风景", "AAA", "acg"];
    const once = sortTags([...input]);
    const twice = sortTags([...input]);
    expect(once).toEqual(twice);
    expect([...once].sort()).toEqual([...input].sort());
  });
});

describe("isValidHostname", () => {
  it("接受常规域名、localhost 与 IPv4", () => {
    expect(isValidHostname("example.com")).toBe(true);
    expect(isValidHostname("EXAMPLE.COM")).toBe(true);
    expect(isValidHostname("a.b.c.example.co.uk")).toBe(true);
    expect(isValidHostname("localhost")).toBe(true);
    expect(isValidHostname("127.0.0.1")).toBe(true);
    expect(isValidHostname("255.255.255.255")).toBe(true);
  });

  it("拒绝空串、超长域名与非法标签", () => {
    expect(isValidHostname("")).toBe(false);
    expect(isValidHostname("a".repeat(64) + ".com")).toBe(false);
    expect(isValidHostname("a_b.com")).toBe(false);
    expect(isValidHostname("-a.com")).toBe(false);
    expect(isValidHostname("a-.com")).toBe(false);
    expect(isValidHostname("a..com")).toBe(false);
    expect(isValidHostname("a.com.")).toBe(false);
  });

  it("IPv4 形态的每一段都必须落在 0..255", () => {
    expect(isValidHostname("256.1.1.1")).toBe(false);
    expect(isValidHostname("1.2.3.999")).toBe(false);
    expect(isValidHostname("0.0.0.0")).toBe(true);
  });
});

describe("isValidSiteKey", () => {
  it("接受 hostname 与 hostname:port", () => {
    expect(isValidSiteKey("example.com")).toBe(true);
    expect(isValidSiteKey("example.com:443")).toBe(true);
    expect(isValidSiteKey("example.com:65535")).toBe(true);
    expect(isValidSiteKey("localhost:3000")).toBe(true);
  });

  it("端口必须落在 1..65535", () => {
    expect(isValidSiteKey("example.com:0")).toBe(false);
    expect(isValidSiteKey("example.com:65536")).toBe(false);
    expect(isValidSiteKey("example.com:")).toBe(false);
  });

  it("拒绝多段冒号与非法主机名", () => {
    expect(isValidSiteKey("example.com:80:90")).toBe(false);
    expect(isValidSiteKey(":80")).toBe(false);
    expect(isValidSiteKey("")).toBe(false);
    expect(isValidSiteKey("a_b.com:80")).toBe(false);
  });
});

describe("normalizePositiveInt", () => {
  it("合法正整数原样返回", () => {
    expect(normalizePositiveInt("12", 5)).toBe(12);
    expect(normalizePositiveInt("1", 5)).toBe(1);
  });

  it("缺失 / 非数字 / 0 / 负数一律回退到默认值", () => {
    for (const value of [null, "", "abc", "0", "-3", "-1"]) {
      expect(normalizePositiveInt(value, 5), `"${String(value)}" 未被回退`).toBe(5);
    }
  });

  it("超过上限时静默夹取（服务端用夹取而非报错）", () => {
    expect(normalizePositiveInt("999", 5, 60)).toBe(60);
    expect(normalizePositiveInt("60", 5, 60)).toBe(60);
  });

  it("尾部非数字按 parseInt 语义截断（12abc 得 12）", () => {
    expect(normalizePositiveInt("12abc", 5)).toBe(12);
  });
});

describe("isJsonObject", () => {
  it("只认非 null、非数组的对象", () => {
    expect(isJsonObject({})).toBe(true);
    expect(isJsonObject({ a: 1 })).toBe(true);
    expect(isJsonObject([])).toBe(false);
    expect(isJsonObject(null)).toBe(false);
    expect(isJsonObject("x")).toBe(false);
    expect(isJsonObject(1)).toBe(false);
    expect(isJsonObject(undefined)).toBe(false);
  });
});

describe("isSha256Hex", () => {
  it("接受 64 位十六进制（大小写均可）", () => {
    expect(isSha256Hex("a".repeat(64))).toBe(true);
    expect(isSha256Hex("A".repeat(64))).toBe(true);
    expect(isSha256Hex("0123456789abcdef".repeat(4))).toBe(true);
  });

  it("拒绝长度不对或含非十六进制字符的值", () => {
    expect(isSha256Hex("a".repeat(63))).toBe(false);
    expect(isSha256Hex("a".repeat(65))).toBe(false);
    expect(isSha256Hex("g".repeat(64))).toBe(false);
    expect(isSha256Hex("")).toBe(false);
  });
});

describe("getRequestSite", () => {
  const req = (headers: Record<string, string>) =>
    new Request("https://t.paiii.cn/api/random", { headers });

  it("优先取 Origin，并转小写", () => {
    expect(getRequestSite(req({ Origin: "https://Example.COM" }))).toBe("example.com");
  });

  it("带端口时保留端口", () => {
    expect(getRequestSite(req({ Origin: "http://localhost:3000" }))).toBe("localhost:3000");
  });

  it("没有 Origin 时回落到 Referer", () => {
    expect(getRequestSite(req({ Referer: "https://example-b.test/docs/page" }))).toBe(
      "example-b.test",
    );
  });

  it("非 http(s) 来源与非法来源一律返回 null（不计入站点统计）", () => {
    expect(getRequestSite(req({ Origin: "data:text/plain,bad" }))).toBeNull();
    expect(getRequestSite(req({ Origin: "not a url" }))).toBeNull();
    expect(getRequestSite(req({}))).toBeNull();
  });
});
