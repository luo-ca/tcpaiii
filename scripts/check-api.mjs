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
  // 状态码必须先查。原先只查 content-type 与「是不是 HTML」，于是
  // 「500 + application/json + {"error":"..."}」会一路通过：
  // 实测 /api/stats 恒 500、其余接口正常时，脚本打印 "stats: 500" 却
  // 以退出码 0 收场 —— 首页的「实时统计」整块是坏的，而体检报绿。
  // 这与 P155 修的「首屏坏了不再假绿」是同一类盲区，只是漏了状态码这一维。
  if (!response.ok) {
    fail(`${label} returned HTTP ${response.status}, expected 2xx`);
  }

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
  if (!Array.isArray(stats?.tags)) {
    fail(`stats.tags 应为数组，实际是 ${typeof stats?.tags}`);
  }

  const randomJson = await expectJson('/api/random?format=json', 'random json');
  // 只要求「是 JSON」不够：图库为空时后端返回 404 {"error":"No images available"}，
  // 形状完全合法。这里要求它真是一张图 —— 有 url 才算接口可用。
  if (typeof randomJson?.url !== 'string' || !randomJson.url) {
    fail(`random json 缺少 url 字段，实际是 ${JSON.stringify(randomJson)}`);
  }
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

  const tags = stats.tags;
  console.log(`tags: ${tags.join(', ') || '(none)'}`);

  const tagToCheck = tags.includes('acg') ? 'acg' : tags[0];
  if (tagToCheck) {
    await expectRedirect(`/api/random?tag=${encodeURIComponent(tagToCheck)}`, `tag redirect (${tagToCheck})`);
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
