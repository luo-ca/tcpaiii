import { useEffect } from 'react';
import { useRoute, type RoutePath } from '@/lib/router';

/**
 * 按路由同步文档元信息。
 *
 * `index.html` 只有一份，静态写死的 `canonical` / `og:url` 会让 /docs 和 /gallery
 * 在搜索引擎眼里都"等于"首页 —— 那是重复内容。这里在路由切换时把
 * title / description / canonical / og:url 一并改掉。
 *
 * 注意：这只对已经能执行 JS 的爬虫（Googlebot、Bingbot）有效；
 * 社交媒体抓取器不跑 JS，仍会看到 index.html 里的默认值 —— 这是 SPA 的固有取舍。
 */
const SITE_ORIGIN = 'https://t.paiii.cn';

const ROUTE_META: Record<RoutePath, { title: string; description: string; noindex?: boolean }> = {
  '/': {
    title: '派次元 API - 免费随机图片接口 | 稳定高速图片 API 服务',
    description:
      '派次元 API 提供免费、稳定、高速的随机图片接口服务。支持标签分类筛选、302 图片直链、JSON 返回与实时调用统计，由腾讯云 EdgeOne Pages 驱动。',
  },
  '/gallery': {
    title: '二次元图库 - 派次元 API',
    description:
      '浏览派次元图库：按标签筛选二次元插画、壁纸与头像，点任意一张查看原图。所有图片都可通过随机图片 API 直接调用。',
  },
  '/docs': {
    title: 'API 文档 - 派次元 API',
    description:
      '派次元随机图片 API 完整文档：基础调用、分类参数、JSON 返回格式与高级用法。复制即可接入，无需申请 Key。',
  },
  '/admin': {
    title: '图库管理 - 派次元 API',
    description: '派次元图库管理后台：外链图片的批量导入、标签归档与检索。',
    // 管理后台不该出现在搜索结果里
    noindex: true,
  },
};

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  let element = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attr, key);
    document.head.appendChild(element);
  }
  element.setAttribute('content', content);
}

function upsertCanonical(href: string) {
  let link = document.head.querySelector('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    document.head.appendChild(link);
  }
  link.setAttribute('href', href);
}

export function useRouteMeta() {
  const route = useRoute();

  useEffect(() => {
    const meta = ROUTE_META[route];
    const url = route === '/' ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}${route}`;

    document.title = meta.title;

    // 管理后台 noindex，其余页面恢复 index,follow
    upsertMeta('name', 'robots', meta.noindex ? 'noindex, nofollow' : 'index, follow');

    upsertCanonical(url);
    upsertMeta('name', 'description', meta.description);
    upsertMeta('property', 'og:url', url);
    upsertMeta('property', 'og:title', meta.title);
    upsertMeta('property', 'og:description', meta.description);
    upsertMeta('name', 'twitter:url', url);
    upsertMeta('name', 'twitter:title', meta.title);
    upsertMeta('name', 'twitter:description', meta.description);
  }, [route]);
}
