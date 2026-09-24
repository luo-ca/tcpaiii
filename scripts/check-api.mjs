const BASE_URL = process.env.API_BASE_URL ?? 'https://t.paiii.cn';

/** @param {string} message */
function fail(message) {
  throw new Error(message);
}

/**
 * @param {Response} response
 * @param {string} body
 * @param {string} label
 */
function assertJsonResponse(response, body, label) {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    fail(`${label} returned ${contentType || 'no content-type'}, expected application/json`);
  }

  if (body.trim().startsWith('<')) {
    fail(`${label} returned HTML instead of JSON`);
  }
}

/**
 * @param {string} path
 * @param {RequestInit} [init]
 */
async function fetchText(path, init) {
  const response = await fetch(`${BASE_URL}${path}`, init);
  const body = await response.text();
  return { response, body };
}

/**
 * @param {string} path
 * @param {string} label
 */
async function expectJson(path, label) {
  const { response, body } = await fetchText(path);
  console.log(`${label}: ${response.status} ${response.headers.get('content-type') ?? ''}`);
  console.log(body.slice(0, 300));

  assertJsonResponse(response, body, label);
  return JSON.parse(body);
}

/**
 * @param {string} path
 * @param {string} label
 */
async function expectRedirect(path, label) {
  const response = await fetch(`${BASE_URL}${path}`, { redirect: 'manual' });
  const location = response.headers.get('location');
  console.log(`${label}: ${response.status} ${location ?? ''}`);

  if (response.status !== 302 || !location) {
    fail(`${label} should return 302 with a Location header`);
  }
}

try {
  const stats = await expectJson('/api/stats', 'stats');
  await expectJson('/api/random?format=json', 'random json');
  await expectRedirect('/api/random', 'random redirect');

  // 首屏依赖的两个读接口 —— 漏了它们，脚本会在「首页取不到图」时依然全绿。
  // /api/health：状态页第一屏 + 线上排障入口。
  // /api/list：首页「最新收录」「Hero 主视觉」与 /gallery 的唯一取图接口。
  const health = await expectJson('/api/health', 'health');
  if (health?.ok !== true) {
    fail(`health.ok 应为 true，实际是 ${JSON.stringify(health?.ok)}`);
  }
  if (typeof health?.buildId !== 'string' || !health.buildId) {
    fail('health.buildId 缺失：无法确认线上跑的是哪个版本');
  }

  const list = await expectJson('/api/list?page=1&pageSize=1', 'list');
  if (!Array.isArray(list?.items)) {
    fail(`list.items 应为数组，实际是 ${typeof list?.items}`);
  }
  if (typeof list?.total !== 'number') {
    fail(`list.total 应为数字，实际是 ${typeof list?.total}`);
  }

  const tags = Array.isArray(stats.tags) ? stats.tags : [];
  console.log(`tags: ${tags.join(', ') || '(none)'}`);

  const tagToCheck = tags.includes('acg') ? 'acg' : tags[0];
  if (tagToCheck) {
    await expectRedirect(`/api/random?tag=${encodeURIComponent(tagToCheck)}`, `tag redirect (${tagToCheck})`);
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
