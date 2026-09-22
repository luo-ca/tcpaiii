// ============================================================
// Application Constants
// ============================================================

export const APP_NAME = '派次元 API';
export const APP_FALLBACK_DOMAIN = 'https://t.paiii.cn';
export const APP_LOGO_URL = 'https://imgs.paiii.cn/logo.svg';

/**
 * 首屏主视觉不再使用任何第三方「文生图」接口。
 *
 * 原先那个 trae text_to_image 地址实测会 302 到
 * `lf-cdn.trae.com.cn/obj/trae-ai-image/page_image/default.jpeg` ——
 * 一个写着「image is generating，请刷新页面预览」的通用占位图，
 * 既不是二次元插画，也永远不会变成成品图。
 *
 * 现在的做法：HeroSection 走 `/api/list` 拿图库里的真实图片（该接口不写调用统计），
 * 取不到就交给品牌渐变兜底。见 `HeroSection.tsx`。
 */
export const EDGEONE_LOGO_URL = 'https://edgeone.ai/_next/static/media/headLogo.daeb48ad.png';
export const EDGEONE_PREVIEW_QUERY_KEYS = ['eo_token', 'eo_time'] as const;

export const API_HTML_FALLBACK_MESSAGE =
  '接口返回的是 HTML 而不是 JSON，请检查 Edge 函数是否已正确部署。';

export const MAX_BATCH_IMAGE_COUNT = 500;
/**
 * 标题 / 标签的输入上限，与后端逐字对齐（`edge-functions-src/lib/types.ts`）。
 * 后端是 `slice` 静默截断而不是报错：前端不拦住的话，用户输入的
 * 和实际落库的会悄悄不一致，所以表单按同样的值封顶。
 */
export const MAX_TITLE_LENGTH = 120;
export const MAX_TAG_LENGTH = 40;
export const MAX_TAGS_PER_IMAGE = 20;
/** 图片 URL 硬上限（后端 normalizeImageUrl 同规则，超长直接拒）。 */
export const MAX_IMAGE_URL_LENGTH = 2048;
/** 搜索词长度上限：后端进全列表扫描前截到 100，输入框同值封顶。 */
export const MAX_SEARCH_LENGTH = 100;

/**
 * 统计口径时区。必须与后端 edge-functions-src/lib/types.ts 的
 * STATS_TIME_ZONE 保持一致 —— 服务端按它给 dailyRequests 分桶，
 * 前端任何「把某天显示给人看」的地方也要按它渲染，否则会出现
 * 「今日调用 61 · 2026/9/21」这种日期与标签互相打架的显示。
 */
export const STATS_TIME_ZONE = 'Asia/Shanghai';
export const GALLERY_PAGE_SIZE = 24;
export const GALLERY_PAGE_SIZE_OPTIONS = [12, 24, 48] as const;

import type { RoutePath } from './router';
import { Activity, Code, Image, Shuffle } from 'lucide-react';

/** 顶栏导航。`path` 直接就是地址栏里的路径，可分享、可被爬虫抓取。 */
export const HEADER_TABS: Array<{ path: RoutePath; label: string; icon: typeof Shuffle }> = [
  { path: '/', label: '随机', icon: Shuffle },
  { path: '/gallery', label: '图库', icon: Image },
  { path: '/docs', label: 'API 文档', icon: Code },
  { path: '/status', label: '状态', icon: Activity },
];
