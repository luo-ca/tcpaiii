import { afterEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

import { copyText } from "@/lib/helpers";
import { copyToClipboard } from "@/lib/utils";

/**
 * 剪贴板写入的两层实现。
 *
 * `copyToClipboard`（utils）负责「先试异步 Clipboard API，失败退到 execCommand」；
 * `copyText`（helpers）在它之上加 toast 反馈，并把失败原因过 getErrorMessage。
 *
 * 这条路径此前只有源码级断言（「按钮用了 useCopyFeedback」「不再裸调 copyText」），
 * 从没驱动过真实分支。而它恰好有三个容易静默出错的分支：
 *   · Clipboard API 存在但被拒（非安全上下文 / 权限拒绝）—— 必须退到兜底；
 *   · execCommand 返回 false —— 必须当作失败，不能谎报「已复制」；
 *   · 兜底用的 textarea 必须从 DOM 上摘掉（否则每次复制都留一个隐藏节点）。
 *
 * 项目没有 jsdom，这里用最小替身打桩 document / navigator —— 被驱动的是
 * 我们自己的逻辑，不是 DOM 语义。
 */

type FakeTextarea = {
  value: string;
  style: Record<string, string>;
  focus: () => void;
  select: () => void;
};

function stubClipboard(writeText?: () => Promise<void>) {
  vi.stubGlobal(
    "navigator",
    writeText ? { clipboard: { writeText: vi.fn(writeText) } } : {},
  );
}

function stubDocument(execCommandResult: boolean) {
  const appended: FakeTextarea[] = [];
  const removed: FakeTextarea[] = [];
  vi.stubGlobal("document", {
    createElement: () => {
      const el: FakeTextarea = {
        value: "",
        style: {},
        focus: () => undefined,
        select: () => undefined,
      };
      appended.push(el);
      return el;
    },
    body: {
      appendChild: () => undefined,
      removeChild: (el: FakeTextarea) => void removed.push(el),
    },
    execCommand: vi.fn(() => execCommandResult),
  });
  return { appended, removed };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("copyToClipboard", () => {
  it("Clipboard API 可用时直接写入，不走兜底", async () => {
    stubClipboard(async () => undefined);
    const { appended } = stubDocument(true);
    await copyToClipboard("文本");
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("文本");
    expect(appended, "Clipboard API 成功时不该再建 textarea").toHaveLength(0);
  });

  it("Clipboard API 抛错时退到 execCommand，且仍算成功", async () => {
    stubClipboard(async () => {
      throw new Error("NotAllowedError");
    });
    const { appended } = stubDocument(true);
    await expect(copyToClipboard("文本")).resolves.toBeUndefined();
    expect(appended).toHaveLength(1);
    expect(appended[0].value).toBe("文本");
  });

  it("没有 Clipboard API 时同样走兜底", async () => {
    stubClipboard();
    const { appended } = stubDocument(true);
    await copyToClipboard("文本");
    expect(appended).toHaveLength(1);
  });

  it("execCommand 返回 false 时抛中文错误（不能谎报复制成功，也不能漏英文）", async () => {
    stubClipboard();
    stubDocument(false);
    await expect(copyToClipboard("文本")).rejects.toThrow(/浏览器拒绝了剪贴板写入/);
  });

  it("无论成功失败，临时 textarea 都会从 DOM 上摘掉", async () => {
    stubClipboard();
    const { appended, removed } = stubDocument(false);
    await expect(copyToClipboard("文本")).rejects.toThrow();
    expect(appended).toHaveLength(1);
    expect(removed, "兜底节点泄漏：每次复制都留一个隐藏 textarea").toHaveLength(1);
  });

  it("textarea 被移到视口外且透明（不能闪一下、也不能影响布局）", async () => {
    stubClipboard();
    const { appended } = stubDocument(true);
    await copyToClipboard("文本");
    expect(appended[0].style.position).toBe("fixed");
    expect(appended[0].style.opacity).toBe("0");
  });
});

describe("copyText", () => {
  it("成功时弹默认成功提示并返回 true", async () => {
    const success = vi.spyOn(toast, "success");
    stubClipboard(async () => undefined);
    stubDocument(true);
    await expect(copyText("文本")).resolves.toBe(true);
    expect(success).toHaveBeenCalledWith("已复制到剪贴板");
  });

  it("调用方给了自定义成功文案时用它", async () => {
    const success = vi.spyOn(toast, "success");
    stubClipboard(async () => undefined);
    stubDocument(true);
    await copyText("文本", "链接已复制");
    expect(success).toHaveBeenCalledWith("链接已复制");
  });

  it("失败时弹中文错误提示并返回 false（不抛给调用方）", async () => {
    const error = vi.spyOn(toast, "error");
    stubClipboard();
    stubDocument(false);
    await expect(copyText("文本")).resolves.toBe(false);
    expect(error).toHaveBeenCalledTimes(1);
    const message = error.mock.calls[0][0] as string;
    expect(message).toMatch(/[\u4e00-\u9fa5]/);
  });

  it("execCommand 失败时给出中文兜底提示（英文原文不进中文界面）", async () => {
    const error = vi.spyOn(toast, "error");
    stubClipboard(async () => {
      throw new TypeError("Failed to fetch");
    });
    stubDocument(false);
    await copyText("文本");
    expect(error).toHaveBeenCalledTimes(1);
    const message = error.mock.calls[0][0] as string;
    expect(message).toMatch(/[\u4e00-\u9fa5]/);
    // 兜底路径的原始错误也必须中文化：Clipboard API 被拒后 execCommand 又失败，
    // 抛出的文案会经 getErrorMessage 原样进 toast。
    expect(message).not.toMatch(/Clipboard access was rejected/);
  });
});
