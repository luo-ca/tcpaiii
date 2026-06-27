// ============================================================
// Application Constants
// ============================================================

export const APP_NAME = '派次元 API';
export const APP_FALLBACK_DOMAIN = 'https://t.paiii.cn';
export const APP_LOGO_URL = 'https://static.paiii.cn/logo.svg';
export const HERO_FALLBACK_IMAGE_URL =
  'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=cinematic%20anime%20illustration%20of%20two%20original%20girls%20in%20a%20soft%20blue%20evening%20city%20scene%2C%20detailed%20kimono%20and%20modern%20street%20lights%2C%20warm%20smile%2C%20floating%20petals%2C%20high%20quality%20website%20hero%20background%2C%20wide%20composition%2C%20no%20text%2C%20no%20logo&image_size=landscape_16_9';
export const EDGEONE_LOGO_URL = 'https://edgeone.ai/_next/static/media/headLogo.daeb48ad.png';
export const EDGEONE_PREVIEW_QUERY_KEYS = ['eo_token', 'eo_time'] as const;

export const API_HTML_FALLBACK_MESSAGE =
  'API returned HTML instead of JSON. Please check whether the Edge function is deployed correctly.';

export const MAX_BATCH_IMAGE_COUNT = 500;
export const GALLERY_PAGE_SIZE = 24;
export const GALLERY_PAGE_SIZE_OPTIONS = [12, 24, 36, 60] as const;

import type { AppTab } from './types';
import { Code, Image, Shuffle } from 'lucide-react';

export const HEADER_TABS: Array<{ key: AppTab; label: string; icon: typeof Shuffle }> = [
  { key: 'random', label: '随机', icon: Shuffle },
  { key: 'gallery', label: '图库', icon: Image },
  { key: 'docs', label: 'API 文档', icon: Code },
];
