import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";

import type { ImageRecord } from "@/lib/types";
import { ImageCard } from "@/features/admin/image-card";
import { BatchUpdateTagsDialog } from "@/features/admin/batch-update-tags-dialog";

/**
 * 后台组件的真实渲染测试（P51，清单项 6）。
 *
 * 仓库此前的 UI「测试」全是源码文本断言 —— 正则匹配得再准，组件从挂载到
 * 报错、hooks 顺序错、provider 缺失这类真崩溃是发现不了的。本文件用
 * react-dom/server 把拆出来的 admin 子模块真的渲染一遍（无新增依赖，
 * Node 环境即可），钉住四条「源码正则看不见」的契约：
 *   1. ImageCard 在 QueryClientProvider 之外根本挂不起来（EditImageDialog
 *      用 useMutation）—— 挂载点必须始终在 provider 内，这条防的是未来的
 *      调用方（比如把卡片搬去别的页面）忘了包 provider 就直接白屏；
 *   2. eager / lazy 的取源行为真实生效：index<6 渲染 <img src>，
 *      index≥6 停在 idle 不渲染 <img>（此前只有正则「推导式含 eager」，
 *      推导写错但语法合法时正则照样绿）；
 *   3. 选择模式的 aria-pressed / aria-label 随 selected 翻转 —— 读屏用户
 *      判断勾选状态全靠这两个属性；
 *   4. BatchUpdateTagsDialog 关闭态只渲染触发器：表单（含 id 为
 *      batch-add-tags 的输入框）必须完全不出现 —— Radix 关着的 Dialog
 *      若被改成 forceMount，隐藏的输入框会留在 Tab 序里。
 */

function makeImage(overrides: Partial<ImageRecord> = {}): ImageRecord {
  return {
    id: "img-1",
    url: "https://cdn.example.com/a.jpg",
    title: "山与雾",
    tags: ["风景", "natural"],
    createdAt: "2026-01-02T03:04:05.000Z",
    ...overrides,
  };
}

function renderWithQueryClient(node: ReactNode): string {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return renderToStaticMarkup(createElement(QueryClientProvider, { client }, node));
}

const noop = () => undefined;

function cardProps(
  img: ImageRecord,
  extra: Partial<React.ComponentProps<typeof ImageCard>> = {},
) {
  return {
    img,
    index: 0,
    adminToken: "tok",
    onCopyUrl: noop,
    onDelete: noop,
    onRefresh: noop,
    onRequireToken: async () => true,
    isDeleting: false,
    selectable: false,
    selected: false,
    onToggleSelect: noop,
    ...extra,
  } as const;
}

describe("ImageCard 真实渲染", () => {
  it("eager（index<6）渲染带 src 的 <img>；index≥6 停在 idle 不渲染 <img>", () => {
    const eagerHtml = renderWithQueryClient(createElement(ImageCard, cardProps(makeImage())));
    expect(eagerHtml).toContain('<img src="https://cdn.example.com/a.jpg"');

    const lazyHtml = renderWithQueryClient(
      createElement(ImageCard, cardProps(makeImage(), { index: 7 })),
    );
    // idle 卡只该有骨架屏，不该已经开始下载
    expect(lazyHtml).not.toContain("<img");
    expect(lazyHtml).toContain("skeleton-shimmer");
  });

  it("选择模式下复选框的 aria 状态随 selected 翻转", () => {
    const checked = renderWithQueryClient(
      createElement(ImageCard, cardProps(makeImage(), { selectable: true, selected: true })),
    );
    expect(checked).toContain('aria-pressed="true"');
    expect(checked).toContain("取消选择：山与雾");
    // 选中卡有可见的描边高亮
    expect(checked).toContain("ring-2");

    const unchecked = renderWithQueryClient(
      createElement(ImageCard, cardProps(makeImage(), { selectable: true, selected: false })),
    );
    expect(unchecked).toContain('aria-pressed="false"');
    expect(unchecked).toContain("选择：山与雾");
    expect(unchecked).not.toContain("ring-2");

    // 非选择模式：复选框整个不存在，也不该有描边
    const plain = renderWithQueryClient(createElement(ImageCard, cardProps(makeImage())));
    expect(plain).not.toContain("aria-pressed");
  });

  it("无标题图片的复选框 aria-label 落到「未命名图片」兜底", () => {
    const html = renderWithQueryClient(
      createElement(
        ImageCard,
        cardProps(makeImage({ title: "" }), { selectable: true, selected: false }),
      ),
    );
    expect(html).toContain("选择：未命名图片");
  });

  it("渲染完整交互链路：复制/编辑/删除触发器与标签 chips 都在 DOM 里", () => {
    const html = renderWithQueryClient(createElement(ImageCard, cardProps(makeImage())));
    expect(html).toContain("复制图片地址：山与雾");
    expect(html).toContain("编辑图片：山与雾");
    expect(html).toContain("删除图片：山与雾");
    expect(html).toContain(">风景</span>");
    expect(html).toContain(">natural</span>");
    // 标题必须是 h3（文档大纲钉过的顺序契约，见 P29 注释）
    expect(html).toContain("<h3");
  });

  it("删除进行中的卡片：按钮禁用且 aria-label 换成进行时文案", () => {
    const html = renderWithQueryClient(
      createElement(ImageCard, cardProps(makeImage(), { isDeleting: true })),
    );
    expect(html).toContain("正在删除：山与雾");
    expect(html).toContain("disabled");
    expect(html).not.toContain("删除图片：山与雾");
  });

  it("前提守卫：卡片在 QueryClientProvider 之外会直接崩（挂载点必须包 provider）", () => {
    // 契约 1：EditImageDialog 的 useMutation 依赖 provider。
    // 若哪天有人把卡片从 admin 页里拆去别处渲染而忘了包 provider，
    // 这里抛的「No QueryClient set」就是白屏事故的预演。
    expect(() =>
      renderToStaticMarkup(createElement(ImageCard, cardProps(makeImage()))),
    ).toThrow(/QueryClient/);
  });
});

describe("BatchUpdateTagsDialog 真实渲染", () => {
  it("关闭态只渲染触发器，表单与提示文本完全不出现", () => {
    const html = renderWithQueryClient(
      createElement(
        BatchUpdateTagsDialog,
        {
          ids: ["a", "b", "c"],
          adminToken: "tok",
          onSuccess: noop,
          onRequireToken: async () => true,
          children: createElement("button", { type: "button" }, "应用到 3 张"),
        },
      ),
    );
    // 触发器原样透传（DialogTrigger asChild 不该包出第二层按钮）
    expect(html).toContain("<button");
    expect(html).not.toContain("<button><button");
    expect(html).toContain("应用到 3 张");
    // 关着的弹窗不得往文档里留隐藏表单（Radix 卸载而非 display:none）
    expect(html).not.toContain("batch-add-tags");
    expect(html).not.toContain("batch-remove-tags");
    expect(html).not.toContain("移除不区分大小写");
  });
});
