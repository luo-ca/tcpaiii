const BASE_URL = process.env.API_BASE_URL ?? 'https://t.paiii.cn';

function fail(message) {
  throw new Error(message);
}

function assertJsonResponse(response, body, label) {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    fail(`${label} returned ${contentType || 'no content-type'}, expected application/json`);
  }

  if (body.trim().startsWith('<')) {
    fail(`${label} returned HTML instead of JSON`);
  }
}

async function fetchText(path, init) {
  const response = await fetch(`${BASE_URL}${path}`, init);
  const body = await response.text();
  return { response, body };
}

async function expectJson(path, label) {
  const { response, body } = await fetchText(path);
  console.log(`${label}: ${response.status} ${response.headers.get('content-type') ?? ''}`);
  console.log(body.slice(0, 300));

  assertJsonResponse(response, body, label);
  return JSON.parse(body);
}

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
