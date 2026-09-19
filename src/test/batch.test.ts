import { describe, expect, it } from "vitest";

import { canonicalizeImageUrl, parseBatchUrls } from "@/lib/helpers";

describe("canonicalizeImageUrl", () => {
  it("trims whitespace and keeps valid http(s) URLs", () => {
    expect(canonicalizeImageUrl("  https://cdn.example.test/a.jpg  ")).toBe(
      "https://cdn.example.test/a.jpg",
    );
  });

  it("rejects non-http URLs, credentials, and garbage", () => {
    expect(canonicalizeImageUrl("javascript:alert(1)")).toBeNull();
    expect(canonicalizeImageUrl("https://user:pass@cdn.example.test/a.jpg")).toBeNull();
    expect(canonicalizeImageUrl("not a url")).toBeNull();
    expect(canonicalizeImageUrl("")).toBeNull();
  });

  it("rejects URLs past the backend's 2048-char cap", () => {
    const longUrl = `https://cdn.example.test/${"x".repeat(2100)}.jpg`;
    expect(canonicalizeImageUrl(longUrl)).toBeNull();
  });
});

describe("parseBatchUrls", () => {
  it("accepts newlines, spaces, and commas as separators", () => {
    const result = parseBatchUrls(
      "https://cdn.example.test/a.jpg\nhttps://cdn.example.test/b.jpg, https://cdn.example.test/c.jpg",
    );
    expect(result.validNew).toHaveLength(3);
    expect(result.invalid).toHaveLength(0);
  });

  it("flags in-batch duplicates after canonicalization", () => {
    const result = parseBatchUrls(
      "https://cdn.example.test/a.jpg\n  https://cdn.example.test/a.jpg  ",
    );
    expect(result.validNew).toHaveLength(1);
    expect(result.duplicatesInBatch).toEqual(["https://cdn.example.test/a.jpg"]);
  });

  it("flags URLs already in the gallery instead of importing them", () => {
    const existing = new Set(["https://cdn.example.test/old.jpg"]);
    const result = parseBatchUrls(
      "https://cdn.example.test/old.jpg\nhttps://cdn.example.test/new.jpg",
      existing,
    );
    expect(result.validNew).toEqual(["https://cdn.example.test/new.jpg"]);
    expect(result.alreadyExists).toEqual(["https://cdn.example.test/old.jpg"]);
  });

  it("collects invalid lines separately", () => {
    const result = parseBatchUrls("https://cdn.example.test/ok.jpg\njavascript:alert(1)");
    expect(result.validNew).toEqual(["https://cdn.example.test/ok.jpg"]);
    expect(result.invalid).toEqual(["javascript:alert(1)"]);
  });

  it("classifies oversized URLs as invalid so pre-check matches the backend", () => {
    const longUrl = `https://cdn.example.test/${"y".repeat(2100)}.jpg`;
    const result = parseBatchUrls(`https://cdn.example.test/ok.jpg\n${longUrl}`);
    expect(result.validNew).toEqual(["https://cdn.example.test/ok.jpg"]);
    expect(result.invalid).toEqual([longUrl]);
  });
});
